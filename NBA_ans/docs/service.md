# NBA_ans 分析服务使用文档

HTTP 服务封装完整分析流水线: 提交视频 -> 异步分析 -> 轮询进度 -> 获取输出文件。
分析任务以子进程运行 `main.py`, 串行队列执行 (GPU 单实例), 服务本身不加载模型, 轻量稳定。

> 本文档适用于任何已按 [deployment.md](deployment.md) 完成部署的服务器 (Windows / Linux, 有无 GPU 均可)。
> 下文命令中的 `python` 指已激活项目环境后的解释器。

## 1. 前置条件

| 依赖 | 说明 |
|---|---|
| `models/player_detector.pt` | 球员检测权重 (164.7 MB, YOLO detect) |
| `models/ball_detector_model.pt` | 球检测权重 (164.7 MB, YOLO detect) |
| `models/court_keypoint_detector.pt` | 球场关键点权重 (398.4 MB, YOLO pose) |
| `assets/basketball_court.png` | 战术板球场底图 |
| Python 环境 | 3.8+ (安装步骤见 deployment.md) |
| Python 包 | `requirements.txt` + `flask` |

三个模型权重实体存放在项目 `models/` 目录 (SHA256 校验值见 deployment.md), 项目目录整体拷贝即可运行。

## 2. 服务启动

```bash
cd NBA_ans                 # 项目根目录
python -m service.app
```

- 监听地址: `http://127.0.0.1:8000` (修改端口/对外暴露: `service/app.py` 末尾 `app.run(...)`, 详见 deployment.md 第 6 节)
- 启动后自动创建 `data/inputs`、`data/outputs`、`data/jobs.json`
- 启动时恢复 `data/jobs.json` 中的历史任务: 已完成任务可直接查询; 上次进程遗留的排队/运行中任务标记为 error (重新提交即可, 按覆盖语义重跑)

## 3. 接口调用

### 3.1 提交任务 — `POST /jobs`

两种提交方式 (二选一), 均为 `multipart/form-data`:

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `video` | 文件 | 与 video_path 二选一 | 上传视频文件 (mp4/avi/mov/mkv/wmv/flv), 按内容摘要存入 `data/inputs/` |
| `video_path` | 字符串 | 与 video 二选一 | 服务器本地视频路径 (不复制, 原地分析) |
| `config` | JSON 字符串 | 否 | 稳定性参数覆盖, 如 `{"ball_confidence": 0.15}`; 未知键自动忽略 |
| `team_profiles` | JSON 字符串 | 否 | 两队球衣 HSV 颜色配置, 格式见 `team_profiles.example.json` |
| `details` | 字符串 | 否 | `true` 时输出叠加球场关键点/速度/统计图层 |

**方式一: 服务器本地路径**

```bash
curl -X POST http://127.0.0.1:8000/jobs -F "video_path=/data/videos/game.mp4"
```

**方式二: 文件上传**

```bash
curl -X POST http://127.0.0.1:8000/jobs -F "video=@/data/videos/game.mp4"
```

**响应** (200):

```json
{"job_id": "cdc0f0d86bbcbff9e5b8", "status": "queued", "poll_url": "/jobs/cdc0f0d86bbcbff9e5b8"}
```

**错误** (400): 未提供视频 / 视频路径不存在 / config 或 team_profiles 非法 JSON / 不支持的视频格式。

### 3.2 轮询进度 — `GET /jobs/{job_id}`

```bash
curl http://127.0.0.1:8000/jobs/cdc0f0d86bbcbff9e5b8
```

**响应示例 (运行中)**:

```json
{
  "job_id": "cdc0f0d86bbcbff9e5b8",
  "status": "running",
  "progress": 65,
  "stage": "rendering 400/1371",
  "input_path": "/data/videos/game.mp4",
  "created_at": "2026-10-10T16:42:18",
  "started_at": "2026-10-10T16:42:18",
  "finished_at": null,
  "result": null,
  "error": null
}
```

**status 状态机**: `queued` (排队中) → `running` (分析中) → `done` | `error`

**progress 进度含义** (解析自分析进程 stdout):

| 区间 | 阶段 |
|---|---|
| 0-2 | 读取视频信息 |
| 2-25 | 球员检测跟踪 |
| 25-45 | 球检测 |
| 45-58 | 球场关键点 |
| 58-65 | 球队分类 / 战术板 JSON |
| 65-97 | 渲染标注 (按帧号插值) |
| 100 | 完成 |

