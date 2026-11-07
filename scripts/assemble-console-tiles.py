"""Convert extracted UITile BLPs → PNG and stitch NightElf top/bottom HUD."""
import os
import struct
import io
import hashlib
from PIL import Image


def decode_blp(data: bytes) -> Image.Image:
    magic, b_type, flags, w, h, encoding, subtype = struct.unpack("<4sIIIIII", data[:28])
    if magic != b"BLP1":
        raise ValueError("Not BLP1")
    offsets = struct.unpack("<16I", data[28:92])
    lengths = struct.unpack("<16I", data[92:156])
    offset, length = offsets[0], lengths[0]
    if b_type == 0:
        jhlen = struct.unpack("<I", data[156:160])[0]
        img = Image.open(io.BytesIO(data[160 : 160 + jhlen] + data[offset : offset + length]))
        return img.convert("RGBA")
    if b_type == 1:
        pal = []
        for i in range(256):
            b, g, r, a = struct.unpack("<BBBB", data[156 + i * 4 : 160 + i * 4])
            pal.extend((r, g, b))
        pix = data[offset : offset + w * h]
        img = Image.frombytes("L", (w, h), pix)
        img.putpalette(pal)
        img = img.convert("RGBA")
        alpha = data[offset + w * h : offset + 2 * w * h]
        if len(alpha) >= w * h:
            img.putalpha(Image.frombytes("L", (w, h), alpha[: w * h]))
        return img
    raise ValueError(f"type {b_type}")


def black_to_alpha(img: Image.Image, thresh: int = 12) -> Image.Image:
    """WC3 UI tiles often store empty as RGB black with opaque alpha."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r <= thresh and g <= thresh and b <= thresh:
                px[x, y] = (r, g, b, 0)
    return img


def row_opaque_counts(img: Image.Image) -> list[int]:
    a = img.split()[-1]
    out = []
    for y in range(img.height):
        hist = a.crop((0, y, img.width, y + 1)).histogram()
        out.append(sum(hist[8:]))
    return out


def main() -> None:
    root = r"D:\Mpqeditor\Win32\Work\ConsoleUI\tiles"
    pub = r"D:\Qt\workspace\War3Angular\public\assets\wc3\ui\assembled\tiles"
    os.makedirs(pub, exist_ok=True)

    for dirpath, _, files in os.walk(root):
        for f in files:
            if not f.lower().endswith(".blp"):
                continue
            src = os.path.join(dirpath, f)
            data = open(src, "rb").read()
            h = hashlib.md5(data).hexdigest()[:8]
            rel = os.path.relpath(src, root)
            print(f"{h} {len(data):7d} {rel}")
            img = black_to_alpha(decode_blp(data))
            race = "NightElf" if "NightElf" in rel else ("Human" if "Human" in rel else "Other")
            out = os.path.join(pub, f"{race}_{f[:-4]}.png")
            img.save(out, "PNG")
            print("  ->", img.size, "bbox", img.getbbox(), os.path.basename(out))

    ne = [Image.open(os.path.join(pub, f"NightElf_NightElfUITile0{i}.png")).convert("RGBA") for i in range(1, 5)]
    width = sum(t.width for t in ne)
    height = max(t.height for t in ne)
    full = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = 0
    for t in ne:
        full.paste(t, (x, 0), t)
        x += t.width
    full.save(os.path.join(pub, "NightElf_console_full.png"))
    print("full", full.size, "bbox", full.getbbox())

    rows = row_opaque_counts(full)
    thresh = full.width * 0.01
    # Find contiguous opaque bands
    bands: list[tuple[int, int]] = []
    start = None
    for y, v in enumerate(rows):
        if v > thresh and start is None:
            start = y
        elif v <= thresh and start is not None:
            bands.append((start, y - 1))
            start = None
    if start is not None:
        bands.append((start, full.height - 1))
    print("bands", bands)

    # Expect small top bar + large bottom console
    top_band = bands[0] if bands else (0, 40)
    bot_band = bands[-1] if bands else (300, 511)
    # pad a little
    top = full.crop((0, max(0, top_band[0] - 2), full.width, min(full.height, top_band[1] + 3)))
    bot = full.crop((0, max(0, bot_band[0] - 2), full.width, min(full.height, bot_band[1] + 1)))
    top.save(os.path.join(pub, "NightElf_topbar_band.png"))
    bot.save(os.path.join(pub, "NightElf_console_band.png"))
    print("top", top.size, "bot", bot.size)

    def fit_width(im: Image.Image, tw: int) -> Image.Image:
        scale = tw / im.width
        th = max(1, int(round(im.height * scale)))
        return im.resize((tw, th), Image.Resampling.LANCZOS)

    top_hud = fit_width(top, 1024)
    bot_hud = fit_width(bot, 1024)
    ui = r"D:\Qt\workspace\War3Angular\public\assets\wc3\ui"
    top_hud.save(os.path.join(ui, "topbar-assembled.png"))
    bot_hud.save(os.path.join(ui, "console-assembled.png"))
    print("wrote topbar", top_hud.size, "console", bot_hud.size)

    # Optional: inventory cover overlay scaled into console space
    inv = Image.open(os.path.join(pub, "NightElf_NightElfUITile-InventoryCover.png")).convert("RGBA")
    inv = black_to_alpha(inv)
    inv.save(os.path.join(pub, "NightElf_NightElfUITile-InventoryCover.png"))


if __name__ == "__main__":
    main()
