"""Regression tests for missing evidence, transfers, shot resets and frame alignment."""
from dataclasses import replace
from pathlib import Path
import tempfile
import unittest

import cv2
import numpy as np

from nba.ball_possession import BallAquisitionDetector
from nba.ball_tracking import BallTrajectory
from nba.drawing import PassInterceptionDrawer, TeamBallControlDrawer
from nba.passes import PassAndInterceptionDetector
from nba.stability import StabilityConfig, detect_scene_cuts
from nba.video_io import VideoFrames, read_stub, save_stub, save_video


def ball(x=50, y=50, source='detected', confidence=0.9):
    return {1: {'bbox': [x - 3, y - 3, x + 3, y + 3], 'source': source, 'confidence': confidence}}


def candidate(x, confidence=0.8):
    return {'bbox': [x - 3, 47, x + 3, 53], 'confidence': confidence}


PLAYERS = {1: {'bbox': [30, 0, 70, 100]}, 2: {'bbox': [230, 0, 270, 100]}}


class ControlTests(unittest.TestCase):
    def run_control(self, balls, config=None, cuts=None):
        detector = BallAquisitionDetector(30, config or replace(StabilityConfig(), possession_hold_until_transfer=False))
        holders = detector.detect_ball_possession([PLAYERS] * len(balls), balls, cuts)
        return holders, detector.debug

    def test_acquisition_requires_measured_consecutive_evidence(self):
        result, _ = self.run_control([ball(), {}, ball(), {}] * 3)
        self.assertEqual(set(result), {-1})

    def test_predictions_cannot_acquire_or_switch(self):
        result, _ = self.run_control([ball(source='predicted')] * 20)
        self.assertEqual(set(result), {-1})
        result, _ = self.run_control([ball()] * 5 + [ball(250, source='interpolated')] * 20)
        self.assertNotIn(2, result)

    def test_dribbling_floor_zone_keeps_control(self):
        result, _ = self.run_control([ball()] * 5 + [ball(y=110)] * 8 + [ball()] * 5)
        self.assertTrue(all(holder == 1 for holder in result[4:]))

    def test_short_gap_is_bounded_and_long_gap_releases(self):
        result, debug = self.run_control([ball()] * 5 + [{}] * 15)
        self.assertEqual(result[5], 1)
        self.assertEqual(debug[5]['state'], 'held')
        self.assertEqual(result[-1], -1)

    def test_brief_competing_candidate_does_not_switch(self):
        result, _ = self.run_control([ball()] * 5 + [ball(250)] + [ball()] * 5)
        self.assertNotIn(2, result)
        self.assertEqual(result[-1], 1)

    def test_confirmed_transfer(self):
        result, _ = self.run_control([ball()] * 6 + [ball(250)] * 12)
        self.assertEqual(result[-1], 2)

    def test_scene_cut_resets_control(self):
        result, _ = self.run_control([ball()] * 10, cuts=[False] * 5 + [True] + [False] * 4)
        self.assertEqual(result[5], -1)
        self.assertEqual(result[-1], 1)

    def test_frame_rate_scales_confirmation_time(self):
        for fps in (24, 30, 60):
            detector = BallAquisitionDetector(fps)
            count = int(np.ceil(fps * detector.config.possession_acquire_seconds))
            result = detector.detect_ball_possession([PLAYERS] * (count + 1), [ball()] * (count + 1))
            self.assertEqual(result[count - 2], -1)
            self.assertEqual(result[count - 1], 1)

    def test_fully_overlapping_candidates_are_not_arbitrarily_acquired(self):
        players = {1: PLAYERS[1], 2: PLAYERS[1]}
        detector = BallAquisitionDetector()
        self.assertEqual(set(detector.detect_ball_possession([players] * 10, [ball()] * 10)), {-1})


class BallTests(unittest.TestCase):
    def test_near_candidate_beats_distant_high_score_false_positive(self):
        tracker = BallTrajectory()
        result = tracker.associate([[candidate(50)], [candidate(55, 0.65), candidate(900, 0.99)]], (1080, 1920))
        self.assertAlmostEqual(result[1][1]['bbox'][0], 52)

    def test_long_missing_gap_not_filled_and_prefix_not_backfilled(self):
        tracker = BallTrajectory()
        result = tracker.associate([[], [candidate(50)]] + [[]] * 20, (1080, 1920))
        self.assertEqual(result[0], {})
        self.assertEqual(result[-1], {})
        self.assertTrue(any(item and item[1]['source'] == 'predicted' for item in result))

    def test_short_two_endpoint_gap_is_marked_interpolated(self):
        result = BallTrajectory().associate([[candidate(50)], [], [candidate(54)]], (1080, 1920))
        self.assertEqual(result[1][1]['source'], 'interpolated')
        self.assertLess(result[1][1]['confidence'], 0.35)

    def test_cut_prevents_interpolation_and_prediction(self):
        result = BallTrajectory().associate([[candidate(50)], [], [candidate(54)]], (1080, 1920), [False, True, False])
        self.assertEqual(result[1], {})

    def test_all_missing_is_safe(self):
        self.assertEqual(BallTrajectory().associate([[], [], []], (1080, 1920)), [{}, {}, {}])


