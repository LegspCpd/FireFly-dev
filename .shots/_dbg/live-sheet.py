from PIL import Image
tags = ["archive","categories","tags","series","friends","about","guestbook","search","post"]
cells=[]
for t in tags:
    im = Image.open(f"F:/Github/Firefly/.shots/round3/live-{t}.png").convert("RGB")
    W=380
    cells.append((t, im.resize((W, int(im.height*W/im.width)))))
pad=8
rows=[]
row=[]
for c in cells:
    row.append(c)
    if len(row)==3: rows.append(row); row=[]
if row: rows.append(row)
H = sum(max(c[1].height for c in r) for r in rows)+pad*(len(rows)+1)
sheet = Image.new("RGB",(380*3+pad*4,H),(30,30,30))
y=pad
for r in rows:
    x=pad
    for t,im in r:
        sheet.paste(im,(x,y)); x+=380+pad
    y+=max(c[1].height for c in r)+pad
sheet.save("F:/Github/Firefly/.shots/round3/live-sheet.png")
print(sheet.size)
