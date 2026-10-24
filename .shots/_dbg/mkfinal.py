import re, glob, sys, os
root = 'F:/Github/Firefly/.vercel/output/static'
EFU, TOP, H, OUT = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
MEASURE = len(sys.argv) > 5 and sys.argv[5] == 'measure'
html = open(root + '/index.html', encoding='utf-8').read()
aside = re.search(r'<aside[^>]*Header_pcHeaderContainer[\s\S]*?</aside>', html).group(0)
links = '\n'.join('<link rel="stylesheet" href="file:///F:/Github/Firefly/%s">' % p.replace('\\', '/')
                   for p in sorted(glob.glob(root + '/_astro/*.css')))
style = '''
  html, body { margin: 0; padding: 0; height: ''' + H + '''; background: #fff; overflow: hidden; }
  .ef-shell { --efu: ''' + EFU + ''' !important; }
  .Header_pcHeaderContainer__Sy_8l { position: absolute !important; top: calc(-1 * ''' + TOP + ''') !important; height: 2600px !important; width: calc(22.5 * var(--efu)) !important; }
  .Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp { width: calc(10.25 * var(--efu)) !important; }
  .Header_pcHeaderContainer__Sy_8l .Header_navItem__c_fLB .Header_textWrapper__o9aHt { opacity: 1 !important; transform: translate3d(0, -50%, 0) !important; }
  .Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp .Header_button__b0gdu .Header_textWrapper__o9aHt { opacity: 1 !important; transform: translate3d(0, -50%, 0) !important; }
  #swup-container { margin-left: calc(22.5 * var(--efu)); height: 2600px; background: #fff; }
'''
script = ''
if MEASURE:
    script = '''
<script>
window.addEventListener('load', function () {
  var q = function (s) { var e = document.querySelector(s); if (!e) return null; var r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
  var cs = function (s, p) { var e = document.querySelector(s); return e ? getComputedStyle(e)[p] : null; };
  var o = {
    u: cs('.ef-shell', 'getPropertyValue').trim ? 'n/a' : getComputedStyle(document.querySelector('.ef-shell')).getPropertyValue('--efu').trim(),
    scrollW: document.documentElement.scrollWidth,
    rail: q('.Header_pcHeaderContainer__Sy_8l'),
    capsule: q('.Header_buttonFrameContainer__Uvshp'),
    row1: q('.Header_buttonFrameContainer__Uvshp a:nth-child(1)'),
    icon1: q('.Header_buttonFrameContainer__Uvshp a:nth-child(1) .Header_icon__3iDIG'),
    txt1: q('.Header_buttonFrameContainer__Uvshp a:nth-child(1) .Header_textWrapper__o9aHt'),
    black: q('a.Header_buttonPreserveBg__rEZGT'),
    bdiv: q('.Header_buttonPreserveBg__rEZGT .Header_divider__tUYjO'),
    btxt: q('.Header_buttonPreserveBg__rEZGT .Header_text__52fEh'),
    social: q('.ef-rail-social'),
    tile0: q('.ef-rail-social a:nth-child(1)'),
    tile3: q('.ef-rail-social a:nth-child(4)'),
    mark: q('.ef-rail-mark'),
    nav1: q('.Header_navItem__c_fLB:nth-child(1)'),
    navTxt1: q('.Header_navItem__c_fLB:nth-child(1) .Header_textWrapper__o9aHt'),
    active: q('.Header_active__jzCyf'),
    activeAfterW: cs('.Header_active__jzCyf', 'width'),
    imgs: document.querySelectorAll('img').length
  };
  var pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;left:340px;top:0;z-index:99999;background:#fff;color:#000;font:13px monospace;margin:0;padding:4px;white-space:pre-wrap;width:520px';
  pre.textContent = JSON.stringify(o, null, 1);
  document.body.appendChild(pre);
});
</script>'''
out = '''<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>rail final</title>
''' + links + '''
<style>''' + style + '''</style></head><body class="ef-shell"><div class="ef-shell">
''' + aside + '''
<div id="swup-container"></div>
</div>''' + script + '''</body></html>'''
open(OUT, 'w', encoding='utf-8').write(out)
print('ok', OUT)
