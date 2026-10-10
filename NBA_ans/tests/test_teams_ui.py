import unittest
from unittest.mock import patch

import numpy as np

from nba.team_assigner import TeamAssigner
from nba.drawing import PlayerTracksDrawer, TeamBallControlDrawer
from nba.ball_possession import BallAquisitionDetector
from nba.video_io import VideoFrames


class JerseyTests(unittest.TestCase):
    def test_torso_colour_ignores_floor_and_shorts(self):
        assigner = TeamAssigner()
        for colour, expected in [((230, 230, 230), 1), ((70, 35, 15), 2)]:
            frame = np.full((200, 100, 3), (90, 150, 200), np.uint8)
            frame[50:110, 22:78] = colour
            measured = assigner.measure(frame, [0, 0, 100, 200])
            self.assertEqual(measured['team'], expected)
            self.assertGreater(measured['confidence'], .8)

    def test_overlap_and_invalid_crop_abstain(self):
        assigner = TeamAssigner()
        image = np.full((200, 100, 3), 230, np.uint8)
        self.assertEqual(assigner.measure(image, [0, 0, 100, 200], [[20, 20, 80, 150]])['team'], 0)
        self.assertEqual(assigner.measure(image, [-100, -100, -10, -10])['team'], 0)

    def test_similar_ratios_abstain(self):
        image = np.full((200, 100, 3), 230, np.uint8)
        image[:, 50:] = (70, 35, 15)
        self.assertEqual(TeamAssigner().measure(image, [0, 0, 100, 200])['team'], 0)

    def test_votes_confirm_and_reject_single_wrong_frame(self):
        assigner = TeamAssigner()
        white = {'team': 1, 'confidence': .8}
        navy = {'team': 2, 'confidence': .8}
        self.assertEqual(assigner.update(7, white), 0)
        self.assertEqual(assigner.update(7, white), 0)
        self.assertEqual(assigner.update(7, white), 1)
        self.assertEqual(assigner.update(7, navy), 1)
        for _ in range(9): assigner.update(7, navy)
        self.assertEqual(assigner.player_team_dict[7], 2)

    def test_scene_cut_requires_new_evidence(self):
        assigner = TeamAssigner(fps=10)
        images = [np.full((200, 100, 3), 230, np.uint8)]*8
        players = [{1: {'bbox': [0, 0, 100, 200]}}]*8
        teams = assigner.get_player_teams_across_frames(images, players, scene_cuts=[False]*4+[True]+[False]*3)
        self.assertEqual(teams[3][1], 1)
        self.assertEqual(teams[4][1], 0)
        self.assertEqual(teams[-1][1], 1)

    def test_unknown_team_not_counted_as_team_two(self):
        result = TeamBallControlDrawer().get_team_ball_control([{4: 0}, {4: 2}], [4, 4])
        self.assertEqual(result.tolist(), [-1, 2])

    def test_bad_profiles_rejected(self):
        with self.assertRaises(ValueError): TeamAssigner(profiles={'1': {}})


class ControlAndUITests(unittest.TestCase):
    def test_transfer_confirmation_not_shortened_by_old_holder_release(self):
        from dataclasses import replace
        from nba.stability import StabilityConfig
        detector = BallAquisitionDetector(30, replace(StabilityConfig(), possession_hold_until_transfer=False, possession_switch_seconds=.20))
        people = {1: {'bbox': [30, 0, 70, 100]}, 2: {'bbox': [230, 0, 270, 100]}}
        first = {1: {'bbox': [47, 47, 53, 53], 'confidence': .9}}
        second = {1: {'bbox': [247, 47, 253, 53], 'confidence': .9}}
        result = detector.detect_ball_possession([people]*12, [first]*6+[second]*6)
        self.assertNotIn(2, result[6:11])
        self.assertEqual(result[11], 2)

    def test_indexed_read_avoids_inaccurate_backend_seeking(self):
        class Capture:
            def __init__(self, path): self.index = 0
            def isOpened(self): return True
            def get(self, prop):
                import cv2
                return {cv2.CAP_PROP_FPS: 30, cv2.CAP_PROP_FRAME_WIDTH: 64,
                        cv2.CAP_PROP_FRAME_HEIGHT: 48, cv2.CAP_PROP_FRAME_COUNT: 8}[prop]
            def set(self, prop, value): self.index = value + 50
            def read(self):
                image = np.full((48, 64, 3), self.index, np.uint8)
                self.index += 1
                return True, image
            def grab(self): self.index += 1; return True
            def release(self): pass
        with patch('nba.video_io.cv2.VideoCapture', Capture):
            video = VideoFrames('broadcast.mp4')
            self.assertEqual(int(video[4][0, 0, 0]), 4)
            self.assertEqual(int(video[2][0, 0, 0]), 2)
            self.assertEqual(int(video[7][0, 0, 0]), 7)
            video.close()

    def test_weak_ball_cannot_acquire(self):
        players = [{1: {'bbox': [30, 0, 70, 100]}}]*20
        balls = [{1: {'bbox': [47, 47, 53, 53], 'confidence': .15, 'source': 'detected'}}]*20
        self.assertEqual(set(BallAquisitionDetector().detect_ball_possession(players, balls)), {-1})

    def test_candidate_order_does_not_choose_first_match(self):
        detector = BallAquisitionDetector()
        people = {1: {'bbox': [0, 0, 40, 100]}, 2: {'bbox': [35, 0, 75, 100]}}
        box = [52, 47, 58, 53]
        self.assertEqual(detector.find_best_candidate_for_possession((55, 50), people, box), 2)
        self.assertEqual(detector.find_best_candidate_for_possession((55, 50), dict(reversed(list(people.items()))), box), 2)

    def test_ui_handles_edge_and_overlapping_boxes_without_mutating_source(self):
        image = np.zeros((240, 400, 3), np.uint8)
        people = {1: {'bbox': [0, 0, 30, 100]}, 2: {'bbox': [0, 0, 32, 100]},
                  3: {'bbox': [370, 180, 400, 240]}}
        output = PlayerTracksDrawer().draw([image], [people], [{1: 1, 2: 2, 3: 0}], [1])[0]
        self.assertEqual(output.shape, image.shape)
        self.assertTrue(output.any())
        self.assertFalse(image.any())


if __name__ == '__main__':
    unittest.main()
