<template>
  <IconBase :size="size"><path d="M5 6.5l6.5 5.5L5 17.5z" /><path d="M12.5 6.5l6.5 5.5-6.5 5.5z" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
