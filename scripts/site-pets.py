"""Make the website's small pet sprites from the app's packs.

Run from the repository root: python3 scripts/site-pets.py
Writes website/pets/<id>.webp (the rows the site animates, at half size) and website/pets/pets.json.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# Mira and Raja are left off the site (owner, 2026-11-20).
PETS = ["bear", "mochi", "pip", "bolt", "ghosty"]
ROWS = ["idle", "running-right", "running-left", "waving", "jumping"]
SCALE = 0.75  # shown at 96–128 CSS px, so it stays sharp on high-DPI screens


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
        for i, row in enumerate(ROWS):
            src = names.index(row)
            strip = sheet.crop((0, src * ch, cols * cw, (src + 1) * ch)).resize((w * cols, h), Image.LANCZOS)
            img.paste(strip, (0, i * h))
            frames.append(pl["rows"][src]["frames"])
        img.save(ROOT / "website" / "pets" / f"{pid}.webp", "WEBP", quality=82, method=6)
        out["cell"] = {"width": w, "height": h}
        name, _, kind = meta["description"].partition(", ")
        out["pets"].append({
            "id": pid, "name": meta["displayName"], "kind": kind or name,
            "frames": frames, "special": pl.get("special", {}).get("line", ""),
        })
    (ROOT / "website" / "pets" / "pets.json").write_text(json.dumps(out, indent=2) + "\n")
    return out


if __name__ == "__main__":
    print(json.dumps(build()["pets"], indent=1)[:600])
