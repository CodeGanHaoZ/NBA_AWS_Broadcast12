<template>
  <IconBase :size="size"><path d="M3.5 12h17" /><path d="M7.5 12V8.5M12 12v3.5M16.5 12V9.5" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 16 } })
</script>
