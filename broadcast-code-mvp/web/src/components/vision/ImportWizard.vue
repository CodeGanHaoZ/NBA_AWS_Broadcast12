<script setup>
/** 导入向导：上传视频 -> 参数 -> 分析（模型优先 / 算法兜底自动切换） */
import { ref, computed } from 'vue'
import { S, analyzeFile, loadSynthetic } from '../../lib/store.js'
import { modelAvailable } from '../../lib/vision/yolo.js'

const emit = defineEmits(['close'])
const file = ref(null)
const over = ref(false)
const duration = ref(10)
const fps = ref(5)
const busy = ref(false)
const modelState = ref('checking')

modelAvailable().then(ok => { modelState.value = ok ? 'ready' : 'missing' })

const canRun = computed(() => !!file.value && !busy.value)
const pctText = computed(() => Math.round((S.progress.value || 0) * 100) + '%')

function pick(e) {
  const f = e.target.files?.[0]
  if (f) { file.value = f; S.sourceName = f.name }
}
function onDrop(e) {
  e.preventDefault(); over.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) { file.value = f; S.sourceName = f.name }
}

async function run() {
  if (!file.value) return
  busy.value = true
  await analyzeFile(file.value, { durationMs: duration.value * 1000, fps: fps.value, mode: 'auto' })
  busy.value = false
  if (S.stage === 'ready') emit('close')
}
function useSample() {
  loadSynthetic()
  emit('close')
}
</script>

<template>
  <div class="vb-modal" @click.self="emit('close')">
    <div class="vb-modal__box">
      <div class="vb-modal__head">
        <span class="bc-kicker">分析新回合 <i>/</i> 新增</span>
        <button class="bc-btn bc-btn--ghost bc-btn--sm" @click="emit('close')">关闭</button>
      </div>

      <div class="vb-drop" :class="{ 'is-over': over }"
           @dragover.prevent="over = true" @dragleave="over = false" @drop="onDrop">
        <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
          <rect x="1" y="9" width="44" height="28" rx="1" stroke="#F9530C" fill="none" stroke-width="1.6" />
          <path d="M18 18 L30 23 L18 28 Z" fill="#F9530C" />
          <path d="M1 14 L1 32 M45 14 L45 32" stroke="#F9530C" stroke-width="1.6" />
        </svg>
        <h3>拖拽比赛视频到此处</h3>
        <p>支持 MP4 / WEBM · 视频仅在本地浏览器内解码分析，不上传任何服务器</p>
        <label class="bc-btn bc-btn--dashed bc-btn--sm" style="margin-top:18px;cursor:pointer">
          选择视频文件
          <input type="file" accept="video/mp4,video/webm,video/*" style="display:none" @change="pick" />
        </label>
        <p v-if="file" style="margin-top:14px;color:var(--bc-chalk)">{{ file.name }} · {{ (file.size / 1048576).toFixed(1) }} MB</p>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:24px">
        <label>
          <span class="bc-kicker">分析时长 / s</span>
          <input class="bc-input" type="number" min="3" max="60" v-model.number="duration" style="margin-top:8px" />
        </label>
        <label>
          <span class="bc-kicker">采样帧率 / fps</span>
          <input class="bc-input" type="number" min="2" max="15" v-model.number="fps" style="margin-top:8px" />
        </label>
        <div>
          <span class="bc-kicker">检测通道</span>
          <p style="margin-top:12px;font-size:13px">
            <span v-if="modelState === 'checking'" style="color:var(--bc-muted)">正在探测模型…</span>
            <span v-else-if="modelState === 'ready'" style="color:var(--bc-signal)">模型优先 · YOLOv8n 已就位</span>
            <span v-else style="color:var(--bc-muted)">模型缺失 · 自动降级算法追踪</span>
          </p>
        </div>
      </div>

      <!-- 高级标注（预留）：自动标定画布 / NCC 锚点编辑 / 轨迹锁定。
           当前版本仅完成追踪与战术分析，标注模块预留位置与布局，后续版本接入。 -->
      <div class="vb-reserved">
        <div class="vb-reserved__head">
          <span class="bc-kicker">高级标注 / 预留</span>
          <span class="vb-reserved__pill">Reserved · 待接入</span>
        </div>
        <p class="vb-reserved__note">
          以下为视频分析标注能力的预留布局：自动标定画布（在视频上绘制 4 个场地角点，解算单应矩阵完成像素↔球场英尺映射）、
          NCC 锚点编辑（手动微调追踪锚点）、轨迹锁定。当前版本暂不实现，仅预留位置。
        </p>
        <div class="vb-reserved__row">
          <button class="bc-btn bc-btn--dashed bc-btn--sm" disabled>自动标定画布</button>
          <button class="bc-btn bc-btn--dashed bc-btn--sm" disabled>NCC 锚点编辑</button>
          <button class="bc-btn bc-btn--dashed bc-btn--sm" disabled>轨迹锁定</button>
        </div>
        <div class="vb-cal vb-cal--reserved">
          <div class="vb-cal__ghost"></div>
          <span class="vb-cal__tag">标定画布预览 · 预留</span>
        </div>
      </div>

      <div v-if="busy || S.stage === 'analyzing'" style="margin-top:24px">
        <div class="bc-kicker">{{ S.progress.message || '分析中' }}</div>
        <div class="vb-progress"><i :style="{ width: pctText }"></i></div>
      </div>

      <p v-if="S.error" style="margin-top:16px;color:#F9530C;font-size:13px">分析失败：{{ S.error }}</p>

      <div style="display:flex;gap:12px;margin-top:28px">
        <button class="bc-btn bc-btn--primary" :disabled="!canRun" @click="run">开始分析</button>
        <button class="bc-btn bc-btn--ghost" @click="useSample">载入内置样例</button>
      </div>
    </div>
  </div>
</template>
