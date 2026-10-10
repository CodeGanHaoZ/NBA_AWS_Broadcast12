"""Phase-one settings, shot boundaries and content-addressed cache namespaces."""
from dataclasses import asdict, dataclass
import hashlib
import json
import platform
from importlib.metadata import version
from pathlib import Path

import cv2
import numpy as np


@dataclass
class StabilityConfig:
    player_confidence: float = 0.10
    player_activation: float = 0.35
    player_lost_seconds: float = 0.50
    player_confirm_seconds: float = 0.04
    display_alpha: float = 0.75
    ball_confidence: float = 0.12
    ball_acquire_confidence: float = 0.35
    ball_predict_seconds: float = 0.10
    ball_interpolate_seconds: float = 0.067
    ball_gate_diagonal: float = 0.008
    ball_speed_diagonal_per_second: float = 1.6
    possession_acquire_seconds: float = 0.10
    possession_switch_seconds: float = 0.12
    possession_grace_seconds: float = 0.15
    possession_release_seconds: float = 0.067
    possession_min_score: float = 0.62
    possession_margin: float = 0.055
    possession_evidence_confidence: float = 0.25
    possession_hold_until_transfer: bool = True
    possession_switch_frames: int = 16
    team_min_ratio: float = 0.22
    team_ratio_margin: float = 0.14
    team_min_visible_ratio: float = 0.55
    team_sample_seconds: float = 0.10
    team_vote_window: int = 9
    team_acquire_samples: int = 3
    team_switch_samples: int = 5
    team_vote_share: float = 0.80
    team_crop_left: float = 0.22
    team_crop_right: float = 0.78
    team_crop_top: float = 0.25
    team_crop_bottom: float = 0.55
    team_filter_warm: bool = True
    event_max_gap_seconds: float = 0.75
    batch_size: int = 8
    inference_size: int = 640

    @classmethod
    def load(cls, path=None):
        values = json.loads(Path(path).read_text(encoding='utf-8-sig')) if path else {}
        result = cls(**values)
        for name, value in asdict(result).items():
            if name in ('possession_hold_until_transfer', 'team_filter_warm'):
                if not isinstance(value, bool):
                    raise ValueError(name + ' must be true or false')
                continue
            if name in ('team_crop_left', 'team_crop_top', 'team_ratio_margin') and value == 0:
                continue
            if not isinstance(value, (int, float)) or not np.isfinite(value) or value <= 0:
                raise ValueError('Invalid setting: ' + name)
        for name in ('player_confidence', 'player_activation', 'ball_confidence',
                     'ball_acquire_confidence', 'display_alpha', 'possession_min_score',
                     'possession_margin', 'possession_evidence_confidence', 'team_min_ratio',
                     'team_ratio_margin', 'team_min_visible_ratio', 'team_vote_share',
                     'team_crop_left', 'team_crop_right', 'team_crop_top', 'team_crop_bottom'):
            if getattr(result, name) > 1:
                raise ValueError(name + ' must be <= 1')
        if result.player_confidence >= result.player_activation:
            raise ValueError('player_confidence must be below player_activation')
        if result.ball_confidence > result.ball_acquire_confidence:
            raise ValueError('ball_confidence must be <= ball_acquire_confidence')
        if int(result.batch_size) != result.batch_size or int(result.inference_size) != result.inference_size:
            raise ValueError('batch_size and inference_size must be integers')
        for name in ('team_vote_window', 'team_acquire_samples', 'team_switch_samples', 'possession_switch_frames'):
            if isinstance(getattr(result, name), bool) or int(getattr(result, name)) != getattr(result, name):
                raise ValueError(name + ' must be an integer')
        if max(result.team_acquire_samples, result.team_switch_samples) > result.team_vote_window:
            raise ValueError('Team confirmation samples exceed vote window')
        if result.team_crop_left >= result.team_crop_right or result.team_crop_top >= result.team_crop_bottom:
            raise ValueError('Invalid torso crop fractions')
        return result


def detect_scene_cuts(frames):
    """Conservative histogram + image-difference cut detector, not pan detection."""
    cuts = [False] * len(frames)
    previous = previous_hist = None
    for index, frame in enumerate(frames):
        small = cv2.resize(frame, (96, 54))
        hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [16, 8], [0, 180, 0, 256])
        cv2.normalize(hist, hist)
        if previous is not None:
            difference = float(np.mean(cv2.absdiff(small, previous))) / 255
            distance = cv2.compareHist(hist, previous_hist, cv2.HISTCMP_BHATTACHARYYA)
            cuts[index] = bool(difference > 0.55 or (difference > 0.28 and distance > 0.30)
                               or (difference > 0.14 and distance > 0.70))
        previous, previous_hist = small, hist
    return cuts


def file_digest(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def cache_namespace(video, cache_root, models, options):
    project = Path(__file__).resolve().parents[1]
    sources = sorted((project / 'nba').glob('*.py')) + [project / 'main.py', project / 'configs.py']
    manifest = {'schema': 2, 'video_sha256': file_digest(video),
                'runtime': {'python': platform.python_version(), **{name: version(name) for name in ('torch', 'ultralytics', 'supervision', 'transformers', 'numpy', 'opencv-python')}},
                'models': {str(Path(path).resolve()): file_digest(path) for path in models},
                'sources': {str(path.relative_to(project)): file_digest(path) for path in sources},
                'options': options}
    key = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()[:20]
    directory = Path(cache_root) / key
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    return directory
