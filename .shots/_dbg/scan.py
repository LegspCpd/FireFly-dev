from PIL import Image
im = Image.open(r'F:/Github/Firefly/.shots/round3/local-home.png').convert('L')
w,h = im.size
px = im.load()
rows=[]
for y in range(380, 660):
    mid=0; dark=0
    for x in range(260, 1060, 2):
        v=px[x,y]
        if 90 <= v <= 215: mid+=1
        if v < 90: dark+=1
    if mid>3: rows.append((y,mid,dark))
print(rows[:40])
print('count', len(rows))
