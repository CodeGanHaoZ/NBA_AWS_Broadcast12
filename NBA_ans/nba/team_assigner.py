"""Jersey colour ratios with torso crops, occlusion rejection and temporal votes.

Profiles are configurable HSV ranges. Defaults describe this video's white/navy
uniforms, not arbitrary teams or player identities. Team 0 means unconfirmed.
"""
from collections import deque
import math

import cv2
import numpy as np

from .video_io import read_stub, save_stub
from .stability import StabilityConfig


DEFAULT_PROFILES = {
    '1': {'label': 'WHITE', 'ranges': [[[0, 0, 145], [179, 65, 255]]]},
    '2': {'label': 'NAVY', 'ranges': [[[90, 45, 25], [140, 255, 190]],
                                      [[0, 0, 15], [179, 255, 85]]]},
}


class TeamAssigner:
    def __init__(self, fps=30, profiles=None, config=None):
        self.fps = fps
        self.config = config or StabilityConfig()
        self.profiles = profiles or DEFAULT_PROFILES
        if set(self.profiles) != {'1', '2'}:
            raise ValueError('Team profiles must contain keys 1 and 2')
        for profile in self.profiles.values():
            if not profile.get('ranges'):
                raise ValueError('Team profile needs HSV ranges')
            for lower, upper in profile['ranges']:
                low, high = np.asarray(lower), np.asarray(upper)
                if low.shape != (3,) or high.shape != (3,) or np.any(low < 0) or np.any(high > [179, 255, 255]) or np.any(low > high):
                    raise ValueError('Invalid HSV range')
        self.labels = {int(key): value['label'] for key, value in self.profiles.items()}
        self.labels[0] = 'UNKNOWN'
        self.player_team_dict, self.votes, self.debug = {}, {}, []
        self.team_colors = {0: (150, 150, 150), 1: (235, 235, 235), 2: (255, 175, 70)}

    def measure(self, frame, bbox, other_boxes=()):
        height, width = frame.shape[:2]
        box = np.asarray(bbox, dtype=float)
        if box.shape != (4,) or not np.isfinite(box).all():
            return {'team': 0, 'confidence': 0.0, 'reason': 'invalid_box', 'ratios': {}}
        x1, y1, x2, y2 = box
        bw, bh = x2 - x1, y2 - y1
        # Avoid heads, shorts, most arms and the floor; retain jersey front/back.
        cfg = self.config
        left, right = max(0, int(x1 + cfg.team_crop_left * bw)), min(width, int(x1 + cfg.team_crop_right * bw))
        top, bottom = max(0, int(y1 + cfg.team_crop_top * bh)), min(height, int(y1 + cfg.team_crop_bottom * bh))
        if right - left < 5 or bottom - top < 8 or bw <= 0 or bh <= 0:
            return {'team': 0, 'confidence': 0.0, 'reason': 'small_crop', 'ratios': {}}
        roi = frame[top:bottom, left:right]
        visible = np.ones(roi.shape[:2], np.uint8)
        for other in other_boxes:
            ox1, oy1, ox2, oy2 = map(int, other)
            a, b = max(left, ox1), min(right, ox2)
            c, d = max(top, oy1), min(bottom, oy2)
            if b > a and d > c:
                visible[c-top:d-top, a-left:b-left] = 0
        if visible.mean() < cfg.team_min_visible_ratio:
            return {'team': 0, 'confidence': 0.0, 'reason': 'overlap', 'ratios': {}}
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)
        # Warm wood/skin colours are particularly common inside basketball boxes.
        warm = (h >= 3) & (h <= 35) & (s > 28) & (v > 90)
        eligible = visible.astype(bool) & (~warm if cfg.team_filter_warm else True)
        denominator = int(visible.sum())
        ratios = {}
        for key, profile in self.profiles.items():
            mask = np.zeros(roi.shape[:2], np.uint8)
            for lower, upper in profile['ranges']:
                mask |= cv2.inRange(hsv, np.array(lower, np.uint8), np.array(upper, np.uint8))
            ratios[int(key)] = float(np.count_nonzero((mask > 0) & eligible) / max(denominator, 1))
        ranked = sorted(ratios, key=ratios.get, reverse=True)
        best, second = ranked
        winning, margin = ratios[best], ratios[best] - ratios[second]
        confident = winning >= cfg.team_min_ratio and margin >= cfg.team_ratio_margin
        return {'team': best if confident else 0, 'confidence': float(max(0, margin)),
                'reason': 'colour_evidence' if confident else 'ambiguous_colour',
                'ratios': ratios, 'torso_bbox': [left, top, right, bottom]}

    def update(self, identity, measurement):
        history = self.votes.setdefault(identity, deque(maxlen=self.config.team_vote_window))
        history.append((measurement['team'], measurement['confidence']))
        weights = {team: sum(conf for label, conf in history if label == team) for team in (1, 2)}
        counts = {team: sum(label == team for label, _ in history) for team in (1, 2)}
        best = max(weights, key=weights.get)
        total = sum(weights.values())
        previous = self.player_team_dict.get(identity, 0)
        # Three independent observations to acquire, stronger five to reverse.
        required = self.config.team_acquire_samples if previous == 0 else self.config.team_switch_samples
        share = weights[best] / total if total else 0.0
        if counts[best] >= required and share >= self.config.team_vote_share:
            previous = best
        # Unknown measurements remain evidence-free; prolonged occlusion expires.
        if len(history) == history.maxlen and all(label == 0 for label, _ in history):
            previous = 0
        self.player_team_dict[identity] = previous
        return previous

    def get_player_teams_across_frames(self, video_frames, player_tracks, read_from_stub=False, stub_path=None, scene_cuts=None):
        cached = read_stub(read_from_stub, stub_path)
        if isinstance(cached, dict) and len(cached.get('teams', [])) == len(video_frames):
            self.debug = cached['debug']
            return cached['teams']
        self.player_team_dict, self.votes, self.debug = {}, {}, []
        last_seen, evidence = {}, {}
        result = []
        interval = max(1, round(self.fps * self.config.team_sample_seconds))
        for index, frame in enumerate(video_frames):
            if scene_cuts is not None and scene_cuts[index]:
                self.player_team_dict.clear()
                self.votes.clear()
                last_seen.clear()
                evidence.clear()
            people, assignments, diagnostics = player_tracks[index], {}, {}
            for identity, player in people.items():
                if index - last_seen.get(identity, index) > math.ceil(self.fps * .5):
                    self.player_team_dict.pop(identity, None)
                    self.votes.pop(identity, None)
                last_seen[identity] = index
                old = evidence.get(identity)
                if old is None or index - old['sample_frame'] >= interval:
                    others = [p['bbox'] for key, p in people.items() if key != identity]
                    measurement = self.measure(frame, player['bbox'], others)
                    team = self.update(identity, measurement)
                    evidence[identity] = dict(measurement, sample_frame=index)
                else:
                    team = self.player_team_dict.get(identity, 0)
                assignments[identity] = team
                diagnostics[identity] = dict(evidence[identity], assigned_team=team,
                                             label=self.labels[team])
            result.append(assignments)
            self.debug.append(diagnostics)
        save_stub(stub_path, {'teams': result, 'debug': self.debug})
        return result
