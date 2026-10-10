/**
 * 视频源读取 + 端到端分析入口
 * 通道 A（模型优先）：YOLOv8n ONNX 检测 person/sports ball -> MultiTracker 数据关联
 * 通道 B（算法兜底）：人工锚点 + NCC 模板匹配逐帧跟随
 * 两条通道共用同一套「像素 -> 球场英尺」映射与结果装配。
 */
import { modelAvailable, YoloDetector, CLASS_PERSON, CLASS_BALL } from './yolo.js'
import { MultiTracker, nccTrack, toGray } from './tracker.js'
import { defaultCalibration, applyH, insideCourt } from './homography.js'
import { framesFromPixelTracks, buildResult } from './pipeline.js'

/** 打开本地视频/URL，返回可 seek 的 video 元素与元数据 */
export async function loadVideo(source) {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source)
  const v = document.createElement('video')
  v.src = url
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('视频元数据读取超时')), 20000)
    v.onloadedmetadata = () => { clearTimeout(to); resolve() }
    v.onerror = () => { clearTimeout(to); reject(new Error('视频无法解码或格式不受支持')) }
  })
  const durationMs = Math.max(1, Math.round(v.duration * 1000))
  return { video: v, url, width: v.videoWidth, height: v.videoHeight, durationMs }
}

function seekTo(v, t) {
  return new Promise(resolve => {
    const onSeeked = () => { v.removeEventListener('seeked', onSeeked); resolve() }
    v.addEventListener('seeked', onSeeked)
    v.currentTime = Math.min(t / 1000, Math.max(0, v.duration - 0.02))
  })
}

/** 按目标 fps 抽取帧，逐帧回调（避免一次性占用大量内存） */
export async function extractFrames(video, opts, onFrame) {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const fps = opts.fps ?? 5
  const startMs = opts.startMs ?? 0
  const endMs = Math.min(opts.durationMs ? startMs + opts.durationMs : video.duration * 1000, video.duration * 1000)
  const step = 1000 / fps
  const total = Math.max(1, Math.floor((endMs - startMs) / step))
  let i = 0
  for (let t = startMs; t < endMs; t += step) {
    await seekTo(video, t)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    onFrame({ t: Math.round(t), imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) }, i / total)
    i++
  }
  return total
}

/**
 * 端到端分析
 * @param {File|string} source 视频文件或 URL
 * @param {object} opts { mode:'auto'|'model'|'fallback', fps, startMs, durationMs, anchors }
 * @param {(p:{phase:string,message:string,progress:number})=>void} onProgress
 * @returns {Promise<object>} AnalysisResult
 */
export async function analyzeVideo(source, opts = {}, onProgress = () => {}) {
  onProgress({ phase: 'open', message: '打开视频', progress: 0 })
  const { video, width, height, durationMs } = await loadVideo(source)

  const mode = opts.mode && opts.mode !== 'auto'
    ? opts.mode
    : ((await modelAvailable()) ? 'model' : 'fallback')

  const courtMap = opts.courtMap || defaultCalibration(width, height)
  const H = courtMap.H
  const fps = opts.fps ?? 5
  const startMs = opts.startMs ?? 0
  const durationMs2 = opts.durationMs ?? Math.min(8000, durationMs)

  const rawFrames = []
  let detector = null
  let tracker = null
  let anchors = null
  let prevGray = null

  if (mode === 'model') {
    onProgress({ phase: 'loading-model', message: '载入 YOLOv8n 检测模型', progress: 0.02 })
    detector = new YoloDetector()
    await detector.load()
    tracker = new MultiTracker()
    tracker.scaleGate(width)
  } else {
    onProgress({ phase: 'prepare', message: '准备模板跟踪（算法通道）', progress: 0.02 })
    anchors = (opts.anchors && opts.anchors.length ? opts.anchors : []).map((a, i) => ({
      id: a.id || `A${i + 1}`,
      x: a.x, y: a.y, cls: a.cls === 32 || a.kind === 'ball' ? CLASS_BALL : CLASS_PERSON
    }))
    if (!anchors.length) throw new Error('算法通道需要至少 1 个人工锚点（球员/球）')
  }

  await extractFrames(video, { fps, startMs, durationMs: durationMs2 }, (fr, p) => {
    const { imageData } = fr
    if (mode === 'model') {
      detector.detect(imageData, width, height).then(dets => {
        const tracks = tracker.update(fr.t, dets)
        rawFrames.push({
          t: fr.t,
          dets: tracks.map(tr => ({ id: tr.id, cx: tr.cx, cy: tr.cy, cls: tr.cls, conf: tr.score }))
        })
      })
      onProgress({ phase: 'detect', message: `检测第 ${rawFrames.length + 1} 帧`, progress: 0.05 + p * 0.8 })
    } else {
      const { gray } = toGray(imageData, Math.max(1, Math.round(width / 480)))
      const k = Math.max(1, Math.round(width / 480))
      const gw = Math.floor(width / k), gh = Math.floor(height / k)
      const dets = []
      for (const a of anchors) {
        const ax = a.x / k, ay = a.y / k
        if (!prevGray) { a._x = ax; a._y = ay }
        else {
          const r = nccTrack(prevGray, gray, gw, gh, a._x ?? ax, a._y ?? ay, 8, 12)
          a._x = r.x; a._y = r.y
          a._score = r.score
        }
        dets.push({ id: a.id, cx: (a._x ?? ax) * k, cy: (a._y ?? ay) * k, cls: a.cls, conf: a._score ?? 0.6 })
      }
      prevGray = gray
      rawFrames.push({ t: fr.t, dets })
      onProgress({ phase: 'track', message: `跟踪第 ${rawFrames.length} 帧`, progress: 0.05 + p * 0.8 })
    }
  })

  // 模型通道为异步推理，需等待全部完成
  if (mode === 'model') {
    let guard = 0
    const stepTotal = Math.max(1, Math.floor(durationMs2 / (1000 / fps)))
    while (rawFrames.length < stepTotal && guard < stepTotal * 40) {
      await new Promise(r => setTimeout(r, 60))
      guard++
    }
    rawFrames.sort((a, b) => a.t - b.t)
  }

  onProgress({ phase: 'map', message: '坐标映射与追踪合成', progress: 0.9 })
  const meta = {
    sourceName: (opts.name || (typeof source === 'string' ? source.split('/').pop() : source.name) || '未命名视频'),
    sourceId: `vid_${Date.now().toString(36)}`,
    durationMs: durationMs2,
    videoDurationMs: durationMs,
    fps,
    width,
    height,
    engine: mode === 'model' ? 'yolo' : 'fallback',
    engineLabel: mode === 'model' ? 'YOLOv8n · ONNX Runtime Web' : 'NCC 模板跟踪 · 人工锚点',
    calibrated: true,
    courtMap,
    anchorCount: anchors ? anchors.length : 0,
    inferMs: detector ? Math.round(detector.lastInferMs) : 0
  }
  const mapped = framesFromPixelTracks(rawFrames, H, meta)
  const result = buildResult(mapped)
  onProgress({ phase: 'done', message: '分析完成', progress: 1 })
  void applyH; void insideCourt
  return result
}

export { CLASS_PERSON, CLASS_BALL }
