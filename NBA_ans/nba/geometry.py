"""bounding box 与坐标几何工具。"""


def get_center_of_bbox(bbox):
    """计算 bbox (x1, y1, x2, y2) 的中心点坐标 (x, y)。"""
    x1, y1, x2, y2 = bbox
    return int((x1 + x2) / 2), int((y1 + y2) / 2)


def get_bbox_width(bbox):
    """计算 bbox 宽度。"""
    return bbox[2] - bbox[0]


def measure_distance(p1, p2):
    """计算两点间欧氏距离。"""
    return ((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2) ** 0.5


def get_foot_position(bbox):
    """计算 bbox 底边中心点 (球员立足点)。"""
    x1, y1, x2, y2 = bbox
    return int((x1 + x2) / 2), int(y2)
