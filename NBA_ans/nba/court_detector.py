"""球场关键点检测 (YOLO pose 模型)。"""
from ultralytics import YOLO

from .video_io import read_stub, save_stub


class CourtKeypointDetector:
    """使用 YOLO pose 模型检测球场关键点。"""

    def __init__(self, model_path):
        self.model = YOLO(model_path)

    def get_court_keypoints(self, frames, read_from_stub=False, stub_path=None):
        """返回每帧的 keypoints; 支持 stub 缓存。"""
        court_keypoints = read_stub(read_from_stub, stub_path)
        if court_keypoints is not None:
            if len(court_keypoints) == len(frames):
                return court_keypoints

        batch_size = 20
        court_keypoints = []
        for i in range(0, len(frames), batch_size):
            detections_batch = self.model.predict(frames[i:i + batch_size], conf=0.5)
            for detection in detections_batch:
                court_keypoints.append(detection.keypoints.cpu())

        save_stub(stub_path, court_keypoints)
        return court_keypoints
