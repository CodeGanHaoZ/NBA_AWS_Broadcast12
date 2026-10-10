import { createApp } from 'vue'
import App from './App.vue'
import './styles/design-tokens.css'
import './styles/app.css'
import './styles/vision.css'
import './styles/broadcast.css'
import { S } from './lib/store.js'
import { reveal, countup } from './directives.js'

const app = createApp(App)
app.directive('reveal', reveal)
app.directive('countup', countup)
app.mount('#app')

// QA 探针：验收脚本只读访问
window.__bc = { S }
