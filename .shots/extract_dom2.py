s = open('F:/web/endfield-official/index.html', encoding='utf-8').read()
i = s.find('Header_pcHeaderContainer__Sy_8l')
# end at the closing of the header container - find H5 container or next main
j = s.find('Header_h5HeaderContainer', i)
if j < 0: j = i + 60000
seg = s[i-100:j]
open('F:/Github/Firefly/.shots/dom-desktop-header.html','w',encoding='utf-8').write(seg)
print('len', len(seg))
# also h5 menu for mediaList
k = s.find('Header_mediaList__gE3ct')
seg2 = s[k-3000:k+8000]
open('F:/Github/Firefly/.shots/dom-media.html','w',encoding='utf-8').write(seg2)
print('media seg', len(seg2))
