<template>
  <IconBase :size="size"><path d="M15.5 6l-6 6 6 6" /><path d="M8.5 6v12" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 16 } })
</script>
