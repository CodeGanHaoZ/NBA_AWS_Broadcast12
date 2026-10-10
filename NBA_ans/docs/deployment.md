# NBA_ans 部署文档

目标: 在一台新服务器 (有 GPU 或无 GPU 均可) 上从零安装环境、放置模型、验证并运行分析服务。
按本文档逐步执行即可完成部署。

## 1. 部署物清单

| 内容 | 获取方式 | 说明 |
|---|---|---|
| 项目代码 | `git clone` 本仓库, 或直接拷贝整个 NBA_ans 目录 | 含 `main.py`、`nba/`、`service/`、`tests/`、`assets/`、配置与文档 |
| 模型权重 ×3 | **单独拷贝** `models/` 目录 (被 .gitignore 排除, clone 拿不到) | 共约 728MB, 必须放回 `models/` 且文件名一致 |
| Python 环境 | 见第 3 节 | 实测基于 Python 3.8 |

**模型文件校验** (传输后核对, 防止拷贝损坏):

| 文件 | 大小 | SHA256 |
|---|---|---|
| `models/player_detector.pt` | 164.7 MB | `75C962CA04E92D756FA233289F19B421023EB826916D07FCAB8707291F767BAD` |
| `models/ball_detector_model.pt` | 164.7 MB | `01E0D38CEE7735366F5BA5E5A0AE77ADC25006CFA3CD5D364789414CC76398EA` |
| `models/court_keypoint_detector.pt` | 398.4 MB | `F6263105E5C2338FAFCFD5A6FEFD7D1D441E87364635E918DFDBB849F2DF1377` |

```powershell
# Windows 校验
Get-FileHash models\*.pt -Algorithm SHA256
```
```bash
# Linux 校验
sha256sum models/*.pt
```

## 2. 环境要求

| 项 | 要求 |
|---|---|
| 操作系统 | Windows 10/11 或 Ubuntu 20.04+ (其他 Linux 发行版同理) |
| Python | 3.8 (实测版本; 3.9-3.10 大概率兼容, 3.8 最稳) |
| 磁盘 | ≥ 5 GB (模型 0.8GB + 环境 ~3GB + 输出余量) |
| GPU | 可选。有 NVIDIA GPU (驱动 ≥ CUDA 11.6) 走 GPU 版; 无 GPU 走 CPU 版, 能跑但慢 (见第 7 节) |

## 3. 环境安装

### 3.1 创建 Python 环境 (conda 方式, 推荐)

```bash
conda create -n nba python=3.8 -y
conda activate nba
```

