"""NBA 篮球视频分析核心包。

模块划分:
- video_io        视频读写与 stub 缓存
- geometry        bounding box 几何工具
- tracking        球员/球检测与跟踪 (YOLO + ByteTrack)
- court_detector   球场关键点检测
- team_assigner    球队分类 (CLIP)
- ball_possession  球权归属检测
- passes           传球/抢断检测
- tactical_view    战术视图变换 (单应性)
- speed_distance   速度与跑动距离
- drawing          视频标注绘制器
"""
from .ball_possession import BallAquisitionDetector
from .court_detector import CourtKeypointDetector
from .drawing import (
    BallTracksDrawer,
    CourtKeypointDrawer,
    FrameNumberDrawer,
    PassInterceptionDrawer,
    PlayerTracksDrawer,
    SpeedAndDistanceDrawer,
    TacticalViewDrawer,
    TeamBallControlDrawer,
)
from .passes import PassAndInterceptionDetector
from .speed_distance import SpeedAndDistanceCalculator
from .tactical_view import Homography, TacticalViewConverter
from .team_assigner import TeamAssigner
from .tracking import BallTracker, PlayerTracker
from .video_io import read_stub, read_video, save_stub, save_video

__all__ = [
    "BallAquisitionDetector",
    "BallTracker",
    "BallTracksDrawer",
    "CourtKeypointDetector",
    "CourtKeypointDrawer",
    "FrameNumberDrawer",
    "Homography",
    "PassAndInterceptionDetector",
    "PassInterceptionDrawer",
    "PlayerTracker",
    "PlayerTracksDrawer",
    "SpeedAndDistanceCalculator",
    "SpeedAndDistanceDrawer",
    "TacticalViewConverter",
    "TacticalViewDrawer",
    "TeamAssigner",
    "TeamBallControlDrawer",
    "read_stub",
    "read_video",
    "save_stub",
    "save_video",
]