**完成后的响应**: `result` 字段填充**两项交付物**的绝对路径 (标注视频 + 战术板时间序列 JSON):

```json
{
  "status": "done", "progress": 100,
  "result": {
    "output.avi": "/srv/NBA_ans/data/outputs/<job_id>/output.avi",
    "output.tactical.json": "/srv/NBA_ans/data/outputs/<job_id>/output.tactical.json"
  }
}
```

失败时 `status=error`, `error` 字段含分析进程 stderr 末尾摘要 (约 2KB)。

### 3.3 任务列表 — `GET /jobs`

返回所有任务记录数组 (含历史), 用于看板或调试。

### 3.4 下载输出文件 — `GET /jobs/{job_id}/files/{name}`

`name` 仅允许两项交付物: `output.avi` / `output.tactical.json`

```bash
curl http://127.0.0.1:8000/jobs/<job_id>/files/output.tactical.json -O
```

文件尚未生成或任务不存在时返回 404。

> 磁盘上另有 `output.debug.jsonl` (逐帧诊断) 与 `output.summary.json` (运行摘要) 供排障使用,
> **不通过接口返回或下载**; 不需要时可定期清理 `data/outputs/`。

### 3.5 重复提交 (覆盖语义)

`job_id = SHA256(视频内容 + 参数)`, 同输入同参数必然同 id:

| 上一状态 | 重复提交行为 |
|---|---|
| queued / running | **复用**当前任务, 不重复执行 (响应中 status 为当前状态) |
| done / error | **清空旧输出, 重新排队运行** (覆盖) — 命中检测缓存时秒级完成 |

内容寻址缓存 (`stubs/`) 按视频 hash + 模型 hash + 代码 hash + 参数 hash 隔离, 覆盖重跑不会读到脏数据。

## 4. 输出说明

服务对外交付**两项** (位于 `data/outputs/<job_id>/`):

| 交付物 | 内容 |
|---|---|
| `output.avi` | 解析成功的标注视频: 球员轨迹/球队颜色/持球标记/球指针/状态条, 保持原始帧率 |
| `output.tactical.json` | 战术板**时间序列**数据, 供前端独立渲染 (结构如下) |

### 4.1 战术板 JSON 结构

```json
{
  "fps": 59.94,
  "court": {"width": 300, "height": 161, "image": "assets/basketball_court.png"},
  "teams": {"0": {"label": "UNKNOWN", "color": "#969696"},
            "1": {"label": "WHITE", "color": "#ebebeb"},
            "2": {"label": "NAVY", "color": "#46afff"}},
  "frames": [
    {"frame": 55, "holder": 6, "ball": [150.0, 1.4],
     "players": [{"id": 9, "x": 149.8, "y": 67.1, "team": 1}]}
  ]
}
```

| 字段 | 说明 |
|---|---|
| `fps` | 播放时间基准: 时刻 t 对应帧号 `round(t * fps)` |
| `court` | 战术坐标系尺寸 (300x161) 与底图文件 |
| `teams` | 队伍标签与十六进制颜色 (id 为字符串键) |
| `frames[].frame` | 原视频帧号 (稀疏: 板上无任何实体的帧不输出, 取 `frame <= 目标帧号` 的最近一条) |
| `frames[].holder` | 持球人轨迹 id, -1 = 无 |
| `frames[].ball` | 球心战术坐标 `[x, y]`, null = 球不可见 |
| `frames[].players[]` | 每名球员: `id` (轨迹号, 非球衣号)、`x/y` (战术坐标, 1 位小数)、`team` (0=未确认) |

**前端渲染三行逻辑**: 按 `teams[p.team].color` 画球员圆点; `p.id === frame.holder` 加高亮圈; `ball` 非空画球点。

## 5. 常见问题

| 现象 | 说明与处理 |
|---|---|
| 服务重启后任务变 error | 上次进程中断的任务标记为 error, 重新提交同内容即按覆盖语义重跑 |
| 分析超过 30 分钟 | 子进程被强制结束, status=error; 可拆分视频或调大 `service/runner.py` 的 TIMEOUT_SECONDS |
| 重复提交没反应 | 若任务正在运行, 接口复用当前任务 (看 poll_url 轮询即可) |
| 输出目录被谁清空了 | 重复提交(done/error 后)会清空 `data/outputs/<job_id>/` 后重跑, 属预期覆盖行为 |
| GPU 显存不足 | 串行队列已保证单任务运行; 勿并发启动多个服务实例指向同一 GPU |
| 部署/环境类问题 | 见 [deployment.md](deployment.md) 第 8 节排查表 |
