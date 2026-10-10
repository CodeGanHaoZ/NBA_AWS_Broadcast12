# -*- coding: utf-8 -*-
"""字体子集化：Noto Sans SC 变量字体 → 400/500/700/900 中文子集 woff2；
JetBrains Mono 变量 woff2 → 400/700 静态实例 woff2。"""
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

FONTS = r'D:/Users/WorkBuddy/2026-10-10-03-09-02/broadcast-code-mvp/web/public/fonts'
TMP = r'D:/Users/WorkBuddy/2026-10-10-03-09-02/broadcast-code-mvp/web/tools-tmp'


def gb2312_chars():
    chars = set()
    for hi in range(0xB0, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode('gb2312'))
            except UnicodeDecodeError:
                pass
    for hi in range(0xA1, 0xB0):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode('gb2312'))
            except UnicodeDecodeError:
                pass
    return chars


def cjk_punct():
    out = set()
    for a, b in [(0x3000, 0x303F), (0xFF00, 0xFFEF), (0x2000, 0x206F), (0x2010, 0x2027)]:
        out.update(chr(c) for c in range(a, b + 1))
    return out


def latin_chars():
    out = set(chr(c) for c in range(0x20, 0x7F))
    out.update('·—–‘’“”…°²')
    return out


def do_subset(src, out, text, inst_wght=None, flavor='woff2'):
    font = TTFont(src)
    if inst_wght is not None and 'fvar' in font:
        from fontTools.varLib.instancer import instantiateVariableFont
        instantiateVariableFont(font, {'wght': inst_wght}, inplace=True)
    ss = subset.Subsetter(options=subset.Options(
        flavor=flavor,
        layout_features='*',
        name_IDs='*',
        hinting=False,
        desubroutinize=True,
    ))
    ss.populate(text=''.join(text) if not isinstance(text, str) else text)
    ss.subset(font)
    font.save(out)
    import os
    print(f'{out} -> {os.path.getsize(out)//1024} KB')


def main():
    cn = gb2312_chars() | cjk_punct() | latin_chars()
    src_noto = TMP + '/NotoSansSC-var.ttf'
    for w in (400, 500, 700, 900):
        do_subset(src_noto, f'{FONTS}/noto-sans-sc-{w}.woff2', cn, inst_wght=w)

    jb_src = FONTS + '/jb-var-latin.woff2'
    jb_text = latin_chars() | set('▍●▲⬤×━')
    for w in (400, 700):
        do_subset(jb_src, f'{FONTS}/jetbrains-mono-{w}.woff2', jb_text, inst_wght=w)


if __name__ == '__main__':
    sys.exit(main())
