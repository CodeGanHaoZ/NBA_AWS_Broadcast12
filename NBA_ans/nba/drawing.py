"""视频标注绘制: 基础图形绘制函数 + 全部 Drawer 类。

Drawer 顺序对应 main.py 中的绘制流水线:
PlayerTracks -> BallTracks -> CourtKeypoint -> FrameNumber
-> TeamBallControl -> PassInterception -> SpeedAndDistance -> TacticalView
"""
import cv2
import numpy as np
import supervision as sv

from .geometry import get_bbox_width, get_center_of_bbox, get_foot_position
from .presentation import draw_player_badge


# ---------- 基础图形 ----------

def draw_traingle(frame, bbox, color):
    """在 bbox 顶部绘制实心三角形 (球指针)。"""
    y = int(bbox[1])
    x, _ = get_center_of_bbox(bbox)

    triangle_points = np.array([
        [x, y],
        [x - 10, y - 20],
        [x + 10, y - 20],
    ])
    cv2.drawContours(frame, [triangle_points], 0, color, cv2.FILLED)
    cv2.drawContours(frame, [triangle_points], 0, (0, 0, 0), 2)

    return frame


def draw_ellipse(frame, bbox, color, track_id=None):
    """在 bbox 底部绘制椭圆轨迹圈, 可选 track_id 标签。"""
    y2 = int(bbox[3])
    x_center, _ = get_center_of_bbox(bbox)
    width = get_bbox_width(bbox)

    cv2.ellipse(
        frame,
        center=(x_center, y2),
        axes=(int(width), int(0.35 * width)),
        angle=0.0,
        startAngle=-45,
        endAngle=235,
        color=color,
        thickness=2,
        lineType=cv2.LINE_4
    )

    rectangle_width = 40
    rectangle_height = 20
    x1_rect = x_center - rectangle_width // 2
    x2_rect = x_center + rectangle_width // 2
    y1_rect = (y2 - rectangle_height // 2) + 15
    y2_rect = (y2 + rectangle_height // 2) + 15

    if track_id is not None:
        cv2.rectangle(frame,
                      (int(x1_rect), int(y1_rect)),
                      (int(x2_rect), int(y2_rect)),
                      color,
                      cv2.FILLED)

        x1_text = x1_rect + 12
        if track_id > 99:
            x1_text -= 10

        cv2.putText(
            frame,
            f"{track_id}",
            (int(x1_text), int(y1_rect + 15)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 0, 0),
            2
        )

    return frame


# ---------- 绘制器 ----------

class PlayerTracksDrawer:
    """球员轨迹圈 (按球队配色) + 持球球员三角标记。"""

    def __init__(self, team_1_color=(235, 235, 235), team_2_color=(255, 175, 70), team_labels=None):
        self.default_player_team_id = 0
        self.team_1_color = team_1_color
        self.team_2_color = team_2_color
        self.team_labels = team_labels or {0: 'UNKNOWN', 1: 'WHITE', 2: 'NAVY'}

    def draw(self, video_frames, tracks, player_assignment, ball_aquisition, possession_states=None):
        output_video_frames = []
        for frame_num, frame in enumerate(video_frames):
            frame = frame.copy()

            player_dict = tracks[frame_num]

            player_assignment_for_frame = player_assignment[frame_num]

            player_id_has_ball = ball_aquisition[frame_num]

            occupied = []
            for track_id, player in player_dict.items():
                team_id = player_assignment_for_frame.get(track_id, self.default_player_team_id)

                if team_id == 1:
                    color = self.team_1_color
                elif team_id == 2:
                    color = self.team_2_color
                else:
                    color = (155, 155, 155)

                display_bbox = player.get('display_bbox', player['bbox'])
                x1, y1, x2, y2 = map(int, display_bbox)
                cx = (x1 + x2) // 2
                axes = (max(8, int((x2-x1)*.55)), max(4, int((x2-x1)*.15)))
                cv2.ellipse(frame, (cx, y2), axes, 0, 0, 360, (20, 20, 20), 5, cv2.LINE_AA)
                cv2.ellipse(frame, (cx, y2), axes, 0, 0, 360, color, 2, cv2.LINE_AA)
                owner = track_id == player_id_has_ball
                held = owner and possession_states is not None and possession_states[frame_num]['state'] == 'held'
                label = '{} #{}'.format(self.team_labels.get(team_id, 'UNKNOWN'), track_id)
                if owner:
                    label += ' | HOLD' if held else ' | CONTROL'
                    highlight = (0, 180, 255) if held else (70, 235, 150)
                    cv2.rectangle(frame, (x1-3, y1-3), (x2+3, y2+3), highlight, 2, cv2.LINE_AA)
                else:
                    highlight = color
                draw_player_badge(frame, label, cx, y1, highlight, occupied)

            output_video_frames.append(frame)

        return output_video_frames


class BallTracksDrawer:
    """绿色三角球指针。"""

    def __init__(self):
        self.ball_pointer_color = (0, 255, 0)

    def draw(self, video_frames, tracks):
        output_video_frames = []
        for frame_num, frame in enumerate(video_frames):
            frame = frame.copy()
            ball_dict = tracks[frame_num]

            for _, ball in ball_dict.items():
                if ball["bbox"] is None:
                    continue
                source = ball.get('source', 'detected')
                color = self.ball_pointer_color if source == 'detected' else (0, 215, 255)
                x1, y1, x2, y2 = ball['bbox']
                point = (int((x1+x2)/2), int((y1+y2)/2))
                radius = max(7, min(18, int(max(x2-x1, y2-y1)/2)+3))
                cv2.circle(frame, point, radius+2, (20, 20, 20), 3, cv2.LINE_AA)
                cv2.circle(frame, point, radius, color, 2, cv2.LINE_AA)
                if source != 'detected':
                    x, y = int(ball['bbox'][0]), max(15, int(ball['bbox'][1]) - 25)
                    cv2.putText(frame, source, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

            output_video_frames.append(frame)

        return output_video_frames


class CourtKeypointDrawer:
    """球场关键点圆点 + 编号标签。"""

    def __init__(self):
        self.keypoint_color = '#ff2c2c'

    def draw(self, frames, court_keypoints):
        vertex_annotator = sv.VertexAnnotator(
            color=sv.Color.from_hex(self.keypoint_color),
            radius=8)

        vertex_label_annotator = sv.VertexLabelAnnotator(
            color=sv.Color.from_hex(self.keypoint_color),
            text_color=sv.Color.WHITE,
            text_scale=0.5,
            text_thickness=1
        )

        output_frames = []
        for index, frame in enumerate(frames):
            annotated_frame = frame.copy()

            keypoints = court_keypoints[index]
            # 圆点
            annotated_frame = vertex_annotator.annotate(
                scene=annotated_frame,
                key_points=keypoints)
            # 标签 (PyTorch tensor -> numpy)
            keypoints_numpy = keypoints.cpu().numpy()
            annotated_frame = vertex_label_annotator.annotate(
                scene=annotated_frame,
                key_points=keypoints_numpy)

            output_frames.append(annotated_frame)

        return output_frames


class TeamBallControlDrawer:
    """双方累计球权占比半透明面板。"""

    def __init__(self):
        pass

    def get_team_ball_control(self, player_assignment, ball_aquisition):
        """返回每帧球队控制数组 (1/2/-1)。"""
        team_ball_control = []
        for player_assignment_frame, ball_aquisition_frame in zip(player_assignment, ball_aquisition):
            if ball_aquisition_frame == -1:
                team_ball_control.append(-1)
                continue
            if ball_aquisition_frame not in player_assignment_frame:
                team_ball_control.append(-1)
                continue
            team = player_assignment_frame[ball_aquisition_frame]
            team_ball_control.append(team if team in (1, 2) else -1)

        team_ball_control = np.array(team_ball_control)
        return team_ball_control

    def draw(self, video_frames, player_assignment, ball_aquisition):
        team_ball_control = self.get_team_ball_control(player_assignment, ball_aquisition)

        output_video_frames = []
        for frame_num, frame in enumerate(video_frames):
            frame_drawn = self.draw_frame(frame, frame_num, team_ball_control)
            output_video_frames.append(frame_drawn)
        return output_video_frames

    def draw_frame(self, frame, frame_num, team_ball_control):
        # 半透明矩形
        overlay = frame.copy()
        font_scale = 0.7
        font_thickness = 2

        # 面板位置
        frame_height, frame_width = overlay.shape[:2]
        rect_x1 = int(frame_width * 0.60)
        rect_y1 = int(frame_height * 0.75)
        rect_x2 = int(frame_width * 0.99)
        rect_y2 = int(frame_height * 0.90)
        # 文本位置
        text_x = int(frame_width * 0.63)
        text_y1 = int(frame_height * 0.80)
        text_y2 = int(frame_height * 0.88)

        cv2.rectangle(overlay, (rect_x1, rect_y1), (rect_x2, rect_y2), (255, 255, 255), -1)
        alpha = 0.8
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)

        team_ball_control_till_frame = team_ball_control[:frame_num + 1]
        # 各队累计控制帧数
        team_1_num_frames = team_ball_control_till_frame[team_ball_control_till_frame == 1].shape[0]
        team_2_num_frames = team_ball_control_till_frame[team_ball_control_till_frame == 2].shape[0]
        team_1 = team_1_num_frames / (team_ball_control_till_frame.shape[0])
        team_2 = team_2_num_frames / (team_ball_control_till_frame.shape[0])

        cv2.putText(frame, f"Team 1 Ball Control: {team_1 * 100:.2f}%", (text_x, text_y1),
                    cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), font_thickness)
        cv2.putText(frame, f"Team 2 Ball Control: {team_2 * 100:.2f}%", (text_x, text_y2),
                    cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), font_thickness)

        return frame


