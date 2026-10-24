import re, sys, glob

files = sorted(glob.glob('F:/web/endfield-official/css/*.css'))
pat = re.compile(r'[^{}]*\{[^{}]*\}')
seen = []
for f in files:
    s = open(f, encoding='utf-8').read()
    for r in pat.findall(s):
        if 'Header_' in r:
            seen.append((f.split('/')[-1], r.strip()))
print("rules:", len(seen))
with open('F:/Github/Firefly/.shots/header-rules.txt', 'w', encoding='utf-8') as out:
    for fn, r in seen:
        out.write(f"/* {fn} */ {r}\n\n")
for fn, r in seen:
    print(r)
