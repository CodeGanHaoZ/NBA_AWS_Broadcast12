<template>
  <IconBase :size="size"><path d="M9.2 5.5v13" /><path d="M14.8 5.5v13" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
