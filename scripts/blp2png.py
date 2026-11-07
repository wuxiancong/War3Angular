import os, struct, io, sys
from PIL import Image

def decode_blp(data):
    magic, b_type, flags, w, h, encoding, subtype = struct.unpack("<4sIIIIII", data[:28])
    if magic != b"BLP1":
        raise ValueError(f"Not BLP1: {magic}")
    offsets = struct.unpack("<16I", data[28:92])
    lengths = struct.unpack("<16I", data[92:156])
    offset = offsets[0]
    length = lengths[0]
    if b_type == 0:
        jpeg_header_len = struct.unpack("<I", data[156:160])[0]
        jpeg_header = data[160:160 + jpeg_header_len]
        jpeg_data = data[offset:offset + length]
        img = Image.open(io.BytesIO(jpeg_header + jpeg_data))
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        return img
    elif b_type == 1:
        palette_data = data[156:156 + 1024]
        palette = []
        for i in range(256):
            b, g, r, a = struct.unpack("<BBBB", palette_data[i*4:(i+1)*4])
            palette.extend((r, g, b))
        pixel_data = data[offset:offset + w * h]
        img = Image.frombytes("L", (w, h), pixel_data)
        img.putpalette(palette)
        alpha_offset = offset + w * h
        alpha_data = data[alpha_offset:alpha_offset + w * h]
        img = img.convert("RGBA")
        if len(alpha_data) >= w * h:
            alpha_img = Image.frombytes("L", (w, h), alpha_data[:w*h])
            img.putalpha(alpha_img)
        return img
    raise ValueError(f"Unknown BLP type {b_type}")

src = r"D:\Qt\workspace\War3Angular\public\assets\wc3\ui\extracted\blp"
dst = r"D:\Qt\workspace\War3Angular\public\assets\wc3\ui\extracted\png"
os.makedirs(dst, exist_ok=True)
ok=fail=0
for f in os.listdir(src):
    if not f.lower().endswith(".blp"): continue
    try:
        with open(os.path.join(src,f),"rb") as rb:
            img = decode_blp(rb.read())
        img.save(os.path.join(dst, f[:-4]+".png"), "PNG")
        print("OK", f)
        ok+=1
    except Exception as e:
        print("FAIL", f, e)
        fail+=1
print(f"done ok={ok} fail={fail}")
