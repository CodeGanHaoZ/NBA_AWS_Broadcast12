"""战术视图变换: 单应性 (homography) 将球员投影到球场俯视图。"""
from copy import deepcopy

import cv2
import numpy as np

from .geometry import get_foot_position, measure_distance


class Homography:
    """基于源/目标点对计算单应矩阵并做透视变换。"""

    def __init__(self, source: np.ndarray, target: np.ndarray) -> None:
        if source.shape != target.shape:
            raise ValueError("Source and target must have the same shape.")
        if source.shape[1] != 2:
            raise ValueError("Source and target points must be 2D coordinates.")

        source = source.astype(np.float32)
        target = target.astype(np.float32)

        self.m, _ = cv2.findHomography(source, target)
        if self.m is None:
            raise ValueError("Homography matrix could not be calculated.")

    def transform_points(self, points: np.ndarray) -> np.ndarray:
        if points.size == 0:
            return points
        if points.shape[1] != 2:
            raise ValueError("Points must be 2D coordinates.")

        points = points.reshape(-1, 1, 2).astype(np.float32)
        points = cv2.perspectiveTransform(points, self.m)
        return points.reshape(-1, 2).astype(np.float32)


class TacticalViewConverter:
    """将视频坐标中的球员位置映射到 300x161 的球场战术视图。"""

    def __init__(self, court_image_path):
        self.court_image_path = court_image_path
        self.width = 300
        self.height = 161

        self.actual_width_in_meters = 28
        self.actual_height_in_meters = 15

        self.key_points = [
            # 左边线
            (0, 0),
            (0, int((0.91 / self.actual_height_in_meters) * self.height)),
            (0, int((5.18 / self.actual_height_in_meters) * self.height)),
            (0, int((10 / self.actual_height_in_meters) * self.height)),
            (0, int((14.1 / self.actual_height_in_meters) * self.height)),
            (0, int(self.height)),

            # 中线
            (int(self.width / 2), self.height),
            (int(self.width / 2), 0),

            # 左侧罚球线
            (int((5.79 / self.actual_width_in_meters) * self.width), int((5.18 / self.actual_height_in_meters) * self.height)),
            (int((5.79 / self.actual_width_in_meters) * self.width), int((10 / self.actual_height_in_meters) * self.height)),

            # 右边线
            (self.width, int(self.height)),
            (self.width, int((14.1 / self.actual_height_in_meters) * self.height)),
            (self.width, int((10 / self.actual_height_in_meters) * self.height)),
            (self.width, int((5.18 / self.actual_height_in_meters) * self.height)),
            (self.width, int((0.91 / self.actual_height_in_meters) * self.height)),
            (self.width, 0),

            # 右侧罚球线
            (int(((self.actual_width_in_meters - 5.79) / self.actual_width_in_meters) * self.width), int((5.18 / self.actual_height_in_meters) * self.height)),
            (int(((self.actual_width_in_meters - 5.79) / self.actual_width_in_meters) * self.width), int((10 / self.actual_height_in_meters) * self.height)),
        ]

    def validate_keypoints(self, keypoints_list):
        """按关键点间比例距离校验, 剔除误差超过 80% 的误检点。"""
        keypoints_list = deepcopy(keypoints_list)

        for frame_idx, frame_keypoints in enumerate(keypoints_list):
            frame_keypoints = frame_keypoints.xy.tolist()[0]

            # 检出点 (非 (0, 0)) 的索引
            detected_indices = [i for i, kp in enumerate(frame_keypoints) if kp[0] > 0 and kp[1] > 0]

            # 至少 3 个检出点才能校验比例
            if len(detected_indices) < 3:
                continue

            invalid_keypoints = []
            for i in detected_indices:
                if frame_keypoints[i][0] == 0 and frame_keypoints[i][1] == 0:
                    continue

                # 取另外两个检出点
                other_indices = [idx for idx in detected_indices if idx != i and idx not in invalid_keypoints]
                if len(other_indices) < 2:
                    continue

                j, k = other_indices[0], other_indices[1]

                # 检出点间距
                d_ij = measure_distance(frame_keypoints[i], frame_keypoints[j])
                d_ik = measure_distance(frame_keypoints[i], frame_keypoints[k])

                # 对应战术点间距
                t_ij = measure_distance(self.key_points[i], self.key_points[j])
                t_ik = measure_distance(self.key_points[i], self.key_points[k])

                # 比例比较, 80% 误差上限
                if t_ij > 0 and t_ik > 0:
                    prop_detected = d_ij / d_ik if d_ik > 0 else float('inf')
                    prop_tactical = t_ij / t_ik if t_ik > 0 else float('inf')

                    error = (prop_detected - prop_tactical) / prop_tactical
                    error = abs(error)

                    if error > 0.8:
                        keypoints_list[frame_idx].xy[0][i] *= 0
                        keypoints_list[frame_idx].xyn[0][i] *= 0
                        invalid_keypoints.append(i)

        return keypoints_list

    def transform_players_to_tactical_view(self, keypoints_list, player_tracks, ball_tracks=None):
        """将球员立足点与球心从视频坐标单应变换到战术视图坐标。

        返回 (球员位置, 球位置):
        - 球员位置: 每帧 {player_id: [x, y]}; 关键点不足 4 个的帧为空
        - 球位置: 每帧 {'x','y','source'} 或 None (无球/无单应时)
        """
        tactical_player_positions = []
        tactical_ball_positions = []

        for frame_idx, (frame_keypoints, frame_tracks) in enumerate(zip(keypoints_list, player_tracks)):
            tactical_positions = {}
            tactical_ball = None

            frame_keypoints = frame_keypoints.xy.tolist()[0]

            if frame_keypoints is None or len(frame_keypoints) == 0:
                tactical_player_positions.append(tactical_positions)
                tactical_ball_positions.append(None)
                continue

            detected_keypoints = frame_keypoints

            # 过滤未检出点 ((0,0))
            valid_indices = [i for i, kp in enumerate(detected_keypoints) if kp[0] > 0 and kp[1] > 0]

            # 可靠单应至少需 4 点
            if len(valid_indices) < 4:
                tactical_player_positions.append(tactical_positions)
                tactical_ball_positions.append(None)
                continue

            source_points = np.array([detected_keypoints[i] for i in valid_indices], dtype=np.float32)
            target_points = np.array([self.key_points[i] for i in valid_indices], dtype=np.float32)

            try:
                homography = Homography(source_points, target_points)

                for player_id, player_data in frame_tracks.items():
                    bbox = player_data["bbox"]
                    # 用 bbox 底边中心作为球员位置
                    player_position = np.array([get_foot_position(bbox)])
                    tactical_position = homography.transform_points(player_position)

                    # 超出战术视图范围则跳过
                    if tactical_position[0][0] < 0 or tactical_position[0][0] > self.width or \
                       tactical_position[0][1] < 0 or tactical_position[0][1] > self.height:
                        continue

                    tactical_positions[player_id] = tactical_position[0].tolist()

                # 球心投影(同一单应)
                if ball_tracks is not None:
                    ball = ball_tracks[frame_idx].get(1)
                    if ball is not None and ball.get('bbox'):
                        cx = (ball['bbox'][0] + ball['bbox'][2]) / 2
                        cy = (ball['bbox'][1] + ball['bbox'][3]) / 2
                        projected = homography.transform_points(np.array([[cx, cy]]))
                        bx, by = float(projected[0][0]), float(projected[0][1])
                        if 0 <= bx <= self.width and 0 <= by <= self.height:
                            tactical_ball = {'x': bx, 'y': by, 'source': ball.get('source', 'detected')}

            except (ValueError, cv2.error):
                # 单应失败则该帧留空
                pass

            tactical_player_positions.append(tactical_positions)
            tactical_ball_positions.append(tactical_ball)

        return tactical_player_positions, tactical_ball_positions
