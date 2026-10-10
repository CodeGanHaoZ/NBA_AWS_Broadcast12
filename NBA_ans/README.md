# NBA_ans — 篮球比赛视频分析

对篮球比赛视频进行全自动分析标注: 球员/球检测跟踪、球场关键点识别、球队分类、
球权归属、传球/抢断检测、战术视图、球员速度与跑动距离。

## 项目结构

```
NBA_ans/
├── main.py               # 流水线入口
├── configs.py            # 模型/缓存/输出路径配置
├── requirements.txt      # 依赖 (实测版本)
├── models/               # YOLO 权重 (需自行放置)
│   ├── player_detector.pt          # 球员检测 (yolo11)
│   ├── ball_detector_model.pt      # 球检测 (YOLOv5)
│   └── court_keypoint_detector.pt  # 球场关键点 (YOLOv8 pose)
├── assets/
│   └── basketball_court.png         # 战术视图球场底图
├── stubs/                # 中间结果缓存 (自动生成)
├── output_videos/        # 标注结果输出
└── nba/                  # 核心包
    ├── video_io.py        # 视频读写 + stub 缓存
    ├── geometry.py        # bbox 几何工具
    ├── tracking.py        # PlayerTracker / BallTracker
    ├── court_detector.py  # CourtKeypointDetector
    ├── team_assigner.py   # TeamAssigner (上身 HSV 颜色比例 + 时序确认)
    ├── ball_possession.py # BallAquisitionDetector
    ├── passes.py          # PassAndInterceptionDetector
    ├── tactical_view.py   # Homography / TacticalViewConverter
    ├── speed_distance.py  # SpeedAndDistanceCalculator
    └── drawing.py         # 8 个标注绘制器
```

## 处理流水线

```
读取视频
  → 球员检测跟踪 (YOLO + ByteTrack，低置信度关联、确认轨迹、显示框平滑)
  → 球检测跟踪 (多候选时序关联、限时预测、短缺口插值)
  → 球场关键点检测 (pose 模型)
  → 球队分类 (上身颜色比例：白/深蓝，排除暖色背景和重叠区域，跨帧确认)
  → 球权归属 (控制球，包含运球；连续确认、转移确认、限时保持)
  → 传球/抢断检测
  → 关键点校验(比例误差<80%) + 单应变换 → 战术视图
  → 速度 (5帧窗口, km/h) 与累计跑动距离 (米)
  → 逐帧绘制标注 → 原视频 FPS 输出 (MP4/AVI)
```

## 环境与安装

实测环境: Python 3.8 + torch 1.13.1+cu116 (RTX 4060, CUDA 可用),
球队颜色分类使用 OpenCV，无需 CLIP 模型或新增依赖。

```powershell
pip install -r requirements.txt
```

三个 YOLO 权重需提前准备并放入 `models/` 目录, 文件名与 `configs.py` 中配置一致。
原版使用的 CLIP 分类已替换，首次运行不再下载该模型。

## 使用

```powershell
python main.py "..\train_video\训练_弗拉格2月1日.mp4" --output_video output_videos/stage1_flagg.mp4 --debug
```

- 默认启用 stub 缓存: 首次运行后检测中间结果保存在 `stubs/`,
  缓存按视频、权重、代码、运行库版本和参数的内容摘要隔离；重复运行仍需解码和渲染
- `--no_cache` 强制重新计算；`--config stability_config.example.json` 加载自定义参数
- 输出保留原视频 FPS；MP4 使用 mp4v，AVI 使用 XVID。旁边自动生成逐帧 `.debug.jsonl` 和 `.summary.json`

## 标注内容说明

| 元素 | 说明 |
|---|---|
| 球员脚下小环 + 头顶深色标签 | 白队/蓝队/未知灰色；标签编号是轨迹 ID，非球衣号码 |
| 绿色 / 橙色持球框与 CONTROL / HOLD | 确认控球 / 短时保持；队伍未知时仍可显示控制者轨迹 |
| 绿色 / 黄色球位置圆环 | 实际检测 / 预测或插值；预测与插值不触发新的持球确认 |
| 左上角战术看板 + 场上关键点 | 默认恢复显示球员投影和球场点位 |
| 右上角状态卡 | 当前控制者、状态、球来源、轨迹编号说明 |
| `--details` 可选详细模式 | 额外显示速度和累计统计 |

## 球队分类自定义

