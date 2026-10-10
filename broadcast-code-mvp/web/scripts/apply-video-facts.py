# -*- coding: utf-8 -*-
"""把用户上传视频解析出的真实内容写入 tracks.js（比分/球员/事件/解说）。

视频事实（逐帧人工核验）：
  - 火箭 44 – 40 独行侠（Q2 5:12，达拉斯主场）→ 弗拉格 #32 底角三分命中 → 44 – 43（Q2 4:58）
  - 球员身份：DAL #32 FLAGG / #00 CHRISTIE（球衣背号 CHRISTIE 00 直接可读）
              HOU #10 SMITH（解说点名"史密斯补防"）；画面另见 HOU #7/#1/#20、DAL #7
  - 其余球员按 2025-26 名册补齐；轨迹与深度指标仍为演示数据（note 已注明）
"""
import json, io, re, sys

P = 'src/lib/broadcast/tracks.js'
src = io.open(P, encoding='utf-8').read()
m = re.search(r'export const TRACKS = (.*?);\s*$', src, re.S)
T = json.loads(m.group(1))

# ---- meta ----
T['meta'].update({
    'videoId': 'mavs_vs_rockets_q2_flagg_corner3',
    'title': '独行侠 vs 火箭 · Q2 5:12 — 克里斯蒂拉开空间 → 弗拉格底角三分',
    'isMock': False,
    'note': '比分、节次、球员号码与姓名解析自用户上传的真实比赛片段（23.8s，1280x720@30fps）；'
            '界面展示 12s 回合窗口。轨迹与深度指标（GRAV/xFG/胜率）仍为演示数据。',
})

# ---- teams ----
T['video']['teams'] = [
    {'abbr': 'HOU', 'name': '休斯顿火箭', 'color': '#CE1141'},
    {'abbr': 'DAL', 'name': '达拉斯独行侠', 'color': '#0B6FD1'},
]

# ---- 球员改名（pid 不变，frames 引用不受影响）；进攻方 = DAL ----
RENAME = {  # pid -> (team, number, name, role)
    'p4':  ('DAL', 0,  'CHRISTIE',  'G'),   # 克里斯蒂（球衣 CHRISTIE 00 可读）
    'p28': ('DAL', 7,  'POWELL',    'C'),   # 画面见 DALLAS 7
    'p10': ('DAL', 32, 'FLAGG',     'F'),   # 解说"弗拉格 32 号接球就拔"
    'p9':  ('DAL', 3,  'DAVIS',     'F'),   # 按名册补齐
    'p5':  ('DAL', 25, 'WASHINGTON','F'),   # 按名册补齐
    'p77': ('HOU', 10, 'SMITH',     'F'),   # 解说"史密斯补防"（画面红色 10 号）
    'p21': ('HOU', 7,  'DURANT',    'F'),   # 画面见红色 7 号
    'p11': ('HOU', 1,  'THOMPSON',  'G'),   # 画面见红色 1 号
    'p95': ('HOU', 20, 'OKOGIE',    'F'),   # 画面见红色 20 号
    'p55': ('HOU', 15, 'SENGUN',    'C'),   # 按名册补齐
}
for sec in ('video', 'metrics'):
    for p in T[sec]['players']:
        team, num, name, role = RENAME[p.get('pid') or p['id']]
        p.update(team=team, number=num, name=name, role=role)

# ---- 球权：达拉斯 ----
T['possessions'][0]['team'] = 'DAL'

# ---- 事件链（对齐视频解说词）----
def ev(id, type, t, actor, label, evs, result=None):
    d = {'id': id, 'type': type, 't': t, 'actor': actor, 'label': label, 'evidence': evs}
    if result: d['result'] = result
    return d

