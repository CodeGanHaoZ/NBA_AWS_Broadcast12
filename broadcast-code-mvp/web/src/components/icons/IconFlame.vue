<template>
  <IconBase :size="size"><path d="M12 3.2s5.2 4.8 5.2 9.4a5.2 5.2 0 0 1-10.4 0c0-1.9.9-3.6 2.1-4.9.4 1 1 1.7 1.7 2.1C10.6 6.9 12 3.2 12 3.2z" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 16 } })
</script>
