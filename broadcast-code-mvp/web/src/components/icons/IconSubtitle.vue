<template>
  <IconBase :size="size"><path d="M3.5 6.5h17v11h-17z" /><path d="M7 11.5h4M7 14.5h7" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
