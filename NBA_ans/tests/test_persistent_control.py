import unittest
from dataclasses import replace
import numpy as np
from nba.ball_possession import BallAquisitionDetector
from nba.team_assigner import TeamAssigner
from nba.stability import StabilityConfig

PEOPLE = {1: {'bbox': [30, 0, 70, 100]}, 2: {'bbox': [230, 0, 270, 100]}}

def ball(x, source='detected'):
    return {1: {'bbox': [x-3, 47, x+3, 53], 'confidence': .9, 'source': source}}

class PersistentControlTests(unittest.TestCase):
    def evaluate(self, evidence, people=None, cuts=None, fps=30):
        detector = BallAquisitionDetector(fps)
        return detector.detect_ball_possession(people or [PEOPLE]*len(evidence), evidence, cuts)

    def test_missing_ball_retains_holder_without_timeout(self):
        result = self.evaluate([ball(50)]*6 + [{}]*300)
        self.assertTrue(all(x == 1 for x in result[5:]))

    def test_switch_requires_sixteenth_frame(self):
        for fps in (24, 30, 60):
            initial = int(np.ceil(.1*fps))
            result = self.evaluate([ball(50)]*initial + [ball(250)]*16, fps=fps)
            self.assertTrue(all(x == 1 for x in result[initial:initial+15]))
            self.assertEqual(result[-1], 2)

    def test_gap_resets_transfer_count(self):
        result = self.evaluate([ball(50)]*6 + [ball(250)]*15 + [{}] + [ball(250)]*15)
        self.assertEqual(result[-1], 1)

    def test_predictions_do_not_transfer(self):
        result = self.evaluate([ball(50)]*6 + [ball(250, 'predicted')]*100)
        self.assertEqual(result[-1], 1)

    def test_out_of_view_holder_keeps_logical_identity(self):
        evidence = [ball(50)]*6 + [{}]*30
        result = self.evaluate(evidence, [PEOPLE]*6 + [{}]*30)
        self.assertEqual(result[-1], 1)

    def test_scene_cut_resets_retained_holder(self):
        result = self.evaluate([ball(50)]*6 + [{}]*4, cuts=[False]*6+[True]+[False]*3)
        self.assertEqual(result[-1], -1)

    def test_ratio_parameters_change_decision(self):
        image = np.full((200, 100, 3), (90, 150, 200), np.uint8)
        image[50:110, 22:50] = 230
        standard = TeamAssigner().measure(image, [0, 0, 100, 200])
        strict = TeamAssigner(config=replace(StabilityConfig(), team_min_ratio=.8)).measure(image, [0, 0, 100, 200])
        self.assertEqual(standard['team'], 1)
        self.assertEqual(strict['team'], 0)

if __name__ == '__main__': unittest.main()
