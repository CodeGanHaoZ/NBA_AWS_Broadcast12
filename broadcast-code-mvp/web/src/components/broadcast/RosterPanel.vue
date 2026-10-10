<script setup>
/**
 * 阵容与指标
 * 结构照搬参考工程：球员行 = 号码（队色）+ 姓名/球队·位置 + GRAV + xFG，点击选中。
 */
import { computed } from 'vue'
import { METRICS, ATK_TEAM, TEAM_COLOR, BS, selectPid } from '../../lib/broadcast/model.js'

const list = computed(() => [...METRICS].sort((a, b) =>
  ((a.team === ATK_TEAM ? -1 : 1) - (b.team === ATK_TEAM ? -1 : 1)) || (b.gravity - a.gravity)
))
</script>

<template>
  <div class="panel">
    <div class="panel-head"><h3>阵容与指标</h3><span class="r">点击选中</span></div>
    <div class="plist">
      <button v-for="m in list" :key="m.pid" class="prow" :class="{ active: BS.selected === m.pid }"
              @click="selectPid(m.pid)">
        <span class="no" :style="{ color: TEAM_COLOR[m.team] }">{{ m.number }}</span>
        <span class="nm">{{ m.name }}<small>{{ m.team }} · {{ m.role }}</small></span>
        <span class="mv"><i>GRAV</i>{{ m.gravity }}</span>
        <span class="mv"><i>xFG</i>{{ m.xfgAvg.toFixed(2) }}</span>
      </button>
    </div>
  </div>
</template>
