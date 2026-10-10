/**
 * YOLOv8n ONNX 检测通道（模型优先）
 * 本地模型：/models/yolov8n.onnx（COCO 80 类，fp16 量化，约 8.5MB）
 * 只取 person(0) 与 sports ball(32) 两类；输出图像像素坐标。
 * 离线铁律：wasm 与模型全部本地，无任何远程请求。
 */
import * as ort from 'onnxruntime-web'

ort.env.wasm.wasmPaths = '/ort/'
ort.env.wasm.numThreads = 1
ort.env.wasm.simd = true

export const MODEL_URL = '/models/yolov8n.onnx'
export const MODEL_BYTES = 8521088
const INPUT_SIZE = 640
const CONF_THRES = 0.22
const IOU_THRES = 0.45
export const CLASS_PERSON = 0
export const CLASS_BALL = 32

/** 模型是否就位（HEAD 探测，不下载正文） */
export async function modelAvailable() {
  try {
    const r = await fetch(MODEL_URL, { method: 'HEAD' })
    return r.ok
  } catch {
    return false
  }
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const uni = a.w * a.h + b.w * b.h - inter
  return uni <= 0 ? 0 : inter / uni
}

function nms(boxes) {
  boxes.sort((p, q) => q.score - p.score)
  const keep = []
  const dead = new Uint8Array(boxes.length)
  for (let i = 0; i < boxes.length; i++) {
    if (dead[i]) continue
    keep.push(boxes[i])
    for (let j = i + 1; j < boxes.length; j++) {
      if (!dead[j] && iou(boxes[i], boxes[j]) > IOU_THRES) dead[j] = 1
    }
  }
  return keep
}

/** letterbox：等比缩放并居中填充到 640x640，返回 scale 与 pad */
function letterbox(sw, sh) {
  const s = Math.min(INPUT_SIZE / sw, INPUT_SIZE / sh)
  const nw = Math.round(sw * s), nh = Math.round(sh * s)
  const padX = Math.floor((INPUT_SIZE - nw) / 2), padY = Math.floor((INPUT_SIZE - nh) / 2)
  return { s, nw, nh, padX, padY }
}

export class YoloDetector {
  constructor() {
    this.session = null
    this.pending = null
    this.inputName = 'images'
    this.dtype = 'float16'
    this.ready = false
    this.lastInferMs = 0
  }

  get engineLabel() {
    return this.ready ? 'YOLOv8n · ONNX Runtime WebAssembly' : '模型未加载'
  }

  async load(onProgress) {
    if (this.session) return this
    if (this.pending) { await this.pending; return this }
    this.pending = (async () => {
      if (onProgress) onProgress({ phase: 'loading-model', message: '载入检测模型' })
      this.session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      })
      this.inputName = this.session.inputNames[0]
      this.ready = true
    })()
    try {
      await this.pending
    } finally {
      this.pending = null
    }
    return this
  }

  /** 把 ImageData 转成模型输入张量 */
  #tensor(img, w, h) {
    const { s, nw, nh, padX, padY } = letterbox(w, h)
    const NCHW = INPUT_SIZE * INPUT_SIZE * 3
    const f32 = new Float32Array(NCHW)
    const px = img.data
    for (let y = 0; y < nh; y++) {
      const sy = Math.min(h - 1, Math.floor(y / s))
      for (let x = 0; x < nw; x++) {
        const sx = Math.min(w - 1, Math.floor(x / s))
        const si = (sy * w + sx) * 4
        const di = (y + padY) * INPUT_SIZE + (x + padX)
        f32[di] = px[si] / 255
        f32[INPUT_SIZE * INPUT_SIZE + di] = px[si + 1] / 255
        f32[INPUT_SIZE * INPUT_SIZE * 2 + di] = px[si + 2] / 255
      }
    }
    if (this.dtype === 'float16') {
      const f16 = new Uint16Array(NCHW)
      for (let i = 0; i < NCHW; i++) f16[i] = floatToHalf(f32[i])
      return { tensor: new ort.Tensor('float16', f16, [1, 3, INPUT_SIZE, INPUT_SIZE]), box: { s, padX, padY } }
    }
    return { tensor: new ort.Tensor('float32', f32, [1, 3, INPUT_SIZE, INPUT_SIZE]), box: { s, padX, padY } }
  }

  /**
   * 单帧检测
   * @param {ImageData} img
   * @param {number} w
   * @param {number} h
   * @returns {Promise<Array<{x:number,y:number,w:number,h:number,score:number,cls:number}>>} 图像像素坐标
   */
  async detect(img, w, h) {
    if (!this.ready) return []
    const t0 = performance.now()
    const { tensor, box } = this.#tensor(img, w, h)
    let out
    try {
      out = await this.session.run({ [this.inputName]: tensor })
    } catch (e) {
      if (this.dtype === 'float16') {
        this.dtype = 'float32'
        const retry = this.#tensor(img, w, h)
        out = await this.session.run({ [this.inputName]: retry.tensor })
        box.s = retry.box.s; box.padX = retry.box.padX; box.padY = retry.box.padY
      } else {
        throw e
      }
    }
    this.lastInferMs = performance.now() - t0
    const key = Object.keys(out)[0]
    const o = out[key]
    const dims = o.dims
    const data = o.data
    // 兼容 [1,84,N] 与 [1,N,84]
    const attrs = dims[1] <= 128 ? dims[1] : dims[2]
    const n = dims[1] <= 128 ? dims[2] : dims[1]
    const rowMajor = dims[1] > 128
    const get = (i, j) => (rowMajor ? data[i * attrs + j] : data[j * n + i])
    const boxes = []
    for (let i = 0; i < n; i++) {
      const cx = get(i, 0), cy = get(i, 1), bw = get(i, 2), bh = get(i, 3)
      let bestCls = -1, bestScore = 0
      for (let c = 4; c < attrs; c++) {
        const sc = get(i, c)
        if (sc > bestScore) { bestScore = sc; bestCls = c - 4 }
      }
      if (bestScore < CONF_THRES) continue
      if (bestCls !== CLASS_PERSON && bestCls !== CLASS_BALL) continue
      // 还原 letterbox：640 -> 原图
      const x1 = (cx - bw / 2 - box.padX) / box.s
      const y1 = (cy - bh / 2 - box.padY) / box.s
      const ww = bw / box.s
      const hh = bh / box.s
      if (ww <= 0 || hh <= 0) continue
      boxes.push({ x: x1, y: y1, w: ww, h: hh, score: bestScore, cls: bestCls })
    }
    return nms(boxes)
  }
}

/** Float32 -> Float16 位模式 */
function floatToHalf(v) {
  const f32 = new Float32Array(1)
  const i32 = new Int32Array(f32.buffer)
  f32[0] = v
  const x = i32[0]
  let bits = (x >> 16) & 0x8000
  let m = (x >> 12) & 0x07ff
  const e = (x >> 23) & 0xff
  if (e < 103) return bits
  if (e > 142) { bits |= 0x7c00; bits |= (e === 255 && (x & 0x007fffff)) ? 0x0200 : 0; return bits }
  if (e < 113) { m |= 0x0800; bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1); return bits }
  bits |= ((e - 112) << 10) | (m >> 1)
  bits += m & 1
  return bits
}
