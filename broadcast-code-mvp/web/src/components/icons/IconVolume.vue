<template>
  <IconBase :size="size"><path d="M4.5 9.5v5h3.5L13.5 19V5L8 9.5z" /><path d="M16.5 9a4.5 4.5 0 0 1 0 6" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
