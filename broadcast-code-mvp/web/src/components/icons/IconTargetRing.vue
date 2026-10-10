<template>
  <IconBase :size="size"><circle cx="12" cy="12" r="6.5" /><path d="M12 2.8v3.4M12 17.8v3.4M2.8 12h3.4M17.8 12h3.4" /></IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 16 } })
</script>
