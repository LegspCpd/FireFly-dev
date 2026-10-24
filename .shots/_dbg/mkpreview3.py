import re, glob, sys
root = 'F:/Github/Firefly/.vercel/output/static'
EFU, TOP, H, OUT = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
html = open(root + '/index.html', encoding='utf-8').read()
aside = re.search(r'<aside[^>]*Header_pcHeaderContainer[\s\S]*?</aside>', html).group(0)
css = glob.glob(root + '/_astro/EndfieldLayout.*.css')[0].replace('F:/Github/Firefly/', 'file:///F:/Github/Firefly/')
out = '''<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>rail crop</title>
<link rel="stylesheet" href="''' + css + '''">
<style>
  html, body { margin: 0; padding: 0; height: ''' + H + '''; background: #fff; overflow: hidden; }
  .ef-shell { --efu: ''' + EFU + ''' !important; }
  .Header_pcHeaderContainer__Sy_8l { position: absolute !important; top: calc(-1 * ''' + TOP + ''') !important; height: 2400px !important; width: calc(22.5 * var(--efu)) !important; }
  .Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp { width: calc(10.25 * var(--efu)) !important; }
  .Header_pcHeaderContainer__Sy_8l .Header_navItem__c_fLB .Header_textWrapper__o9aHt { opacity: 1 !important; transform: translate3d(0, -50%, 0) !important; }
  .Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp .Header_button__b0gdu .Header_textWrapper__o9aHt { opacity: 1 !important; transform: translate3d(0, -50%, 0) !important; }
</style></head><body class="ef-shell"><div class="ef-shell" style="position:relative">
''' + aside + '''
</div></body></html>'''
open(OUT, 'w', encoding='utf-8').write(out)
print('ok', OUT)
