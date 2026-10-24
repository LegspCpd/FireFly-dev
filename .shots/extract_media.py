s = open('F:/web/endfield-official/index.html', encoding='utf-8').read()
k = s.find('Header_mediaList__gE3ct')
j = s.find('</div>', k)
# find end of mediaList container: search forward for the closing after last mediaItem
import re
seg = s[k-200:k+30000]
seg = seg.replace('><', '>\n<')
open('F:/Github/Firefly/.shots/dom-media2.html','w',encoding='utf-8').write(seg)
print(len(seg))
