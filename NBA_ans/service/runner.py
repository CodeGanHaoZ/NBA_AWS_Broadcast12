# -*- coding: utf-8 -*-
"""分析子进程封装: 调用 main.py, 解析 stdout 输出进度, 收集错误摘要。"""
import subprocess
import sys
import threading
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MAIN_PY = PROJECT_ROOT / 'main.py'

# 阶段标记 -> (起始进度, 结束进度); 渲染阶段单独按帧号插值
STAGE_MARKERS = [
    ('Player detection and tracking...', 10, 25),
    ('Ball detection...', 25, 45),
    ('Court keypoints...', 45, 58),
    ('Team assignment...', 58, 62),
    ('Tactical board JSON:', 62, 65),
]
RENDER_START, RENDER_SPAN = 65, 32
TIMEOUT_SECONDS = 30 * 60
STDERR_TAIL_BYTES = 2048


class AnalysisRunner:
    """运行一个分析任务并实时回报进度。

    进度协议(来自 main.py 的 stdout):
    - 'Video: {N} frames'      -> 2
    - 阶段标记行               -> 按权重表推进
    - 'Rendering {k}/{N}'      -> 渲染帧比例插值
    - 进程退出码 0             -> 100
    """

    def __init__(self, input_path, output_dir, config_path=None, team_profiles_path=None,
                 details=False, on_update=None):
        self.input_path = str(Path(input_path).resolve())
        self.output_dir = Path(output_dir)
        self.config_path = config_path
        self.team_profiles_path = team_profiles_path
        self.details = details
        self.on_update = on_update or (lambda progress, stage: None)
        self.progress = 0
        self.stage = 'starting'

    def _report(self, progress, stage):
        self.progress = max(self.progress, int(progress))
        self.stage = stage
        self.on_update(self.progress, self.stage)

    def _consume(self, line):
        line = line.strip()
        if not line:
            return
        if line.startswith('Video:') and 'frames' in line:
            self._report(2, 'reading video')
        for marker, low, high in STAGE_MARKERS:
            if line.startswith(marker):
                self._report(high, marker.rstrip('.'))
                return
        if line.startswith('Rendering '):
            try:
                done, total = line[len('Rendering '):].split('/')
                fraction = min(float(done) / max(float(total), 1), 1.0)
                self._report(RENDER_START + RENDER_SPAN * fraction, 'rendering {}/{}'.format(done, total))
            except (ValueError, ZeroDivisionError):
                pass

    def run(self):
        """阻塞执行, 返回 (exit_code, stderr_tail)。超时杀进程返回 (-9, '...timeout...')。"""
        self.output_dir.mkdir(parents=True, exist_ok=True)
        command = [sys.executable, str(MAIN_PY), self.input_path,
                   '--output_video', str(self.output_dir / 'output.avi')]
        if self.config_path:
            command += ['--config', self.config_path]
        if self.team_profiles_path:
            command += ['--team_profiles', self.team_profiles_path]
        if self.details:
            command += ['--details']
        process = subprocess.Popen(command, cwd=str(PROJECT_ROOT),
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   universal_newlines=True, encoding='utf-8', errors='replace')
        stderr_tail = ['']

        def drain_stderr():
            for chunk in iter(lambda: process.stderr.read(1024), ''):
                stderr_tail[0] = (stderr_tail[0] + chunk)[-STDERR_TAIL_BYTES:]

        reader = threading.Thread(target=drain_stderr, daemon=True)
        reader.start()
        started = time.time()
        for line in process.stdout:
            self._consume(line)
            if time.time() - started > TIMEOUT_SECONDS:
                process.kill()
                return -9, 'analysis timeout after {}s'.format(TIMEOUT_SECONDS)
        process.wait()
        reader.join(timeout=5)
        return process.returncode, stderr_tail[0].strip()
