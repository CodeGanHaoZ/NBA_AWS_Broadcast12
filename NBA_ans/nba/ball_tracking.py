"""Single-ball temporal association. Predictions never become measured evidence."""
import math
import numpy as np

from .stability import StabilityConfig


def center(box):
    box = np.asarray(box, dtype=float)
    return (box[:2] + box[2:]) / 2


class BallTrajectory:
    def __init__(self, fps=30.0, config=None):
        self.fps = fps
        self.config = config or StabilityConfig()
        self.debug = []

    def associate(self, candidates, frame_shape, scene_cuts=None):
        cfg = self.config
        height, width = frame_shape[:2]
        diagonal = math.hypot(width, height)
        cuts = scene_cuts if scene_cuts is not None else [False] * len(candidates)
        tracks, self.debug = [], []
        last_box, last_index, last_confidence = None, -1, 0.0
        velocity = np.zeros(2)
        max_gap = max(1, int(math.ceil(cfg.ball_predict_seconds * self.fps)))
        for index, raw in enumerate(candidates):
            if cuts[index]:
                last_box, last_index, velocity = None, -1, np.zeros(2)
            valid = []
            for item in raw:
                box = np.asarray(item['bbox'], dtype=float)
                if box.shape != (4,) or not np.isfinite(box).all() or np.any(box[2:] <= box[:2]):
                    continue
                if item['confidence'] >= cfg.ball_confidence:
                    valid.append(item)
            gap = index - last_index
            active = last_box is not None and gap <= max_gap
            prediction = center(last_box) + velocity * gap / self.fps if active else None
            gate = diagonal * (cfg.ball_gate_diagonal + cfg.ball_speed_diagonal_per_second
                               * min(gap, max_gap) / self.fps)
            ranked = []
            for item in valid:
                distance = float(np.linalg.norm(center(item['bbox']) - prediction)) if active else 0.0
                if active and distance > gate:
                    continue
                old_size = np.maximum(last_box[2:] - last_box[:2], 1) if active else None
                new_size = np.maximum(np.asarray(item['bbox'][2:]) - item['bbox'][:2], 1)
                penalty = float(np.mean(np.abs(np.log(new_size / old_size)))) if active else 0.0
                score = (0.45 * item['confidence'] + 0.50 * (1 - distance / max(gate, 1))
                         - 0.08 * min(penalty, 3)) if active else item['confidence']
                ranked.append((score, distance, item))
            ranked.sort(key=lambda row: row[0], reverse=True)
            chosen = ranked[0][2] if ranked else None
            if chosen is not None and not active and chosen['confidence'] < cfg.ball_acquire_confidence:
                chosen = None
            if chosen is not None:
                box = np.asarray(chosen['bbox'], dtype=float)
                if active:
                    instantaneous = (center(box) - center(last_box)) * self.fps / gap
                    velocity = 0.65 * instantaneous + 0.35 * velocity
                    speed_limit = diagonal * cfg.ball_speed_diagonal_per_second
                    speed = np.linalg.norm(velocity)
                    if speed > speed_limit:
                        velocity *= speed_limit / speed
                else:
                    velocity = np.zeros(2)
                last_box, last_index, last_confidence = box, index, float(chosen['confidence'])
                ball = {'bbox': box.tolist(), 'confidence': last_confidence,
                        'source': 'detected', 'age_seconds': 0.0}
                reason = 'temporal_match' if active else 'acquired'
            elif active:
                size = last_box[2:] - last_box[:2]
                box = np.concatenate((prediction - size / 2, prediction + size / 2))
                box[[0, 2]] = np.clip(box[[0, 2]], 0, width)
                box[[1, 3]] = np.clip(box[[1, 3]], 0, height)
                ball = {'bbox': box.tolist(), 'source': 'predicted',
                        'confidence': last_confidence * 0.45 * (1 - gap / (max_gap + 1)),
                        'age_seconds': gap / self.fps}
                reason = 'short_missing_detection'
                if np.any(box[2:] <= box[:2]):
                    ball, reason = None, 'prediction_outside_frame'
            else:
                ball = None
                reason = 'lost'
            tracks.append({1: ball} if ball is not None else {})
            self.debug.append({'frame': index, 'state': ball['source'] if ball else 'lost',
                               'reason': reason, 'candidates': valid,
                               'ranking': [{'score': round(score, 4), 'distance': round(distance, 2),
                                            'bbox': item['bbox']} for score, distance, item in ranked[:5]]})

        measured = [i for i, track in enumerate(tracks) if track and track[1]['source'] == 'detected']
        limit = int(cfg.ball_interpolate_seconds * self.fps)
        for left, right in zip(measured, measured[1:]):
            missing = right - left - 1
            if missing <= 0 or missing > limit or any(cuts[left + 1:right + 1]):
                continue
            displacement = np.linalg.norm(center(tracks[right][1]['bbox']) - center(tracks[left][1]['bbox']))
            if displacement > diagonal * (cfg.ball_gate_diagonal + cfg.ball_speed_diagonal_per_second * (right - left) / self.fps):
                continue
            for index in range(left + 1, right):
                alpha = (index - left) / (right - left)
                box = (1 - alpha) * np.array(tracks[left][1]['bbox']) + alpha * np.array(tracks[right][1]['bbox'])
                tracks[index] = {1: {'bbox': box.tolist(), 'source': 'interpolated',
                                    'confidence': 0.25 * min(tracks[left][1]['confidence'], tracks[right][1]['confidence']),
                                    'age_seconds': min(index - left, right - index) / self.fps}}
                self.debug[index]['state'] = 'interpolated'
                self.debug[index]['reason'] = 'bounded_two_endpoint_gap'
        return tracks
