<template>
  <IconBase :size="size"><path d="M4.8 9.2A8 8 0 1 1 4 13.8" /><path d="M4.2 4.5v5h5" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
