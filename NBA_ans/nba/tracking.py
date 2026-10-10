"""YOLO candidates, player-only ByteTrack and single-ball temporal association."""
import math
import supervision as sv
from ultralytics import YOLO

from .ball_tracking import BallTrajectory
from .stability import StabilityConfig
from .video_io import read_stub, save_stub


class PlayerTracker:
    def __init__(self, model_path, fps=30.0, config=None):
        self.model = YOLO(model_path)
        self.fps = fps
        self.config = config or StabilityConfig()
        self.tracker = self._new_tracker()

    def _new_tracker(self):
        cfg = self.config
        return sv.ByteTrack(track_activation_threshold=cfg.player_activation,
                            lost_track_buffer=max(1, round(cfg.player_lost_seconds * 30)),
                            minimum_matching_threshold=0.8, frame_rate=round(self.fps),
                            minimum_consecutive_frames=max(1, math.ceil(cfg.player_confirm_seconds * self.fps)))

    def detect_frames(self, frames):
        for start in range(0, len(frames), self.config.batch_size):
            yield from self.model.predict(frames[start:start + self.config.batch_size],
                                          conf=self.config.player_confidence,
                                          imgsz=self.config.inference_size, verbose=False)

    def get_object_tracks(self, frames, read_from_stub=False, stub_path=None, scene_cuts=None):
        cached = read_stub(read_from_stub, stub_path)
        if cached is not None and len(cached) == len(frames):
            return cached
        cuts = scene_cuts if scene_cuts is not None else [False] * len(frames)
        tracks, smoothed = [], {}
        for index, detection in enumerate(self.detect_frames(frames)):
            if cuts[index]:
                self.tracker = self._new_tracker()
                smoothed.clear()
            names = {name.lower(): key for key, name in detection.names.items()}
            if 'player' not in names:
                raise ValueError('Player class missing from detector')
            objects = sv.Detections.from_ultralytics(detection)
            objects = objects[objects.class_id == names['player']]
            tracked = self.tracker.update_with_detections(objects)
            current = {}
            for box, confidence, identity in zip(tracked.xyxy, tracked.confidence, tracked.tracker_id):
                identity = int(identity)
                previous = smoothed.get(identity)
                display = box.copy()
                if previous is not None and index - previous[0] <= 2:
                    display = self.config.display_alpha * box + (1 - self.config.display_alpha) * previous[1]
                smoothed[identity] = (index, display)
                current[identity] = {'bbox': box.tolist(), 'display_bbox': display.tolist(),
                                     'confidence': float(confidence), 'source': 'detected'}
            smoothed = {key: value for key, value in smoothed.items()
                        if index - value[0] <= math.ceil(self.config.player_lost_seconds * self.fps)}
            tracks.append(current)
        save_stub(stub_path, tracks)
        return tracks


class BallTracker:
    def __init__(self, model_path, fps=30.0, config=None):
        self.model = YOLO(model_path)
        self.fps = fps
        self.config = config or StabilityConfig()
        self.debug = []

    def detect_frames(self, frames):
        for start in range(0, len(frames), self.config.batch_size):
            yield from self.model.predict(frames[start:start + self.config.batch_size],
                                          conf=self.config.ball_confidence,
                                          imgsz=self.config.inference_size, verbose=False)

    def get_object_tracks(self, frames, read_from_stub=False, stub_path=None, scene_cuts=None):
        cached = read_stub(read_from_stub, stub_path)
        if isinstance(cached, dict) and len(cached.get('tracks', [])) == len(frames):
            self.debug = cached['debug']
            return cached['tracks']
        candidates = []
        for detection in self.detect_frames(frames):
            names = {name.lower(): key for key, name in detection.names.items()}
            if 'ball' not in names:
                raise ValueError('Ball class missing from detector')
            objects = sv.Detections.from_ultralytics(detection)
            objects = objects[objects.class_id == names['ball']]
            candidates.append([{'bbox': box.tolist(), 'confidence': float(confidence)}
                               for box, confidence in zip(objects.xyxy, objects.confidence)])
        trajectory = BallTrajectory(self.fps, self.config)
        tracks = trajectory.associate(candidates, frames[0].shape, scene_cuts)
        self.debug = trajectory.debug
        save_stub(stub_path, {'tracks': tracks, 'debug': self.debug})
        return tracks
