import io, sys
path = 'F:/Github/Firefly/src/styles/endfield-shell.css'
new = open('F:/Github/Firefly/.shots/new-section4.css', encoding='utf-8', newline='').read()
lines = open(path, encoding='utf-8', newline='').read().split('\n')
# 1-based lines 386..496 inclusive -> 0-based 385..495
assert '竖排栏底部' in lines[385], lines[385]
assert lines[495].rstrip('\r') == '}', repr(lines[495])
crlf = path.endswith('.css')
block = new.split('\n')
if crlf:
    block = [b + '\r' for b in block]
lines[385:496] = block
open(path, 'w', encoding='utf-8', newline='').write('\n'.join(lines))
print('spliced, new line count', len(lines))
