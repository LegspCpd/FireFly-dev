import re, io, os, glob
root = 'F:/Github/Firefly/.vercel/output/static'
html = open(root + '/index.html', encoding='utf-8').read()
m = re.search(r'<aside[^>]*Header_pcHeaderContainer[\s\S]*?</aside>', html)
assert m, 'aside not found'
aside = m.group(0)
# 只保留竖排栏本身需要的 DOM：aside + 它的兄弟 #swup-container 空壳（避免 padding 差异）
css = glob.glob(root + '/_astro/EndfieldLayout.*.css')
assert css, 'EndfieldLayout css not found'
csshref = css[0].replace('F:/Github/Firefly/', 'file:///F:/Github/Firefly/').replace('\\', '/')
out = '''<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>rail preview</title>
<link rel="stylesheet" href="''' + csshref + '''">
<style>
  html, body { margin: 0; padding: 0; height: 1000px; background: #fff; overflow: hidden; }
  .Header_pcHeaderContainer__Sy_8l { width: calc(22.5 * var(--efu)) !important; }
  .Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp { width: calc(10.25 * var(--efu)) !important; }
  .Header_pcHeaderContainer__Sy_8l .Header_navItem__c_fLB .Header_textWrapper__o9aHt { opacity: 1 !important; transform: translate3d(0, -50%, 0) !important; }
  .Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp .Header_button__b0gdu .Header_textWrapper__o9aHt { opacity: 1 !important; transform: translate3d(0, -50%, 0) !important; }
</style></head>
<body class="ef-shell">
<div class="ef-shell">
''' + aside + '''
<div id="swup-container" style="margin-left:calc(22.5 * var(--efu));height:1000px;background:#fff"></div>
</div>
</body></html>'''
open('F:/Github/Firefly/.shots/_dbg/rail-preview.html', 'w', encoding='utf-8').write(out)
print('css:', csshref)
print('aside len', len(aside))
