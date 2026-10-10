"""Basketball analysis with temporal ball/control stability and reproducible caches."""
import argparse
from collections import Counter
from dataclasses import asdict
import json
from pathlib import Path
import time

import cv2

from configs import (BALL_DETECTOR_PATH, COURT_IMAGE_PATH, COURT_KEYPOINT_DETECTOR_PATH,
                     OUTPUT_VIDEO_PATH, PLAYER_DETECTOR_PATH, STUBS_DEFAULT_PATH)
from nba import (BallAquisitionDetector, BallTracker, CourtKeypointDetector, CourtKeypointDrawer,
                 PassAndInterceptionDetector, PassInterceptionDrawer, PlayerTracker,
                 PlayerTracksDrawer, SpeedAndDistanceCalculator, SpeedAndDistanceDrawer,
                 BallTracksDrawer, TacticalViewConverter, TeamAssigner,
                 TeamBallControlDrawer, read_video, save_video)
from nba.stability import StabilityConfig, cache_namespace, detect_scene_cuts
from nba.presentation import draw_status


def parse_args():
    parser = argparse.ArgumentParser(description='Basketball Video Analysis - stable control including dribbling')
    parser.add_argument('input_video', help='输入视频路径')
    parser.add_argument('--output_video', default=OUTPUT_VIDEO_PATH)
    parser.add_argument('--stub_path', default=STUBS_DEFAULT_PATH, help='缓存根目录，自动按内容与配置隔离')
    parser.add_argument('--config', help='稳定性参数 JSON；未填写的项采用默认值')
    parser.add_argument('--no_cache', action='store_true', help='重新计算，仍写入独立缓存')
    parser.add_argument('--debug', action='store_true', help='视频显示候选球框和状态')
    parser.add_argument('--debug_jsonl', help='逐帧诊断 JSONL，默认在输出视频旁保存')
    parser.add_argument('--team_profiles', help='两队球衣 HSV 颜色范围 JSON；默认白色/深蓝色')
    parser.add_argument('--details', action='store_true', help='显示球场关键点、速度、战术图和累计统计')
    return parser.parse_args()


def main():
    args = parse_args()
    config = StabilityConfig.load(args.config)
    project = Path(__file__).resolve().parent
    model_paths = [str(project / path) for path in (PLAYER_DETECTOR_PATH, BALL_DETECTOR_PATH, COURT_KEYPOINT_DETECTOR_PATH)]
    frames = read_video(args.input_video, lazy=True)
    try:
        return analyze(args, config, frames, model_paths, project)
    finally:
        frames.close()


