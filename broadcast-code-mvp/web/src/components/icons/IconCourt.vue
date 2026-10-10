<template>
  <IconBase :size="size"><path d="M3.5 6h17v12h-17z" /><path d="M12 6v12" /><circle cx="12" cy="12" r="2.8" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
