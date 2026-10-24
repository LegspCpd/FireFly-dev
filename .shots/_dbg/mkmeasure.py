import re, glob, sys
root = 'F:/Github/Firefly/.vercel/output/static'
EFU = sys.argv[1]; OUT = sys.argv[2]
html = open(root + '/index.html', encoding='utf-8').read()
aside = re.search(r'<aside[^>]*Header_pcHeaderContainer[\s\S]*?</aside>', html).group(0)
css = glob.glob(root + '/_astro/EndfieldLayout.*.css')[0].replace('F:/Github/Firefly/', 'file:///F:/Github/Firefly/')
script = '''
<script>
window.addEventListener('load', function () {
  var q = function (s) { var e = document.querySelector(s); if (!e) return null; var r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  var u = getComputedStyle(document.querySelector('.ef-shell')).getPropertyValue('--efu');
  var out = {
    efu: u.trim(),
    rail: q('.Header_pcHeaderContainer__Sy_8l'),
    capsule: q('.Header_buttonFrameContainer__Uvshp'),
    row1: q('.Header_buttonFrameContainer__Uvshp a:nth-child(1)'),
    icon1: q('.Header_buttonFrameContainer__Uvshp a:nth-child(1) .Header_icon__3iDIG'),
    txt1: q('.Header_buttonFrameContainer__Uvshp a:nth-child(1) .Header_textWrapper__o9aHt'),
    div2: q('.Header_buttonFrameContainer__Uvshp a:nth-child(2)::before'),
    black: q('a.Header_buttonPreserveBg__rEZGT'),
    social: q('.ef-rail-social'),
    tile0: q('.ef-rail-social a:nth-child(1)'),
    tile3: q('.ef-rail-social a:nth-child(4)'),
    mark: q('.ef-rail-mark'),
    active: q('.Header_active__jzCyf'),
    sw: document.documentElement.scrollWidth
  };
  var pre = document.createElement('pre');
  pre.id = 'measure';
  pre.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff;color:#000;font:11px monospace;margin:0;padding:2px;white-space:pre-wrap;width:640px';
  pre.textContent = 'M ' + JSON.stringify(out, null, 1);
  document.body.appendChild(pre);
});
</script>'''
out = '''<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>measure</title>
<link rel="stylesheet" href="''' + css + '''">
<style>
  html, body { margin: 0; padding: 0; height: 1000px; background: #fff; overflow: hidden; }
  .ef-shell { --efu: ''' + EFU + ''' !important; }
  .Header_pcHeaderContainer__Sy_8l { width: calc(22.5 * var(--efu)) !important; }
  .Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp { width: calc(10.25 * var(--efu)) !important; }
  .Header_pcHeaderContainer__Sy_8l .Header_navItem__c_fLB .Header_textWrapper__o9aHt { opacity: 1 !important; transform: translate3d(0, -50%, 0) !important; }
  .Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp .Header_button__b0gdu .Header_textWrapper__o9aHt { opacity: 1 !important; transform: translate3d(0, -50%, 0) !important; }
</style></head><body class="ef-shell"><div class="ef-shell">
''' + aside + '''
<div id="swup-container" style="height:1000px;background:#fff"></div>
</div>''' + script + '''</body></html>'''
open(OUT, 'w', encoding='utf-8').write(out)
print('ok', OUT)