class FrameNumberDrawer:
    """左上角帧号。"""

    def __init__(self):
        pass

    def draw(self, frames):
        output_frames = []
        for i in range(len(frames)):
            frame = frames[i].copy()
            cv2.putText(frame, str(i), (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            output_frames.append(frame)
        return output_frames


class PassInterceptionDrawer:
    """双方传球/抢断统计半透明面板。"""

    def __init__(self):
        pass

    def get_stats(self, passes, interceptions):
        """返回 (队1传球, 队2传球, 队1抢断, 队2抢断)。"""
        team1_passes = []
        team2_passes = []
        team1_interceptions = []
        team2_interceptions = []

        for frame_num, (pass_frame, interception_frame) in enumerate(zip(passes, interceptions)):
            if pass_frame == 1:
                team1_passes.append(frame_num)
            elif pass_frame == 2:
                team2_passes.append(frame_num)

            if interception_frame == 1:
                team1_interceptions.append(frame_num)
            elif interception_frame == 2:
                team2_interceptions.append(frame_num)

        return len(team1_passes), len(team2_passes), len(team1_interceptions), len(team2_interceptions)

    def draw(self, video_frames, passes, interceptions):
        output_video_frames = []
        for frame_num, frame in enumerate(video_frames):
            frame_drawn = self.draw_frame(frame, frame_num, passes, interceptions)
            output_video_frames.append(frame_drawn)
        return output_video_frames

    def draw_frame(self, frame, frame_num, passes, interceptions):
        # 半透明矩形
        overlay = frame.copy()
        font_scale = 0.7
        font_thickness = 2

        # 面板位置
        frame_height, frame_width = overlay.shape[:2]
        rect_x1 = int(frame_width * 0.16)
        rect_y1 = int(frame_height * 0.75)
        rect_x2 = int(frame_width * 0.55)
        rect_y2 = int(frame_height * 0.90)
        # 文本位置
        text_x = int(frame_width * 0.19)
        text_y1 = int(frame_height * 0.80)
        text_y2 = int(frame_height * 0.88)

        cv2.rectangle(overlay, (rect_x1, rect_y1), (rect_x2, rect_y2), (255, 255, 255), -1)
        alpha = 0.8
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)

        # 截至当前帧的统计
        passes_till_frame = passes[:frame_num + 1]
        interceptions_till_frame = interceptions[:frame_num + 1]

        team1_passes, team2_passes, team1_interceptions, team2_interceptions = self.get_stats(
            passes_till_frame,
            interceptions_till_frame
        )

        cv2.putText(
            frame,
            f"Team 1 - Passes: {team1_passes} Interceptions: {team1_interceptions}",
            (text_x, text_y1),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            (0, 0, 0),
            font_thickness
        )

        cv2.putText(
            frame,
            f"Team 2 - Passes: {team2_passes} Interceptions: {team2_interceptions}",
            (text_x, text_y2),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            (0, 0, 0),
            font_thickness
        )

        return frame


class TacticalViewDrawer:
    """左上角战术视图小窗 (球场底图 + 球员圆点 + 关键点)。"""

    def __init__(self, team_1_color=(235, 235, 235), team_2_color=(255, 175, 70)):
        self.start_x = 20
        self.start_y = 40
        self.team_1_color = team_1_color
        self.team_2_color = team_2_color

    def draw(self,
             video_frames,
             court_image_path,
             width,
             height,
             tactical_court_keypoints,
             tactical_player_positions=None,
             player_assignment=None,
             ball_acquisition=None):
        court_image = cv2.imread(court_image_path)
        court_image = cv2.resize(court_image, (width, height))

        output_video_frames = []
        for frame_idx, frame in enumerate(video_frames):
            frame = frame.copy()

            y1 = self.start_y
            y2 = self.start_y + height
            x1 = self.start_x
            x2 = self.start_x + width

            alpha = 0.6  # 透明度
            overlay = frame[y1:y2, x1:x2].copy()
            cv2.addWeighted(court_image, alpha, overlay, 1 - alpha, 0, frame[y1:y2, x1:x2])

            # 关键点
            for keypoint_index, keypoint in enumerate(tactical_court_keypoints):
                x, y = keypoint
                x += self.start_x
                y += self.start_y
                cv2.circle(frame, (x, y), 5, (0, 0, 255), -1)
                cv2.putText(frame, str(keypoint_index), (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

            # 战术视图中的球员位置
            if tactical_player_positions and player_assignment and frame_idx < len(tactical_player_positions):
                frame_positions = tactical_player_positions[frame_idx]
                frame_assignments = player_assignment[frame_idx] if frame_idx < len(player_assignment) else {}
                player_with_ball = ball_acquisition[frame_idx] if ball_acquisition and frame_idx < len(ball_acquisition) else -1

                for player_id, position in frame_positions.items():
                    team_id = frame_assignments.get(player_id, 0)

                    color = self.team_1_color if team_id == 1 else self.team_2_color if team_id == 2 else (155, 155, 155)

                    x, y = int(position[0]) + self.start_x, int(position[1]) + self.start_y

                    # 球员圆点
                    player_radius = 8
                    cv2.circle(frame, (x, y), player_radius, color, -1)

                    # 持球球员高亮圈
                    if player_id == player_with_ball:
                        cv2.circle(frame, (x, y), player_radius + 3, (0, 0, 255), 2)

            output_video_frames.append(frame)

        return output_video_frames


class SpeedAndDistanceDrawer:
    """球员下方速度 (km/h) 与累计跑动距离 (m) 文本。"""

    def __init__(self):
        self.total_distances = {}

    def draw(self, video_frames, player_tracks, player_distances_per_frame, player_speed_per_frame):
        output_video_frames = []
        total_distances = self.total_distances

        for frame, player_tracks, player_distance, player_speed in zip(
                video_frames, player_tracks, player_distances_per_frame, player_speed_per_frame):
            output_frame = frame.copy()

            # 累计距离
            for player_id, distance in player_distance.items():
                if player_id not in total_distances:
                    total_distances[player_id] = 0
                total_distances[player_id] += distance

            for player_id, bbox in player_tracks.items():
                x1, y1, x2, y2 = bbox['bbox']
                position = [int((x1 + x2) / 2), int(y2)]
                position[1] += 40

                distance = total_distances.get(player_id, None)
                speed = player_speed.get(player_id, None)
                if speed is not None:
                    cv2.putText(output_frame, f"{speed:.2f} km/h", position,
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
                if distance is not None:
                    cv2.putText(output_frame, f"{distance:.2f} m", (position[0], position[1] + 20),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)

            output_video_frames.append(output_frame)

        return output_video_frames