默认区分白色 / 深蓝色球衣。使用 `--team_profiles team_profiles.example.json` 指定两个 HSV 颜色范围和英文标签；OpenCV Hue 范围为 0–179，S/V 为 0–255。球衣特征不足时输出 0（UNKNOWN），不强行归入队伍2。深蓝队兼容深色像素，当前暖色干扰过滤针对本视频设计，不适合直接套用所有颜色组合。

```powershell
python main.py "..\train_video\训练_弗拉格2月1日.mp4" --output_video output_videos/stage2_teams_control.mp4
```

默认显示战术看板和球场点位；`--details` 增加速度与统计，`--debug` 增加候选球与状态。逐帧 JSONL 含 `teams`、`team_evidence`，可查看各队颜色占比、采样帧、拒绝原因及最终标签。可调颜色比例见 `debug_config.json`，HSV 范围见 `team_profiles.example.json`，详细调试说明见 `docs/debug_parameters.md`。

当前默认控球规则：丢球后保留原持球者，另一名球员与真实检测的球连续关联 16 帧才转移；切镜头重置。历史第二轮实现依据及验证见 `docs/stage2_teams_control.md`。

## 第一阶段稳定性优化

第一阶段版本采用连续 0.10 秒确认、连续 0.12 秒确认换人和约 0.15 秒缺球保持。当前默认已改为上文的持续保留与 16 帧转移规则。球位置仍最多预测约 0.10 秒，只对约 0.067 秒以内的短缺口做双端点插值，不因持球保持而伪造球的位置。

切镜头时清空球轨迹、持球和关联状态；无法确认时输出未知。球员 ID 是轨迹编号，尚不包含姓名识别或跨镜头身份重识别。球队分类、球场投影、传球/抢断统计仍需结合具体视频校验。

```powershell
python -m unittest discover -s tests -v
python tools/compare_stability.py "..\train_video\训练_弗拉格2月1日.mp4" output_videos/stage1_flagg.debug.jsonl
```

对比工具读取 `../analysis/stage1_baseline` 保存的原版算法；左右对齐原视频帧率，生成 `output_videos/comparison/before_after.mp4`。统计覆盖帧数、轨迹数等诊断指标，不等于定位或持球准确率。验证记录见 `docs/stage1_validation.md`。

原项目来源：[Abdullah Tarek / basketball_analysis](https://github.com/abdullahtarek/basketball_analysis)。本阶段参考 [Roboflow 足球跟踪 notebook](https://github.com/roboflow/notebooks/blob/main/notebooks/how-to-track-football-players.ipynb) 的检测、关联和分层处理思路，新增的篮球时序控球逻辑位于 `nba/ball_possession.py`，球轨迹逻辑位于 `nba/ball_tracking.py`。

## 分析服务 (HTTP API)

`service/` 提供 Flask 封装: 提交视频 -> 异步分析 -> 轮询进度 -> 获取输出文件路径。分析以子进程运行 `main.py`, 串行队列执行 (GPU 单实例), 进度来自 stdout 解析。

**完整文档 (启动 / 接口调用 / 覆盖语义 / 输出文件与战术板 JSON 结构 / 常见问题) 见 [docs/service.md](docs/service.md)。**
**新服务器部署 (GPU/CPU 环境安装、模型放置与校验、验证步骤) 见 [docs/deployment.md](docs/deployment.md)。**

```powershell
python -m service.app          # 启动于 http://127.0.0.1:8000
```

| 接口 | 说明 |
|---|---|
| `POST /jobs` | 提交任务: multipart 字段 `video`(上传文件) 或 `video_path`(本地路径); 可选 `config`/`team_profiles`(JSON)、`details` |
| `GET /jobs` | 任务列表 |
| `GET /jobs/{job_id}` | 轮询: `status`(queued/running/done/error)、`progress`(0-100)、`stage`; 完成后 `result` 含标注视频与战术板 JSON 两项绝对路径 |
| `GET /jobs/{job_id}/files/{name}` | 下载交付物 (仅 `output.avi` / `output.tactical.json`) |

`job_id = SHA256(视频内容 + 参数)`: 同内容重复提交时, 运行中则复用当前任务; 已结束则清空旧输出重新运行 (覆盖, 命中检测缓存时秒级完成)。任务记录持久化于 `data/jobs.json`, 服务重启后已完成任务仍可查询, 中断任务标记为 error 可重新提交。

```powershell
# 提交示例
curl -X POST http://127.0.0.1:8000/jobs -F "video_path=C:\videos\game.mp4"
# 轮询示例
curl http://127.0.0.1:8000/jobs/<job_id>
```
