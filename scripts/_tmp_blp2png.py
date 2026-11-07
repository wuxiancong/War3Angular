
import os, struct, io, sys
from PIL import Image

def decode_blp(data):
    magic, b_type, flags, w, h, encoding, subtype = struct.unpack('<4sIIIIII', data[:28])
    if magic != b'BLP1':
        raise ValueError('Not BLP1')
    offsets = struct.unpack('<16I', data[28:92])
    lengths = struct.unpack('<16I', data[92:156])
    offset, length = offsets[0], lengths[0]
    if b_type == 0:
        jhlen = struct.unpack('<I', data[156:160])[0]
        img = Image.open(io.BytesIO(data[160:160+jhlen] + data[offset:offset+length]))
        return img.convert('RGBA') if img.mode != 'RGBA' else img
    if b_type == 1:
        pal = []
        for i in range(256):
            b,g,r,a = struct.unpack('<BBBB', data[156+i*4:160+i*4])
            pal.extend((r,g,b))
        pix = data[offset:offset+w*h]
        img = Image.frombytes('L', (w,h), pix)
        img.putpalette(pal)
        img = img.convert('RGBA')
        alpha = data[offset+w*h:offset+2*w*h]
        if len(alpha) >= w*h:
            img.putalpha(Image.frombytes('L', (w,h), alpha[:w*h]))
        return img
    raise ValueError('type')

root = r'''D:\\Qt\\workspace\\War3Angular\\public\\assets\\wc3\\ui\\assembled\\mpq'''
ok=fail=0
for dirpath,_,files in os.walk(root):
    for f in files:
        if not f.lower().endswith('.blp'): continue
        src=os.path.join(dirpath,f)
        dst=src[:-4]+'.png'
        try:
            with open(src,'rb') as rb: img=decode_blp(rb.read())
            img.save(dst,'PNG'); ok+=1; print('PNG', os.path.basename(dst))
        except Exception as e:
            fail+=1; print('FAIL', f, e)
print('convert ok', ok, 'fail', fail)
