<template>
  <IconBase :size="size"><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.8 1.8" /><path d="M9 3.5h6" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 16 } })
</script>
