"""Video I/O with bounded memory, original FPS, and local intermediate caches."""
import itertools
import os
import pickle

import cv2


class VideoFrames:
    """Re-readable, indexable video sequence. Only requested batches enter memory."""
    def __init__(self, path):
        self.path = str(path)
        self.cap = cv2.VideoCapture(self.path)
        if not self.cap.isOpened():
            raise ValueError('Cannot open video: ' + self.path)
        self.fps = float(self.cap.get(cv2.CAP_PROP_FPS))
        if self.fps <= 0:
            raise ValueError('Video has no valid FPS')
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.count = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.next_index = 0

    def __len__(self):
        return self.count

    def __getitem__(self, index):
        if isinstance(index, slice):
            return [self[i] for i in range(*index.indices(len(self)))]
        if index < 0:
            index += len(self)
        if not 0 <= index < len(self):
            raise IndexError(index)
        # Some broadcast MP4s report the requested POS_FRAMES yet return a
        # different frame after a seek. Decode/grab from a known position.
        if index < self.next_index:
            self.cap.release()
            self.cap = cv2.VideoCapture(self.path)
            self.next_index = 0
        while self.next_index < index:
            if not self.cap.grab():
                raise IOError('Cannot advance to frame {}'.format(index))
            self.next_index += 1
        ok, frame = self.cap.read()
        if not ok:
            raise IOError('Cannot decode frame {}'.format(index))
        self.next_index = index + 1
        return frame

    def __iter__(self):
        capture = cv2.VideoCapture(self.path)
        try:
            for index in range(len(self)):
                ok, frame = capture.read()
                if not ok:
                    raise IOError('Cannot decode frame {}'.format(index))
                yield frame
        finally:
            capture.release()

    def close(self):
        self.cap.release()


def read_video(video_path, lazy=False):
    frames = VideoFrames(video_path)
    if lazy:
        return frames
    try:
        return list(frames)
    finally:
        frames.close()


def save_video(output_video_frames, output_video_path, fps=24.0):
    parent = os.path.dirname(str(output_video_path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    iterator = iter(output_video_frames)
    first = next(iterator, None)
    if first is None:
        raise ValueError('No frames to write')
    if fps <= 0:
        raise ValueError('FPS must be positive')
    codec = 'mp4v' if str(output_video_path).lower().endswith('.mp4') else 'XVID'
    height, width = first.shape[:2]
    writer = cv2.VideoWriter(str(output_video_path), cv2.VideoWriter_fourcc(*codec), fps, (width, height))
    if not writer.isOpened():
        raise IOError('Cannot open output: ' + str(output_video_path))
    count = 0
    try:
        for frame in itertools.chain([first], iterator):
            if frame.shape[:2] != (height, width):
                raise ValueError('Output frame dimensions changed')
            writer.write(frame)
            count += 1
    finally:
        writer.release()
    return count


def save_stub(stub_path, obj):
    if stub_path is None:
        return
    parent = os.path.dirname(str(stub_path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    temporary = str(stub_path) + '.tmp'
    with open(temporary, 'wb') as stream:
        pickle.dump(obj, stream)
    os.replace(temporary, stub_path)


def read_stub(read_from_stub, stub_path):
    if read_from_stub and stub_path is not None and os.path.exists(stub_path):
        with open(stub_path, 'rb') as stream:
            return pickle.load(stream)
    return None
