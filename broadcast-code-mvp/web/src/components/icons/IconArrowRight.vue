<template>
  <IconBase :size="size"><path d="M4 12h15" /><path d="M13.5 6l6 6-6 6" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 16 } })
</script>
