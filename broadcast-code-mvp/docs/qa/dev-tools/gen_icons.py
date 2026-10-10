import os

OUT = r'D:/Users/WorkBuddy/2026-10-10-03-09-02/broadcast-code-mvp/web/src/components/icons'
os.makedirs(OUT, exist_ok=True)

BASE = '''<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false"
  >
    <slot />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 20, validator: v => [16, 20, 24].includes(Number(v)) }
})
</script>
'''

TPL = '''<template>
  <IconBase :size="size">{inner}</IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({{ size: {{ type: [Number, String], default: {size} }} }})
</script>
'''

ICONS = {
  'IconPlay': (20, '<path d="M8.5 5.8v12.4L19 12z" />'),
  'IconPause': (20, '<path d="M9.2 5.5v13" /><path d="M14.8 5.5v13" />'),
  'IconFastForward': (20, '<path d="M5 6.5l6.5 5.5L5 17.5z" /><path d="M12.5 6.5l6.5 5.5-6.5 5.5z" />'),
  'IconReplay': (20, '<path d="M4.8 9.2A8 8 0 1 1 4 13.8" /><path d="M4.2 4.5v5h5" />'),
  'IconFramePrev': (16, '<path d="M15.5 6l-6 6 6 6" /><path d="M8.5 6v12" />'),
  'IconFrameNext': (16, '<path d="M8.5 6l6 6-6 6" /><path d="M15.5 6v12" />'),
  'IconSlowMo': (16, '<circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.8 1.8" /><path d="M9 3.5h6" />'),
  'IconVolume': (20, '<path d="M4.5 9.5v5h3.5L13.5 19V5L8 9.5z" /><path d="M16.5 9a4.5 4.5 0 0 1 0 6" />'),
  'IconSubtitle': (20, '<path d="M3.5 6.5h17v11h-17z" /><path d="M7 11.5h4M7 14.5h7" />'),
  'IconCourt': (20, '<path d="M3.5 6h17v12h-17z" /><path d="M12 6v12" /><circle cx="12" cy="12" r="2.8" />'),
  'IconVideo': (20, '<path d="M3.5 6.5h17v11h-17z" /><path d="M10.3 9.8l4.6 2.7-4.6 2.7z" />'),
  'IconArrowRight': (16, '<path d="M4 12h15" /><path d="M13.5 6l6 6-6 6" />'),
  'IconTargetRing': (16, '<circle cx="12" cy="12" r="6.5" /><path d="M12 2.8v3.4M12 17.8v3.4M2.8 12h3.4M17.8 12h3.4" />'),
  'IconFlame': (16, '<path d="M12 3.2s5.2 4.8 5.2 9.4a5.2 5.2 0 0 1-10.4 0c0-1.9.9-3.6 2.1-4.9.4 1 1 1.7 1.7 2.1C10.6 6.9 12 3.2 12 3.2z" />'),
  'IconDatabase': (16, '<ellipse cx="12" cy="5.8" rx="7.5" ry="2.8" /><path d="M4.5 5.8v12.4c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.8" /><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />'),
  'IconTimeline': (16, '<path d="M3.5 12h17" /><path d="M7.5 12V8.5M12 12v3.5M16.5 12V9.5" />'),
}

with open(os.path.join(OUT, 'IconBase.vue'), 'w', encoding='utf-8') as f:
    f.write(BASE)

for name, (size, inner) in ICONS.items():
    with open(os.path.join(OUT, name + '.vue'), 'w', encoding='utf-8') as f:
        f.write(TPL.format(inner=inner, size=size))

print('generated', len(ICONS) + 1, 'icon components')
