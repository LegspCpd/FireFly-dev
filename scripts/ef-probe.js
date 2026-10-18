var RPT = function () {
  if (window.__efLight) { document.documentElement.classList.remove('dark'); }
  var o = [];
  var de = document.documentElement;
  var cs = getComputedStyle(de);
  o.push('page=' + location.pathname);
  o.push('vw=' + window.innerWidth + ' scrollW=' + de.scrollWidth + ' overflow=' + (de.scrollWidth > window.innerWidth + 1 ? 'YES' : 'no'));
  o.push('theme=' + (de.classList.contains('dark') ? 'dark' : 'light'));
  o.push('paper=' + cs.getPropertyValue('--ef-paper').trim() + ' panel=' + cs.getPropertyValue('--ef-panel').trim());
  o.push('ink=' + cs.getPropertyValue('--ef-ink').trim() + ' signal=' + cs.getPropertyValue('--ef-signal').trim());
  o.push('radiusLarge=' + cs.getPropertyValue('--radius-large').trim());
  var btn = document.querySelector('.ef-cut, .btn-plain, button');
  o.push('btnClip=' + (btn ? (String(getComputedStyle(btn).clipPath).indexOf('polygon') >= 0 ? 'yes' : 'no') : 'n/a'));
  var eb = document.querySelector('.ef-eyebrow');
  o.push('eyebrow=' + (eb ? eb.textContent.trim() : 'none'));
  o.push('tri=' + (document.querySelector('.ef-tri') ? 'yes' : 'no'));
  o.push('errs=' + (window.__efErrs.length ? window.__efErrs.slice(0, 2).join(' ; ') : 'none'));
  document.getElementById('RPT').textContent = 'VERIFY ' + o.join(' | ') + ' END';
};
window.__efErrs = [];
window.addEventListener('error', function (ev) { window.__efErrs.push(String(ev.message).slice(0, 70)); });
setTimeout(RPT, 2600);