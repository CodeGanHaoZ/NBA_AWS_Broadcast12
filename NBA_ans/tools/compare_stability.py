"""Re-run baseline algorithms and export frame-aligned before/after diagnostics.

Baseline detector batching is streamed to bound memory; detection thresholds and
tracking/possession algorithms come from the saved original package unchanged.
"""
import argparse
from collections import Counter
import copy
import importlib.util
import json
from pathlib import Path
import sys

import cv2
import numpy as np

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))
from nba.video_io import VideoFrames, save_video


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('video')
    parser.add_argument('improved_debug')
    parser.add_argument('--baseline', default=str(PROJECT.parent / 'analysis/stage1_baseline'))
    parser.add_argument('--output_dir', default=str(PROJECT / 'output_videos/comparison'))
    parser.add_argument('--reuse_baseline', action='store_true', help='Reuse existing baseline caches only for the same video and models')
    args = parser.parse_args()
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    baseline = Path(args.baseline)
    spec = importlib.util.spec_from_file_location('baseline_nba', baseline / 'nba/__init__.py',
                                                  submodule_search_locations=[str(baseline / 'nba')])
    package = importlib.util.module_from_spec(spec)
    sys.modules['baseline_nba'] = package
    spec.loader.exec_module(package)
    frames = VideoFrames(args.video)
    try:
        evaluate(package, frames, args, output)
    finally:
        frames.close()


def evaluate(package, frames, args, output):
    def stream_detections(self, sequence):
        for start in range(0, len(sequence), 8):
            yield from self.model.predict(sequence[start:start + 8], conf=0.5, imgsz=640, verbose=False)

    package.PlayerTracker.detect_frames = stream_detections
    package.BallTracker.detect_frames = stream_detections
    print('Original player tracker...', flush=True)
    tracker = package.PlayerTracker(str(PROJECT / 'models/player_detector.pt'))
    players = tracker.get_object_tracks(frames, args.reuse_baseline, str(output / 'baseline_players.pkl'))
    del tracker
    print('Original ball tracker...', flush=True)
    tracker = package.BallTracker(str(PROJECT / 'models/ball_detector_model.pt'))
    raw = tracker.get_object_tracks(frames, args.reuse_baseline, str(output / 'baseline_ball_raw.pkl'))
    filtered = tracker.remove_wrong_detections(copy.deepcopy(raw))
    balls = tracker.interpolate_ball_positions(copy.deepcopy(filtered))
    del tracker
    holders = [int(value) for value in package.BallAquisitionDetector().detect_ball_possession(players, balls)]
    improved = [json.loads(line) for line in Path(args.improved_debug).read_text(encoding='utf-8').splitlines()]
    if len(improved) != len(frames):
        raise ValueError('Improved debug and source frame counts disagree')
    for index, item in enumerate(improved):
        if item['frame'] != index or abs(item['time_seconds'] - index / frames.fps) > 0.001:
            raise ValueError('Frame/time alignment differs')
    with (output / 'baseline.debug.jsonl').open('w', encoding='utf-8') as stream:
        for index in range(len(frames)):
            stream.write(json.dumps({'frame': index, 'time_seconds': index / frames.fps,
                                     'players': {int(key): value for key, value in players[index].items()}, 'ball': balls[index].get(1),
                                     'raw_ball': raw[index].get(1), 'filtered_ball': filtered[index].get(1),
                                     'holder': int(holders[index])}, default=lambda value: value.item() if isinstance(value, np.generic) else value.tolist()) + '\n')

    def summarize(player_tracks, ball_tracks, control):
        identities = set(identity for frame in player_tracks for identity in frame)
        return {'unique_track_ids': len(identities),
                'player_boxes': sum(map(len, player_tracks)),
                'frames_with_ball_box': sum(bool(frame) for frame in ball_tracks),
                'frames_with_control_label': sum(holder != -1 for holder in control),
                'control_label_changes': sum(a != b for a, b in zip(control, control[1:]))}

    improved_players = [{int(key): value for key, value in item['players'].items()} for item in improved]
    improved_balls = [{1: item['ball']} if item['ball'] else {} for item in improved]
    improved_holders = [item['possession']['holder'] for item in improved]
    summary = {'fps': frames.fps, 'frames': len(frames),
               'baseline': summarize(players, balls, holders),
               'improved': summarize(improved_players, improved_balls, improved_holders),
               'baseline_ball_raw_detected_frames': sum(bool(frame) for frame in raw),
               'baseline_ball_filtered_frames': sum(bool(frame) for frame in filtered),
               'improved_ball_states': dict(Counter(item['ball_association']['state'] for item in improved)),
               'note': 'Unlabelled diagnostics, NOT accuracy or ID-switch ground truth. Baseline overlays are rendered at input FPS for aligned comparison.'}
    (output / 'comparison_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')

    def overlay(frame, people, ball, holder, label):
        result = frame.copy()
        for identity, person in people.items():
            x1, y1, x2, y2 = map(int, person.get('display_bbox', person['bbox']))
            color = (0, 0, 255) if identity == holder else (230, 230, 230)
            cv2.rectangle(result, (x1, y1), (x2, y2), color, 2)
            cv2.putText(result, str(identity), (x1, max(20, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, .7, color, 2)
        if ball and np.isfinite(ball['bbox']).all():
            x1, y1, x2, y2 = map(int, ball['bbox'])
            source = ball.get('source', 'filled_or_detected')
            color = (0, 255, 0) if source in ('detected', 'filled_or_detected') else (0, 215, 255)
            cv2.circle(result, ((x1 + x2) // 2, (y1 + y2) // 2), max(10, (x2 - x1) // 2), color, 2)
        result = cv2.resize(result, (960, 540))
        cv2.rectangle(result, (0, 0), (960, 36), (0, 0, 0), -1)
        cv2.putText(result, label, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, .65, (255, 255, 255), 1)
        return result

    snapshots = {100, 300, 500, 700, 1000, 1200}

    def rendered():
        for index, frame in enumerate(frames):
            left = overlay(frame, players[index], balls[index].get(1), holders[index],
                           'BASELINE | frame {} | holder {}'.format(index, holders[index]))
            right = overlay(frame, improved_players[index], improved[index]['ball'], improved_holders[index],
                            'STAGE 1 | {} | holder {}'.format(improved[index]['ball_association']['state'], improved_holders[index]))
            combined = np.hstack((left, right))
            if index in snapshots:
                cv2.imencode('.jpg', combined)[1].tofile(str(output / 'frame_{:04d}.jpg'.format(index)))
            yield combined

    print('Rendering aligned comparison...', flush=True)
    save_video(rendered(), output / 'before_after.mp4', fps=frames.fps)
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()
