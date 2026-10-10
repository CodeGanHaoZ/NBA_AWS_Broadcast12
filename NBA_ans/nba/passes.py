"""Confirmed ownership transfers, with scene-cut and long-gap resets."""
import math


class PassAndInterceptionDetector:
    def __init__(self, fps=30.0, max_gap_seconds=0.75):
        self.max_gap = max(1, math.ceil(fps * max_gap_seconds))

    def _events(self, holders, teams, scene_cuts=None, possession_details=None):
        passes, interceptions = [-1] * len(holders), [-1] * len(holders)
        previous, previous_team, previous_frame = -1, -1, -1
        for index, holder in enumerate(holders):
            if (scene_cuts is not None and scene_cuts[index]) or index - previous_frame > self.max_gap:
                previous, previous_team, previous_frame = -1, -1, -1
            if holder == -1:
                continue
            if possession_details is not None and possession_details[index]['state'] not in ('acquired', 'switched', 'controlled'):
                continue
            team = teams[index].get(holder, -1)
            if previous != -1 and previous != holder and previous_team in (1, 2) and team in (1, 2):
                if previous_team == team:
                    passes[index] = team
                else:
                    interceptions[index] = team
            previous, previous_team, previous_frame = holder, team, index
        return passes, interceptions

    def detect_passes(self, ball_acquisition, player_assignment, scene_cuts=None, possession_details=None):
        return self._events(ball_acquisition, player_assignment, scene_cuts, possession_details)[0]

    def detect_interceptions(self, ball_acquisition, player_assignment, scene_cuts=None, possession_details=None):
        return self._events(ball_acquisition, player_assignment, scene_cuts, possession_details)[1]
