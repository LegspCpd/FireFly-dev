import re

s = open('F:/web/endfield-official/index.html', encoding='utf-8').read()
i = s.find('Header_pcHeaderContainer__Sy_8l')
print("idx", i, "len", len(s))
seg = s[i-200:i+40000]
# find the aside/header start
print(seg[:6000])
