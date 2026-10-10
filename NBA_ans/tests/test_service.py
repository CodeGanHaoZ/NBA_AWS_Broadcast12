# -*- coding: utf-8 -*-
"""服务层测试: job_id 内容寻址、覆盖语义、运行中复用与接口校验。"""
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

import service.jobs as jobs_module
from service.jobs import JobManager, make_job_id


class FakeRunner:
    """替代真实子进程: 可控延迟, 写出四个结果文件。"""

    delay_event = None
    calls = 0

    def __init__(self, input_path, output_dir, config_path=None, team_profiles_path=None,
                 details=False, on_update=None):
        self.output_dir = Path(output_dir)
        self.on_update = on_update or (lambda progress, stage: None)

    def run(self):
        FakeRunner.calls += 1
        self.on_update(50, 'fake stage')
        if FakeRunner.delay_event is not None:
            FakeRunner.delay_event.wait()
        self.output_dir.mkdir(parents=True, exist_ok=True)
        for name in jobs_module.RESULT_NAMES:
            (self.output_dir / name).write_bytes(b'fake')
        return 0, ''


class ServiceTestCase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.patches = [
            patch.object(jobs_module, 'INPUT_DIR', root / 'inputs'),
            patch.object(jobs_module, 'OUTPUT_ROOT', root / 'outputs'),
            patch.object(jobs_module, 'JOBS_FILE', root / 'jobs.json'),
            patch.object(jobs_module, 'AnalysisRunner', FakeRunner),
        ]
        for item in self.patches:
            item.start()
        FakeRunner.calls = 0
        FakeRunner.delay_event = None
        self.video = root / 'video.mp4'
        self.video.write_bytes(b'fake-video-content')
        self.manager = JobManager()
        self.manager.start_worker()

    def tearDown(self):
        for item in self.patches:
            item.stop()
        self.temporary.cleanup()

    def test_job_id_is_content_addressed(self):
        other = Path(self.temporary.name) / 'copy.mp4'
        other.write_bytes(b'fake-video-content')
        self.assertEqual(make_job_id(self.video), make_job_id(other))
        self.assertNotEqual(make_job_id(self.video), make_job_id(self.video, config='{"ball_confidence": 0.1}'))
        self.assertNotEqual(make_job_id(self.video), make_job_id(other, config='{"ball_confidence": 0.2}'))
        self.assertNotEqual(make_job_id(self.video), make_job_id(self.video, details=True))

    def test_run_completes_with_result_paths(self):
        record = self.manager.submit(str(self.video))
        job_id = record['job_id']
        for _ in range(100):
            current = self.manager.get(job_id)
            if current['status'] == 'done':
                break
            threading.Event().wait(0.05)
        self.assertEqual(current['status'], 'done')
        self.assertEqual(current['progress'], 100)
        self.assertEqual(sorted(current['result']), sorted(jobs_module.RESULT_NAMES))
        for path in current['result'].values():
            self.assertTrue(Path(path).is_file())

    def test_resubmit_done_job_overwrites_output(self):
        job_id = self.manager.submit(str(self.video))['job_id']
        for _ in range(100):
            if self.manager.get(job_id)['status'] == 'done':
                break
            threading.Event().wait(0.05)
        marker = jobs_module.OUTPUT_ROOT / job_id / 'marker.txt'
        marker.write_text('old output')
        second = self.manager.submit(str(self.video))
        self.assertEqual(second['job_id'], job_id)  # 同内容同任务
        for _ in range(100):
            current = self.manager.get(job_id)
            if current['status'] == 'done' and current['finished_at'] != self.manager.get(job_id)['started_at']:
                break
            threading.Event().wait(0.05)
        self.assertFalse(marker.exists())  # 旧输出已被清空覆盖
        self.assertEqual(FakeRunner.calls, 2)  # 确实重跑了

    def test_resubmit_running_job_is_reused(self):
        FakeRunner.delay_event = threading.Event()
        first = self.manager.submit(str(self.video))
        for _ in range(100):
            if self.manager.get(first['job_id'])['status'] == 'running':
                break
            threading.Event().wait(0.05)
        second = self.manager.submit(str(self.video))
        self.assertEqual(second['job_id'], first['job_id'])
        self.assertEqual(second['status'], 'running')
        self.assertEqual(self.manager.pending.qsize(), 0)  # 没有重复入队
        FakeRunner.delay_event.set()
        for _ in range(100):
            if self.manager.get(first['job_id'])['status'] == 'done':
                break
            threading.Event().wait(0.05)
        self.assertEqual(FakeRunner.calls, 1)  # 只跑了一次

    def test_persisted_interrupted_job_marked_error(self):
        record = {
            'job_id': 'abc123', 'status': 'running', 'progress': 10, 'stage': 'mid',
            'input_path': 'x.mp4', 'details': False, 'config_path': None,
            'team_profiles_path': None, 'created_at': 't', 'started_at': 't',
            'finished_at': None, 'result': None, 'error': None,
        }
        jobs_module.JOBS_FILE.parent.mkdir(parents=True, exist_ok=True)
        jobs_module.JOBS_FILE.write_text(json.dumps({'abc123': record}), encoding='utf-8')
        restored = JobManager()
        self.assertEqual(restored.get('abc123')['status'], 'error')
        self.assertIn('中断', restored.get('abc123')['error'])


class ApiValidationTests(unittest.TestCase):
    """接口层校验 (不触发真实分析)。"""

    def setUp(self):
        from service.app import app
        self.client = app.test_client()

    def test_submit_requires_video(self):
        response = self.client.post('/jobs', data={})
        self.assertEqual(response.status_code, 400)
        self.assertIn('video', response.get_json()['error'])

    def test_submit_rejects_invalid_config_json(self):
        response = self.client.post('/jobs', data={'video_path': 'C:/no/such/file.mp4',
                                                   'config': '{not json'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('JSON', response.get_json()['error'])

    def test_unknown_job_and_file_not_found(self):
        self.assertEqual(self.client.get('/jobs/deadbeef').status_code, 404)
        self.assertEqual(self.client.get('/jobs/deadbeef/files/output.avi').status_code, 404)


if __name__ == '__main__':
    unittest.main()
