"""Compact, high contrast video overlays. IDs denote tracks, not jersey numbers."""
import cv2


def draw_player_badge(frame, text, center_x, top_y, color, occupied):
    height, width = frame.shape[:2]
    scale = max(.38, min(.55, width / 3500))
    (tw, th), baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)
    bw, bh = tw + 18, th + baseline + 12
    left = max(0, min(width - bw, center_x - bw//2))
    top = max(0, min(height-bh, top_y-bh-8))
    for offset in (0, -bh-3, bh+3, -2*(bh+3)):
        y = max(0, min(height-bh, top+offset))
        box = (left, y, left+bw, y+bh)
        if not any(box[0] < b[2] and box[2] > b[0] and box[1] < b[3] and box[3] > b[1] for b in occupied):
            top = y
            break
    occupied.append((left, top, left+bw, top+bh))
    if abs(top + bh + 8 - top_y) > bh:
        cv2.line(frame, (center_x, top+bh), (center_x, max(0, top_y)), color, 1, cv2.LINE_AA)
    cv2.rectangle(frame, (left, top), (left+bw, top+bh), (25, 27, 32), -1)
    cv2.rectangle(frame, (left, top), (left+4, top+bh), color, -1)
    cv2.putText(frame, text, (left+10, top+th+5), cv2.FONT_HERSHEY_SIMPLEX, scale,
                (250, 250, 250), 1, cv2.LINE_AA)


def draw_status(frame, index, fps, people, teams, holder, detail, ball, labels):
    width = min(455, frame.shape[1]-24)
    left = frame.shape[1]-width-12
    overlay = frame[12:114, left:left+width]
    overlay[:] = (overlay.astype(float)*.22 + 22*.78).astype('uint8')
    team = teams.get(holder, 0)
    owner = '{} #{}'.format(labels.get(team, 'UNKNOWN'), holder) if holder != -1 else 'UNKNOWN'
    lines = [('{:.2f}s  |  {} players  |  IDs = tracks'.format(index/fps, len(people)), (235, 235, 235)),
             ('CONTROL: {}  [{}]'.format(owner, detail['state']), (70, 235, 150)),
             ('{} / {}   BALL: {}'.format(labels[1], labels[2], ball['source'] if ball else 'lost'), (210, 210, 210))]
    for line, (text, color) in enumerate(lines):
        cv2.putText(frame, text, (left+12, 39+line*29), cv2.FONT_HERSHEY_SIMPLEX, .51, color, 1, cv2.LINE_AA)
    return frame
