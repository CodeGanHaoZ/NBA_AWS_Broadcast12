import json
import re
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
JS_URL = "https://res.nba.cn/static/webmaster/assets/js/index-8c467dd5.js"


def fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read()


js = fetch(JS_URL).decode("utf-8", "replace")
print("js len", len(js))

urls = sorted(set(re.findall(r'url:"(/[^"]+)"', js)))
print("url: count", len(urls))
for u in urls:
    print("URL", u)

print("---- request({ patterns ----")
for m in re.finditer(r"je\.request\(\{.{0,220}\}\)", js):
    text = m.group(0)
    if "inside" in text.lower() or "shot" in text.lower() or "video" in text.lower() or "gravity" in text.lower():
        print(text)
        print("---")

print("---- /nba-web ----")
for m in re.finditer(r"/nba-web/[^\"'\\s)]+", js):
    print(m.group(0)[:200])
