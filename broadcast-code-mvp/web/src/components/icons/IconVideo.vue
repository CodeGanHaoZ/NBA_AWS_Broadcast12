<template>
  <IconBase :size="size"><path d="M3.5 6.5h17v11h-17z" /><path d="M10.3 9.8l4.6 2.7-4.6 2.7z" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
