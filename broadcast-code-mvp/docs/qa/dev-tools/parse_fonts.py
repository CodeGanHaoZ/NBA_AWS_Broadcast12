import re, sys

path = sys.argv[1]
css = open(path, encoding='utf-8').read()
for m in re.finditer(r"/\*\s*([a-z-]+)\s*\*/\s*@font-face\s*\{([^}]*)\}", css):
    name, body = m.group(1), m.group(2)
    fam = re.search(r"font-family:\s*'([^']+)'", body)
    wt = re.search(r"font-weight:\s*(\d+)", body)
    url = re.search(r"url\(([^)]+)\)", body)
    if fam and wt and url:
        print(fam.group(1), wt.group(1), name, url.group(1))
