/**
 * 一次性移植脚本：把参考工程 app/data/tracks.mock.js（浏览器全局赋值）转成 ESM 模块。
 * 运行： node scripts/port-tracks.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const SRC = 'D:/Users/WorkBuddy/2026-10-10-03-17-03/app/data/tracks.mock.js'
const OUT = path.resolve(process.cwd(), 'src/lib/broadcast/tracks.js')

let s = fs.readFileSync(SRC, 'utf8')

// 去掉开头的注释块
s = s.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')
// window.TRACKS_MOCK = {...};  ->  export const TRACKS = {...};
const before = s
s = s.replace(/window\.TRACKS_MOCK\s*=\s*/, 'export const TRACKS = ')
if (s === before) throw new Error('未找到 window.TRACKS_MOCK 赋值，数据格式可能已变化')

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(
  OUT,
  '/* 自动生成，勿手改：来源 D:\\Users\\WorkBuddy\\2026-10-10-03-17-03\\app\\data\\tracks.mock.js\n' +
    '   由 scripts/port-tracks.mjs 转换（window.TRACKS_MOCK -> ESM export）。 */\n' + s,
  'utf8'
)

const kb = (fs.statSync(OUT).size / 1024).toFixed(1)
console.log(`OK  ${OUT}  ${kb} KB`)