class EventAndIOTests(unittest.TestCase):
    def test_passes_reset_after_long_gap_and_cut(self):
        detector = PassAndInterceptionDetector(fps=30, max_gap_seconds=0.1)
        holders = [1, -1, -1, -1, -1, 2]
        teams = [{1: 1, 2: 1}] * len(holders)
        self.assertNotIn(1, detector.detect_passes(holders, teams))
        self.assertNotIn(1, detector.detect_passes([1, 2], teams[:2], [False, True]))
        self.assertEqual(detector.detect_passes([1, 2], teams[:2]), [-1, 1])

    def test_drawers_preserve_first_frame_and_count(self):
        frames = [np.zeros((240, 400, 3), dtype=np.uint8) for _ in range(3)]
        self.assertEqual(len(TeamBallControlDrawer().draw(frames, [{1: 1}] * 3, [1] * 3)), 3)
        self.assertEqual(len(PassInterceptionDrawer().draw(frames, [-1] * 3, [-1] * 3)), 3)

    def test_original_fps_and_frame_count_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'roundtrip.mp4'
            frames = [np.full((48, 64, 3), index * 10, np.uint8) for index in range(8)]
            self.assertEqual(save_video(iter(frames), path, fps=59.94), 8)
            sequence = VideoFrames(path)
            try:
                self.assertEqual(len(sequence), 8)
                self.assertAlmostEqual(sequence.fps, 59.94, places=2)
                self.assertEqual(len(list(sequence)), 8)
                self.assertEqual(len(sequence[:3]), 3)
            finally:
                sequence.close()

    def test_optional_stub_and_config_validation(self):
        save_stub(None, {})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'value.pkl'
            save_stub(path, {'value': 1})
            self.assertEqual(read_stub(True, path), {'value': 1})
            invalid = Path(directory) / 'bad.json'
            invalid.write_text('{"player_confidence": 0.8}', encoding='utf-8')
            with self.assertRaises(ValueError):
                StabilityConfig.load(invalid)

    def test_clear_scene_change_detected(self):
        images = [np.zeros((54, 96, 3), np.uint8), np.full((54, 96, 3), 255, np.uint8)]
        self.assertEqual(detect_scene_cuts(images), [False, True])


class TacticalProjectionTests(unittest.TestCase):
    # 四角 + 中线: 覆盖战术视图全图的关键点索引
    SPREAD = {0: (100, 100), 5: (100, 900), 7: (900, 100),
              10: (1600, 900), 15: (1600, 100), 6: (900, 900)}

    def _keypoints(self, converter):
        from types import SimpleNamespace
        import torch
        xy = np.zeros((1, len(converter.key_points), 2), np.float32)
        for k, (x, y) in self.SPREAD.items():
            xy[0, k] = (x, y)
        return SimpleNamespace(xy=torch.from_numpy(xy))

    def test_players_and_ball_projected(self):
        from nba.tactical_view import TacticalViewConverter
        converter = TacticalViewConverter('')
        keypoints = [self._keypoints(converter)] * 3
        players = [{7: {'bbox': [400, 400, 460, 480]}}] * 3
        balls = [{1: {'bbox': [880, 880, 920, 920], 'source': 'detected', 'confidence': 0.9}}] * 3
        positions, ball_positions = converter.transform_players_to_tactical_view(keypoints, players, balls)
        self.assertTrue(all(positions[i] for i in range(3)))
        self.assertTrue(all(ball_positions[i] for i in range(3)))
        self.assertEqual(ball_positions[0]['source'], 'detected')
        for frame in range(3):
            self.assertTrue(0 <= ball_positions[frame]['x'] <= converter.width)
            self.assertTrue(0 <= ball_positions[frame]['y'] <= converter.height)

    def test_ball_missing_yields_none(self):
        from nba.tactical_view import TacticalViewConverter
        converter = TacticalViewConverter('')
        keypoints = [self._keypoints(converter)] * 3
        players = [{7: {'bbox': [400, 400, 460, 480]}}] * 3
        positions, ball_positions = converter.transform_players_to_tactical_view(keypoints, players, [{}] * 3)
        self.assertTrue(all(positions[i] for i in range(3)))
        self.assertEqual(ball_positions, [None, None, None])


if __name__ == '__main__':
    unittest.main()
