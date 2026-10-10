# -*- coding: utf-8 -*-
"""任务管理: 内容寻址 job_id、串行队列、状态记录与持久化。

覆盖语义: job_id = SHA256(视频内容 + 参数)。重复提交同内容时:
- 任务在队列/运行中 -> 复用当前任务, 不重复执行
- 任务已结束       -> 清空旧输出, 重新排队运行(覆盖)
"""
import hashlib
import json
import queue
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path

from .runner import AnalysisRunner

DATA_ROOT = Path(__file__).resolve().parents[1] / 'data'
INPUT_DIR = DATA_ROOT / 'inputs'
OUTPUT_ROOT = DATA_ROOT / 'outputs'
JOBS_FILE = DATA_ROOT / 'jobs.json'

# 服务对外交付的文件 (调试文件仍写盘排障, 但不通过接口暴露)
RESULT_NAMES = ('output.avi', 'output.tactical.json')


def file_digest(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def make_job_id(video_path, config=None, team_profiles=None, details=False):
    """同视频内容 + 同参数 => 同 job_id (内容寻址)。"""
    params = json.dumps({'config': config, 'team_profiles': team_profiles,
                         'details': bool(details)}, sort_keys=True, ensure_ascii=False)
    material = file_digest(video_path) + '|' + params
    return hashlib.sha256(material.encode('utf-8')).hexdigest()[:20]


class JobManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.jobs = {}
        self.pending = queue.Queue()
        self.worker = None
        INPUT_DIR.mkdir(parents=True, exist_ok=True)
        OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
        self._load_persisted()

    # ---------- 持久化 ----------

    def _persist(self):
        snapshot = {job_id: {key: value for key, value in record.items() if key != 'thread'}
                    for job_id, record in self.jobs.items()}
        JOBS_FILE.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding='utf-8')

    def _load_persisted(self):
        if not JOBS_FILE.exists():
            return
        try:
            persisted = json.loads(JOBS_FILE.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            return
        for job_id, record in persisted.items():
            # 上次进程遗留的排队/运行中任务已随进程消失
            if record.get('status') in ('queued', 'running'):
                record['status'] = 'error'
                record['error'] = '服务重启导致任务中断, 请重新提交'
            self.jobs[job_id] = record

    # ---------- 任务生命周期 ----------

    def submit(self, video_path, config=None, team_profiles=None, details=False):
        """提交任务, 返回任务记录。同内容重复提交按覆盖语义处理。"""
        job_id = make_job_id(video_path, config, team_profiles, details)
        with self.lock:
            existing = self.jobs.get(job_id)
            if existing and existing['status'] in ('queued', 'running'):
                return existing  # 复用进行中的任务
            record = {
                'job_id': job_id,
                'status': 'queued',
                'progress': 0,
                'stage': 'queued',
                'input_path': str(Path(video_path).resolve()),
                'details': bool(details),
                'config_path': None,
                'team_profiles_path': None,
                'created_at': datetime.now().isoformat(timespec='seconds'),
                'started_at': None,
                'finished_at': None,
                'result': None,
                'error': None,
            }
            self.jobs[job_id] = record
        output_dir = OUTPUT_ROOT / job_id
        if existing is not None:
            shutil.rmtree(output_dir, ignore_errors=True)  # 覆盖: 清空旧输出
        output_dir.mkdir(parents=True, exist_ok=True)
        if config:
            record['config_path'] = str(output_dir / 'config.json')
            (output_dir / 'config.json').write_text(config, encoding='utf-8')
        if team_profiles:
            record['team_profiles_path'] = str(output_dir / 'team_profiles.json')
            (output_dir / 'team_profiles.json').write_text(team_profiles, encoding='utf-8')
        self._persist()
        self.pending.put(job_id)
        return record

    def get(self, job_id):
        with self.lock:
            record = self.jobs.get(job_id)
            return dict(record) if record else None

    def list_jobs(self):
        with self.lock:
            return [dict(record) for record in self.jobs.values()]

    def output_dir(self, job_id):
        return OUTPUT_ROOT / job_id

    # ---------- 工作线程 ----------

    def start_worker(self):
        if self.worker and self.worker.is_alive():
            return
        self.worker = threading.Thread(target=self._work_loop, daemon=True, name='analysis-worker')
        self.worker.start()

    def _work_loop(self):
        while True:
            job_id = self.pending.get()
            with self.lock:
                record = self.jobs.get(job_id)
                if not record or record['status'] != 'queued':
                    continue  # 已被覆盖提交重置等
                record['status'] = 'running'
                record['started_at'] = datetime.now().isoformat(timespec='seconds')
                record['progress'] = 1
                record['stage'] = 'starting'
            self._persist()

            def update(progress, stage, job=job_id):
                with self.lock:
                    current = self.jobs.get(job)
                    if current and current['status'] == 'running':
                        current['progress'] = int(progress)
                        current['stage'] = stage

            runner = AnalysisRunner(record['input_path'], OUTPUT_ROOT / job_id,
                                    config_path=record.get('config_path'),
                                    team_profiles_path=record.get('team_profiles_path'),
                                    details=record['details'], on_update=update)
            exit_code, stderr_tail = runner.run()
            with self.lock:
                record = self.jobs[job_id]
                record['finished_at'] = datetime.now().isoformat(timespec='seconds')
                record['progress'] = 100 if exit_code == 0 else record['progress']
                if exit_code == 0:
                    record['status'] = 'done'
                    record['stage'] = 'done'
                    record['result'] = {name: str((OUTPUT_ROOT / job_id / name).resolve())
                                       for name in RESULT_NAMES}
                    record['error'] = None
                else:
                    record['status'] = 'error'
                    record['stage'] = 'failed'
                    record['error'] = stderr_tail or '分析进程退出码 {}'.format(exit_code)
            self._persist()