def analyze(args, config, frames, model_paths, project):
    started = time.perf_counter()
    fps = frames.fps
    print('Video: {} frames, {:.6f} FPS, {}x{}'.format(len(frames), fps, frames.width, frames.height), flush=True)
    profiles = json.loads(Path(args.team_profiles).read_text(encoding='utf-8-sig')) if args.team_profiles else None
    team_assigner = TeamAssigner(fps=fps, profiles=profiles, config=config)
    cache = cache_namespace(args.input_video, args.stub_path, model_paths,
                            {'config': asdict(config), 'fps': fps, 'team_profiles': team_assigner.profiles})
    detection_options = {key: value for key, value in asdict(config).items()
                         if key.startswith(('player_', 'ball_')) or key in ('display_alpha', 'batch_size', 'inference_size')}
    detection_cache = cache_namespace(args.input_video, Path(args.stub_path) / 'inference', model_paths,
                                      {'config': detection_options, 'fps': fps})
    use_cache = not args.no_cache
    print('Cache: {}'.format(cache), flush=True)
    cuts = detect_scene_cuts(frames)
    print('Scene boundaries: {}'.format([i for i, cut in enumerate(cuts) if cut]), flush=True)

    print('Player detection and tracking...', flush=True)
    player_tracker = PlayerTracker(model_paths[0], fps, config)
    players = player_tracker.get_object_tracks(frames, use_cache, detection_cache / 'players.pkl', cuts)
    del player_tracker
    print('Ball detection and association...', flush=True)
    ball_tracker = BallTracker(model_paths[1], fps, config)
    balls = ball_tracker.get_object_tracks(frames, use_cache, detection_cache / 'balls.pkl', cuts)
    ball_debug = ball_tracker.debug
    del ball_tracker
    print('Court keypoints...', flush=True)
    court_detector = CourtKeypointDetector(model_paths[2])
    keypoints = court_detector.get_court_keypoints(frames, use_cache, detection_cache / 'court.pkl')
    keypoints = [item.cpu() for item in keypoints]
    del court_detector
    print('Team assignment...', flush=True)
    teams = team_assigner.get_player_teams_across_frames(frames, players, use_cache, cache / 'teams.pkl', cuts)
    team_debug, team_labels = team_assigner.debug, team_assigner.labels

    possession = BallAquisitionDetector(fps, config)
    holders = possession.detect_ball_possession(players, balls, cuts)
    event_detector = PassAndInterceptionDetector(fps, config.event_max_gap_seconds)
    passes = event_detector.detect_passes(holders, teams, cuts, possession.debug)
    interceptions = event_detector.detect_interceptions(holders, teams, cuts, possession.debug)

    tactical = TacticalViewConverter(str(project / COURT_IMAGE_PATH))
    keypoints = tactical.validate_keypoints(keypoints)
    positions, tactical_balls = tactical.transform_players_to_tactical_view(keypoints, players, balls)
    calculator = SpeedAndDistanceCalculator(tactical.width, tactical.height,
                                           tactical.actual_width_in_meters, tactical.actual_height_in_meters)
    distances = calculator.calculate_distance(positions)
    speeds = calculator.calculate_speed(distances, fps=fps)

    output_path = Path(args.output_video)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    debug_path = Path(args.debug_jsonl) if args.debug_jsonl else output_path.with_suffix('.debug.jsonl')
    debug_path.parent.mkdir(parents=True, exist_ok=True)
    with debug_path.open('w', encoding='utf-8') as stream:
        for index in range(len(frames)):
            record = {'frame': index, 'time_seconds': index / fps, 'scene_cut': cuts[index],
                      'players': players[index], 'teams': teams[index], 'team_evidence': team_debug[index],
                      'ball': balls[index].get(1),
                      'ball_association': ball_debug[index], 'possession': possession.debug[index],
                      'pass_team': passes[index], 'interception_team': interceptions[index]}
            stream.write(json.dumps(record, ensure_ascii=False, allow_nan=False) + '\n')

    # 战术板 JSON: 只保留复现战术板所需的最小字段集
    def _hex(color_bgr):
        r, g, b = reversed(color_bgr)
        return '#%02x%02x%02x' % (int(r), int(g), int(b))

    tactical_frames = []
    for index in range(len(frames)):
        ball = tactical_balls[index]
        board_players = [{'id': int(identity), 'x': round(position[0], 1), 'y': round(position[1], 1),
                          'team': int(teams[index].get(identity, 0))}
                         for identity, position in positions[index].items()]
        if not board_players and ball is None:
            continue  # 板上无任何实体, 不输出空帧
        tactical_frames.append({
            'frame': index,
            'holder': int(holders[index]),
            'ball': ([round(ball['x'], 1), round(ball['y'], 1)] if ball else None),
            'players': board_players,
        })
    tactical_path = output_path.with_suffix('.tactical.json')
    tactical_doc = {
        'fps': fps,
        'court': {'width': tactical.width, 'height': tactical.height, 'image': COURT_IMAGE_PATH},
        'teams': {str(team): {'label': team_labels.get(int(team), 'UNKNOWN'),
                              'color': _hex(team_assigner.team_colors[int(team)])}
                  for team in ('0', '1', '2')},
        'frames': tactical_frames,
    }
    tactical_path.write_text(json.dumps(tactical_doc, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    print('Tactical board JSON: {} ({} frames)'.format(tactical_path, len(tactical_frames)), flush=True)

    player_drawer, ball_drawer = PlayerTracksDrawer(team_labels=team_labels), BallTracksDrawer()
    court_drawer, control_drawer = CourtKeypointDrawer(), TeamBallControlDrawer()
    pass_drawer, speed_drawer = PassInterceptionDrawer(), SpeedAndDistanceDrawer()
    control = control_drawer.get_team_ball_control(teams, holders)

    def rendered_frames():
        for index, frame in enumerate(frames):
            frame = player_drawer.draw([frame], [players[index]], [teams[index]], [holders[index]],
                                       [possession.debug[index]])[0]
            frame = ball_drawer.draw([frame], [balls[index]])[0]
            frame = court_drawer.draw([frame], [keypoints[index]])[0]
            if args.details:
                frame = control_drawer.draw_frame(frame, index, control)
                frame = pass_drawer.draw_frame(frame, index, passes, interceptions)
                frame = speed_drawer.draw([frame], [players[index]], [distances[index]], [speeds[index]])[0]
            else:
                frame = draw_status(frame, index, fps, players[index], teams[index], holders[index],
                                    possession.debug[index], balls[index].get(1), team_labels)
            if args.debug:
                for candidate in ball_debug[index]['candidates']:
                    x1, y1, x2, y2 = map(int, candidate['bbox'])
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (180, 180, 180), 1)
                ball = balls[index].get(1)
                label = 'Ball: {} | Control: {} ID={} | {:.3f}s'.format(
                    ball['source'] if ball else 'lost', possession.debug[index]['state'], holders[index], index / fps)
                cv2.putText(frame, label, (24, frame.shape[0]-24), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 215, 255), 2)
            if index % 200 == 0:
                print('Rendering {}/{}'.format(index, len(frames)), flush=True)
            yield frame

    written = save_video(rendered_frames(), output_path, fps=fps)
    if written != len(frames):
        raise RuntimeError('Output frame count mismatch')
    summary = {'video': str(Path(args.input_video).resolve()), 'output_video': str(output_path.resolve()),
               'tactical_json': str(tactical_path.resolve()),
               'fps': fps, 'input_frames': len(frames), 'output_frames': written,
               'duration_seconds': len(frames) / fps, 'cache': str(cache.resolve()),
               'detection_cache': str(detection_cache.resolve()),
               'config': asdict(config), 'scene_cut_frames': [i for i, cut in enumerate(cuts) if cut],
               'ball_states': dict(Counter(item['state'] for item in ball_debug)),
               'possession_states': dict(Counter(item['state'] for item in possession.debug)),
               'team_assignments': dict(Counter(team for frame in teams for team in frame.values())),
               'team_profiles': team_assigner.profiles,
               'unique_player_track_ids': len({identity for frame in players for identity in frame}),
               'runtime_seconds': time.perf_counter() - started,
               'note': 'State coverage is not localization/possession accuracy; no ground truth supplied.'}
    output_path.with_suffix('.summary.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