无 conda 的服务器: 安装 Miniconda (https://docs.conda.io/en/latest/miniconda.html), 或用系统 python3.8 + venv 代替。

### 3.2 安装 PyTorch (二选一)

**A. 有 GPU 的服务器** (NVIDIA 驱动已装好, CUDA ≥ 11.6):

```bash
pip install torch==1.13.1+cu116 torchvision==0.14.1+cu116 --extra-index-url https://download.pytorch.org/whl/cu116
```

**B. 无 GPU 的服务器 (CPU 版)**:

```bash
pip install torch==1.13.1+cpu torchvision==0.14.1+cpu --extra-index-url https://download.pytorch.org/whl/cpu
```

验证:

```bash
python -c "import torch; print(torch.__version__, 'cuda:', torch.cuda.is_available())"
# GPU 版期望输出 cuda: True; CPU 版输出 cuda: False 属正常
```

> 新显卡 (RTX 40 系) 上 cu116 通过 PTX JIT 运行, 已在 RTX 4060 实测通过; 若遇 "no kernel image" 报错, 可改装 `torch==2.1.*+cu121` (需自行回归验证)。

### 3.3 安装项目依赖

```bash
cd NBA_ans
pip install -r requirements.txt
pip install flask          # 服务层依赖
```

> 国内网络加速: 追加 `-i https://mirrors.aliyun.com/pypi/simple/`。`requirements.txt` 中的 `transformers` 当前流水线已不使用 (球队分类为 HSV 规则), 网络受限时可删掉该行以减小安装体积。

### 3.4 Linux 无界面服务器补充 (重要)

headless Linux 缺 libGL 时 `import cv2` 会失败:

```bash
sudo apt-get update && sudo apt-get install -y libgl1 libglib2.0-0
```

Windows 跳过本步。

## 4. 放置模型

将三个 `.pt` 文件放入 `NBA_ans/models/`, 按第 1 节的 SHA256 校验无误后, 验证可加载:

```bash
python -c "
from ultralytics import YOLO
for p in ['models/player_detector.pt','models/ball_detector_model.pt','models/court_keypoint_detector.pt']:
    print(p, YOLO(p).task, 'OK')"
```

期望输出: 两个 `detect OK` + 一个 `pose OK`。

## 5. 部署验证 (三步, 全过才算成功)

```bash
# 1) 单元测试 (48 个, 含服务层)
python -m unittest discover -s tests
# 期望末尾: Ran 48 tests ... OK

# 2) 命令行跑通一段视频
python main.py <任一视频路径> --output_video output_videos/verify.avi
# 期望: 输出 output_videos/verify.avi 及同名的 .tactical.json/.debug.jsonl/.summary.json

# 3) 服务冒烟 (另开终端)
python -m service.app
curl -X POST http://127.0.0.1:8000/jobs -F "video_path=<视频绝对路径>"
curl http://127.0.0.1:8000/jobs/<返回的job_id>     # 轮询到 status=done, result 含四个文件路径
```

## 6. 启动与对外暴露

- 本机使用: `python -m service.app` → `http://127.0.0.1:8000`
- **供其他机器调用**: 修改 `service/app.py` 末尾 `app.run(host='0.0.0.0', port=8000, threaded=True)`, 并放行防火墙 8000 端口:
  ```bash
  # Linux
  sudo ufw allow 8000
  # Windows (管理员 PowerShell)
  New-NetFirewallRule -DisplayName "NBA_ans 8000" -Direction Inbound -Port 8000 -Protocol TCP -Action Allow
  ```
- 接口调用方法见 [service.md](service.md)。

## 7. GPU / CPU 性能预期

| 硬件 | 21.5 秒 1080p60 视频 (1291 帧) | 说明 |
|---|---|---|
| RTX 4060 (8GB, 实测) | 约 3.5 分钟; 命中检测缓存后 < 1 分钟 | 参考基线 |
| 8 核 CPU (预估) | 约 40~90 分钟 | YOLO 无 GPU 加速; 建议小视频或用 `--config` 调低 `inference_size`(如 480) 与 `batch_size` |

显存占用约 2GB/任务; 服务为串行队列, 天然单任务运行, 不要在同一 GPU 上并发跑多个服务实例。

## 8. 常见部署问题

| 现象 | 处理 |
|---|---|
| `pip` 下载慢/超时 | 加国内镜像 `-i https://mirrors.aliyun.com/pypi/simple/`; pytorch 官方源慢时同样加镜像或走代理 |
| `ImportError: libGL.so.1` (Linux) | 见 3.4, `apt-get install -y libgl1` |
| `cuda: False` 但服务器有 GPU | 驱动未装或装了 CPU 版 torch; `nvidia-smi` 查驱动, 重装 3.2 的 GPU 版 |
| YOLO 报 `no kernel image is available` | 新架构显卡与 cu116 不兼容 → 改装 cu121 版 torch (见 3.2 注) |
| 模型加载失败/结果异常 | 重新拷贝并用第 1 节 SHA256 校验 |
| 服务重启后任务变 error | 正常行为, 重新提交即按覆盖语义重跑 (见 service.md) |
| 磁盘增长 | 定期清理 `data/outputs/` 与 `stubs/` (均为可再生缓存与产物) |
