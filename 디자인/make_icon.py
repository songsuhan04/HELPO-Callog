# 콜록 앱 아이콘 — 단색 바탕 + 흰 말풍선 + 체크. 도형만으로 그린다(글꼴·생성 이미지 없음).
import sys
from PIL import Image, ImageDraw
BG=(42,55,184)      # 한낮 테마 주요색 #2A37B8
FG=(255,255,255)
N=2048
def symbol(d, scale=1.0):
    c=N/2; k=scale
    def P(x,y): return (c+(x-1024)*k, c+(y-1024)*k)
    # 말풍선 몸통
    x0,y0=P(470,500); x1,y1=P(1578,1390)
    d.rounded_rectangle([x0,y0,x1,y1], radius=230*k, fill=FG)
    # 꼬리(왼쪽 아래)
    d.polygon([P(640,1330),P(560,1640),P(900,1370)], fill=FG)
    # 체크 표시 (바탕색 선)
    pts=[P(760,950),P(940,1130),P(1300,760)]
    w=int(130*k)
    d.line(pts, fill=BG, width=w, joint="curve")
    for p in (pts[0],pts[-1]):
        r=w/2; d.ellipse([p[0]-r,p[1]-r,p[0]+r,p[1]+r], fill=BG)
def make(full_bleed, scale, radius_ratio):
    img=Image.new("RGBA",(N,N),(0,0,0,0)); d=ImageDraw.Draw(img)
    if full_bleed: d.rectangle([0,0,N,N], fill=BG)
    else: d.rounded_rectangle([0,0,N-1,N-1], radius=int(N*radius_ratio), fill=BG)
    symbol(d, scale)
    return img
out=sys.argv[1]
anyi=make(False,1.0,0.22)         # 일반 아이콘: 둥근 네모
mask=make(True,0.78,0)            # maskable: 바탕 꽉 채움, 기호는 안전 영역(가운데 80%) 안
apple=make(True,0.92,0)           # iOS가 모서리를 깎는다
for name,img,size in [("icon-192.png",anyi,192),("icon-512.png",anyi,512),("callog-icon.png",anyi,512),
                      ("icon-maskable-192.png",mask,192),("icon-maskable-512.png",mask,512),
                      ("apple-touch-icon.png",apple,180),("favicon.png",anyi,64)]:
    im=img.resize((size,size),Image.LANCZOS)
    if name=="apple-touch-icon.png": im=im.convert("RGB")
    im.save(f"{out}/{name}", optimize=True)
# 미리보기 한 장
prev=Image.new("RGB",(900,320),(247,248,251)); x=20
for img,s in [(anyi,256),(mask,256),(apple,180)]:
    t=img.resize((s,s),Image.LANCZOS); prev.paste(t,(x,32),t); x+=s+40
prev.save(f"{out}/preview.png")
print("ok")
