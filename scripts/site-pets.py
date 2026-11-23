"""Make the website's small pet sprites from the app's packs.

Run from the repository root: python3 scripts/site-pets.py
Writes website/pets/<id>.webp (the rows the site animates, at 0.75 size) and website/pets/pets.json.
pets.json also holds, per frame, where accessories go: the same rules as the app's
src/features/wardrobe/spriteAnchors.ts (anchorFromAlpha, then steady), so the website's dressing
room puts a hat exactly where the app would.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# Mira and Raja were deleted (owner, 2026-11-20).
PETS = ["bear", "mochi", "pip", "bolt", "ghosty"]
ROWS = ["idle", "running-right", "running-left", "waving", "jumping", "running"]  # "running" is the typing pose
SCALE = 0.75  # shown at 96–128 CSS px, so it stays sharp on high-DPI screens


def anchor_from_alpha(alpha: bytes, w: int, h: int, threshold: int = 128):
    """spriteAnchors.ts anchorFromAlpha: head middle, head top, head width and neck, from drawn pixels."""
    rows = []
    for y in range(h):
        n, lo, hi = 0, w, -1
        for x in range(w):
            if alpha[y * w + x] < threshold:
                continue
            n += 1
            lo = min(lo, x)
            hi = max(hi, x)
        rows.append((n, lo, hi))
    widest = max([0] + [r[0] for r in rows])
    if widest == 0:
        return None
    solid = lambda y: rows[y][0] >= widest * 0.3
    top = 0
    while top < h and not solid(top):
        top += 1
    bottom = h - 1
    while bottom > top and not solid(bottom):
        bottom -= 1
    height = bottom - top + 1
    if height < 8:
        return None
    band = [r for r in rows[round(top + height * 0.1):round(top + height * 0.3) + 1] if r[2] >= 0]
    if not band:
        return None
    cx = sum((r[2] + r[1]) / 2 for r in band) / len(band)
    head_w = sum(r[2] - r[1] + 1 for r in band) / len(band)
    return [cx, top, head_w, top + height * 0.55]


def steady(raw: list) -> list:
    """spriteAnchors.ts steady: every frame keeps its own head top and middle; size and neck from idle."""
    idle = [a for a in raw[0] if a]
    if not idle:
        return raw
    head_w = sum(a[2] for a in idle) / len(idle)
    neck = sum(a[3] - a[1] for a in idle) / len(idle)
    return [[[round(a[0], 1), a[1], round(head_w, 1), round(a[1] + neck, 1)] if a else None for a in line] for line in raw]


def build() -> dict:
    out = {"cell": None, "rows": ROWS, "pets": []}
    for pid in PETS:
        pack = ROOT / "packs" / pid
        meta = json.loads((pack / "pet.json").read_text())
        pl = json.loads((pack / "pluto.json").read_text())
        cw, ch = pl["cell"]["width"], pl["cell"]["height"]
        names = [r["name"] for r in pl["rows"]]
        sheet = Image.open(pack / "spritesheet.webp").convert("RGBA")
        w, h = round(cw * SCALE), round(ch * SCALE)
        cols = pl["columns"]
        img = Image.new("RGBA", (w * cols, h * len(ROWS)), (0, 0, 0, 0))
        frames = []
        anchors = []
        for i, row in enumerate(ROWS):
            src = names.index(row)
            strip = sheet.crop((0, src * ch, cols * cw, (src + 1) * ch)).resize((w * cols, h), Image.LANCZOS)
            img.paste(strip, (0, i * h))
            frames.append(pl["rows"][src]["frames"])
            alpha = strip.getchannel("A").tobytes()
            line = []
            for c in range(pl["rows"][src]["frames"]):
                cell = b"".join(alpha[y * w * cols + c * w:y * w * cols + (c + 1) * w] for y in range(h))
                line.append(anchor_from_alpha(cell, w, h))
            anchors.append(line)
        img.save(ROOT / "website" / "pets" / f"{pid}.webp", "WEBP", quality=82, method=6)
        out["cell"] = {"width": w, "height": h}
        name, _, kind = meta["description"].partition(", ")
        out["pets"].append({
            "id": pid, "name": meta["displayName"], "kind": kind or name,
            "frames": frames, "special": pl.get("special", {}).get("line", ""),
            "specialName": pl.get("special", {}).get("name", ""),
            "reactions": pl.get("reactions", {}),
            "anchors": steady(anchors),
        })
    (ROOT / "website" / "pets" / "pets.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
    return out


if __name__ == "__main__":
    print(json.dumps(build()["pets"], indent=1)[:600])
