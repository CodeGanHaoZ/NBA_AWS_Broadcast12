# -*- coding: utf-8 -*-
"""NBA_ans 分析服务 (Flask)。

启动:
    python -m service.app
接口:
    POST /jobs                      提交分析任务 (multipart 上传 或 video_path)
    GET  /jobs                      任务列表
    GET  /jobs/<job_id>             轮询进度与结果路径
    GET  /jobs/<job_id>/files/<name> 下载输出文件
"""
import json
import os
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from .jobs import INPUT_DIR, JobManager, RESULT_NAMES, file_digest

app = Flask(__name__)
manager = JobManager()
manager.start_worker()

ALLOWED_EXTENSIONS = {'.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv'}


def _valid_json_or_none(value, field):
    """空 -> None; 合法 JSON 字符串 -> 原样返回; 非法 -> 抛 ValueError。"""
    if not value:
        return None
    try:
        json.loads(value)
    except ValueError:
        raise ValueError('{} 不是合法的 JSON'.format(field))
    return value


def _save_upload(file_storage):
    """上传文件按内容摘要存入 data/inputs/, 返回路径。"""
    suffix = Path(secure_filename(file_storage.filename or 'video.mp4')).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError('不支持的视频格式: {}'.format(suffix or '(无扩展名)'))
    temporary = INPUT_DIR / ('upload_{}.tmp'.format(os.getpid()))
    file_storage.save(temporary)
    digest = file_digest(temporary)
    destination = INPUT_DIR / (digest + suffix)
    if destination.exists():
        temporary.unlink()  # 同内容已存在, 复用
    else:
        temporary.replace(destination)
    return destination


@app.post('/jobs')
def submit_job():
    try:
        config = _valid_json_or_none(request.form.get('config'), 'config')
        team_profiles = _valid_json_or_none(request.form.get('team_profiles'), 'team_profiles')
        details = request.form.get('details', '').lower() in ('1', 'true', 'yes')

        upload = request.files.get('video')
        video_path = request.form.get('video_path', '').strip()
        if upload and upload.filename:
            video_path = str(_save_upload(upload))
        elif video_path:
            if not Path(video_path).is_file():
                return jsonify({'error': '视频文件不存在: {}'.format(video_path)}), 400
        else:
            return jsonify({'error': "请提供 'video' 上传文件或 'video_path' 本地路径"}), 400

        record = manager.submit(video_path, config=config, team_profiles=team_profiles, details=details)
        return jsonify({
            'job_id': record['job_id'],
            'status': record['status'],
            'poll_url': '/jobs/{}'.format(record['job_id']),
        })
    except ValueError as error:
        return jsonify({'error': str(error)}), 400


@app.get('/jobs')
def list_jobs():
    return jsonify(manager.list_jobs())


@app.get('/jobs/<job_id>')
def job_status(job_id):
    record = manager.get(job_id)
    if not record:
        return jsonify({'error': '任务不存在: {}'.format(job_id)}), 404
    return jsonify(record)


@app.get('/jobs/<job_id>/files/<name>')
def download_file(job_id, name):
    if name not in RESULT_NAMES:
        return jsonify({'error': '未知文件: {}'.format(name)}), 404
    output_dir = manager.output_dir(job_id)
    if not (output_dir / name).is_file():
        return jsonify({'error': '文件尚未生成或任务不存在'}), 404
    return send_from_directory(str(output_dir), name, as_attachment=True)


def main():
    app.run(host='127.0.0.1', port=8000, threaded=True)


if __name__ == '__main__':
    main()
