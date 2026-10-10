<template>
  <IconBase :size="size"><path d="M8.5 5.8v12.4L19 12z" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
