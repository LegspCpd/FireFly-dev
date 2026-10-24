import sys
src = sys.argv[1]; dst = sys.argv[2]
s = open(src, encoding='utf-8').read()
s = s.replace('><', '>\n<')
open(dst, 'w', encoding='utf-8').write(s)
print('lines', s.count(chr(10)))
