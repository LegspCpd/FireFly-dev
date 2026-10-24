from PIL import Image
import os
tags = ["archive","categories","tags","series","friends","about"]
paths = [f"F:/Github/Firefly/.shots/round3/{t}.png" for t in tags]
ims = [Image.open(p).convert('RGB') for p in paths]
W = 420
cells = []
for t, im in zip(tags, ims):
    r = W / im.width
    cells.append((t, im.resize((W, int(im.height*r)))))
colw = W
rows = []
row = []
for c in cells:
    row.append(c)
    if len(row) == 3:
        rows.append(row); row = []
if row: rows.append(row)
pad = 10
sheetH = sum(max(c[1].height for c in r) for r in rows) + pad*(len(rows)+1)
sheet = Image.new('RGB', (colw*3 + pad*4, sheetH), (25,25,25))
y = pad
for r in rows:
    x = pad
    for t, im in r:
        sheet.paste(im, (x, y))
        x += colw + pad
    y += max(c[1].height for c in r) + pad
sheet.save("F:/Github/Firefly/.shots/round3/sheet1.png")
print(sheet.size)
