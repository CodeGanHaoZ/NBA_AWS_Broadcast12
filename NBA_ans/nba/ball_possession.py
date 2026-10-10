"""Ball control (including dribbling), with evidence, hysteresis and bounded grace."""
import math

from .ball_tracking import center
from .stability import StabilityConfig


class BallAquisitionDetector:
    def __init__(self, fps=30.0, config=None):
        self.fps = fps
        self.config = config or StabilityConfig()
        self.debug = []

    def _scores(self, players, ball):
        x, y = center(ball['bbox'])
        result = []
        for identity, player in players.items():
            x1, y1, x2, y2 = player['bbox']
            width, height = max(x2 - x1, 1), max(y2 - y1, 1)
            scale = max(width, height * 0.35)
            # Notebook: expanded rectangle contains ball centre. Scale padding
            # with the player, then rank all matches instead of first-match wins.
            pad_x, pad_top, pad_bottom = .30 * scale, .10 * height, .18 * height
            if not (x1 - pad_x <= x <= x2 + pad_x and y1 - pad_top <= y <= y2 + pad_bottom):
                continue
            dx = max(x1 - x, 0, x - x2) / scale
            dy = max(y1 - height * 0.10 - y, 0, y - (y2 + height * 0.18)) / height
            if dx > 0.65 or dy > 0.25:
                continue
            centrality = max(0, 1 - abs(x - (x1 + x2) / 2) / scale)
            bx1, by1, bx2, by2 = ball['bbox']
            intersection = max(0, min(x2, bx2) - max(x1, bx1)) * max(0, min(y2, by2) - max(y1, by1))
            containment = intersection / max((bx2 - bx1) * (by2 - by1), 1)
            score = 0.70 - 0.65 * dx - 1.2 * dy + 0.12 * centrality + 0.08 * containment
            score *= 0.85 + 0.15 * min(float(ball.get('confidence', 1.0)), 1.0)
            result.append((int(identity), float(score)))
        return sorted(result, key=lambda row: row[1], reverse=True)

    def find_best_candidate_for_possession(self, ball_center, player_tracks_frame, ball_bbox):
        candidates = self._scores(player_tracks_frame, {'bbox': ball_bbox, 'confidence': 1.0})
        return candidates[0][0] if candidates and candidates[0][1] >= self.config.possession_min_score else -1

    def detect_ball_possession(self, player_tracks, ball_tracks, scene_cuts=None):
        if len(player_tracks) != len(ball_tracks):
            raise ValueError('Player/ball frame counts must agree')
        cfg = self.config
        cuts = scene_cuts if scene_cuts is not None else [False] * len(ball_tracks)
        acquire = max(1, math.ceil(cfg.possession_acquire_seconds * self.fps))
        switch = cfg.possession_switch_frames if cfg.possession_hold_until_transfer else max(1, math.ceil(cfg.possession_switch_seconds * self.fps))
        grace = max(1, math.ceil(cfg.possession_grace_seconds * self.fps))
        release = max(1, math.ceil(cfg.possession_release_seconds * self.fps))
        holder, pending, pending_frames, pending_needed = -1, -1, 0, acquire
        last_support, far_frames = -1000000, 0
        output, self.debug = [], []
        for index, (players, balls) in enumerate(zip(player_tracks, ball_tracks)):
            if cuts[index]:
                holder, pending, pending_frames, last_support, far_frames = -1, -1, 0, -1000000, 0
            ball = balls.get(1)
            measured = bool(ball and ball.get('source', 'detected') == 'detected'
                            and ball.get('confidence', 1.0) >= cfg.ball_confidence)
            strong = measured and ball.get('confidence', 1.0) >= cfg.possession_evidence_confidence
            scores = self._scores(players, ball) if ball else []
            by_id = dict(scores)
            best, best_score = scores[0] if scores else (-1, 0.0)
            second = scores[1][1] if len(scores) > 1 else 0.0
            if holder in by_id and best_score - by_id[holder] < cfg.possession_margin:
                best, best_score = holder, by_id[holder]
            unambiguous = best == holder or best_score - second >= cfg.possession_margin
            credible = measured and best_score >= cfg.possession_min_score and unambiguous
            # Weak measured candidates may support an existing controller, but
            # cannot acquire or transfer ownership to somebody else.
            credible = credible and (best == holder or strong)
            state, reason = 'unknown', 'no_reliable_control'
            if credible:
                if best == holder and holder != -1:
                    last_support, far_frames = index, 0
                    pending, pending_frames = -1, 0
                    state, reason = 'controlled', 'measured_support_including_dribble_zone'
                else:
                    if pending != best:
                        pending_needed = acquire if holder == -1 else switch
                    pending_frames = pending_frames + 1 if pending == best else 1
                    pending = best
                    needed = pending_needed
                    if pending_frames >= needed:
                        previous = holder
                        holder, last_support, far_frames = best, index, 0
                        pending, pending_frames = -1, 0
                        state = 'acquired' if previous == -1 else 'switched'
                        reason = 'consecutive_measured_candidate'
                    else:
                        reason = 'candidate_confirmation'
            else:
                pending, pending_frames = -1, 0
            if holder != -1 and state not in ('controlled', 'acquired', 'switched'):
                if cfg.possession_hold_until_transfer:
                    state, reason = 'held', 'retain_until_confirmed_transfer'
                elif measured and by_id.get(holder, 0) < cfg.possession_min_score - 0.14:
                    far_frames += 1
                else:
                    far_frames = 0
                if not cfg.possession_hold_until_transfer and (index - last_support > grace or far_frames >= release):
                    holder = -1
                    state, reason = 'released', 'separation_or_evidence_timeout'
                elif not cfg.possession_hold_until_transfer and holder in players:
                    state, reason = 'held', 'bounded_control_grace'
            visible_holder = holder if cfg.possession_hold_until_transfer or holder in players else -1
            if cfg.possession_hold_until_transfer and holder != -1 and holder not in players:
                state, reason = 'held', 'retain_holder_not_visible'
            if visible_holder == -1 and holder != -1:
                state, reason = 'unknown', 'holder_not_visible'
            output.append(visible_holder)
            self.debug.append({'frame': index, 'holder': visible_holder, 'state': state,
                               'reason': reason, 'ball_measured': measured,
                               'ball_strong_evidence': bool(strong),
                               'pending_holder': pending, 'pending_frames': pending_frames,
                               'transfer_required_frames': switch, 'holder_visible': holder in players,
                               'scores': [{'player_id': identity, 'score': round(score, 4)}
                                          for identity, score in scores[:5]]})
        return output