T['events'] = [
    ev('ev_01', 'screen', 2.9, 'p4', '克里斯蒂 00 号停在外线 · 禁区挤成一团', [
        {'key': '持球停外线', 'value': 1.2, 'unit': 's'},
        {'key': '禁区防守人数', 'value': 4, 'unit': '人'}]),
    ev('ev_02', 'drive', 3.4, 'p4', '克里斯蒂把人带开 · 史密斯 10 号补防失位', [
        {'key': '牵制防守人数', 'value': 2, 'unit': '人'},
        {'key': '补防人位移', 'value': 4.6, 'unit': 'm'}]),
    ev('ev_03', 'help', 5.9, 'p95', '弱侧收缩 · 2 人协防进禁区', [
        {'key': '协防人数', 'value': 2, 'unit': '人'},
        {'key': '禁区防守人数', 'value': 4, 'unit': '人'}]),
    ev('ev_04', 'pass', 7.0, 'p4', '球转移到右侧底角 · 横跨 14.4 m', [
        {'key': '传球距离', 'value': 14.4, 'unit': 'm'},
        {'key': '接球人面前空档', 'value': 2.2, 'unit': 'm'}]),
    ev('ev_05', 'shot', 9.2, 'p10', '弗拉格 32 号接球就拔 · 底角空位三分（进攻时间仅剩 1 秒）', [
        {'key': 'xFG', 'value': 0.52, 'unit': ''},
        {'key': '进攻时间余量', 'value': 1.0, 'unit': 's'},
        {'key': '最近防守人距离', 'value': 2.15, 'unit': 'm'}], result='made'),
    ev('ev_06', 'result', 10.35, 'p10', '三分命中 · 火箭 44，独行侠 43 — 落后收成 1 分', [
        {'key': '分差变化', 'value': 3, 'unit': ''},
        {'key': '胜率变化', 'value': 0.06, 'unit': ''}], result='made'),
]

# ---- 胜率（home 值 = 火箭胜率：领先 4 分 → 被追成 1 分后回落）----
T['metrics']['winProbability'] = [
    {'t': 0.0, 'home': 0.56}, {'t': 3.0, 'home': 0.55}, {'t': 5.0, 'home': 0.53},
    {'t': 7.0, 'home': 0.55}, {'t': 9.2, 'home': 0.56}, {'t': 10.35, 'home': 0.50},
    {'t': 12.0, 'home': 0.50},
]

# ---- 解说词（直接采用视频字幕原文）----
T['commentary'] = [
    {'possession': 'pos_07', 'triggerT': 0.6, 'priority': 'mid', 'hold': 3.0,
     'text': '第二节 5 分 13 秒。火箭 44，独行侠 40。达拉斯主场，这球要追分。', 'evidenceRef': []},
    {'possession': 'pos_07', 'triggerT': 3.1, 'priority': 'mid', 'hold': 2.8,
     'text': '禁区挤成一团。克里斯蒂 00 号先停在外线，空档还没出现。', 'evidenceRef': ['ev_01']},
    {'possession': 'pos_07', 'triggerT': 6.1, 'priority': 'mid', 'hold': 2.8,
     'text': '球倒到右侧底角。史密斯补防过来，克里斯蒂把人带开，弗拉格出现在空位。', 'evidenceRef': ['ev_02', 'ev_03', 'ev_04']},
    {'possession': 'pos_07', 'triggerT': 9.35, 'priority': 'high', 'hold': 4.2,
     'text': '弗拉格 32 号接球就拔。24 秒只剩 1 秒，这是被造出来的底角三分。', 'evidenceRef': ['ev_05']},
    {'possession': 'pos_07', 'triggerT': 10.5, 'priority': 'high', 'hold': 3.4,
     'text': '球进了。独行侠 43，落后收成 1 分。克里斯蒂倒在地板上，这一拍空档值三分。', 'evidenceRef': ['ev_06']},
]

out = ('/* 由 scripts/apply-video-facts.py 生成：内容解析自用户上传视频 '
       '5d698211ea4aa8caf27c7fe4b900899e.mp4（比分/球员身份为真实解析，指标仍为演示）。 */\n'
       'export const TRACKS = ' + json.dumps(T, ensure_ascii=False, separators=(',', ':')) + ';\n')
io.open(P, 'w', encoding='utf-8').write(out)

# ---- 自检 ----
print('players:', [((p.get('pid') or p['id']), p['team'], p['number'], p['name']) for p in T['video']['players']])
print('possession team:', T['possessions'][0]['team'])
print('events:', [(e['id'], e['actor'], e['label'][:18]) for e in T['events']])
print('commentary lines:', len(T['commentary']))
print('wp:', [(x['t'], x['home']) for x in T['metrics']['winProbability']])
