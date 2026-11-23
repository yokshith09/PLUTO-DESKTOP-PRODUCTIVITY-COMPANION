"""Build the website's HTML pages from one shared head, header and footer.

Run from the repository root: python3 scripts/site-pages.py
Each page's own content lives in scripts/site-pages/<name>.html (not deployed); the finished pages
are written to website/<name>.html and committed, so the site itself needs no build step.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BODIES = ROOT / "scripts" / "site-pages"
OUT = ROOT / "website"

# name: (title, description, body class, nav key)
PAGES = {
    "index": ("Pluto: a desktop pet for your tasks, focus and time",
              "Pluto is a small desktop companion that keeps your tasks, focus, time and notes in one place. Free for Windows and macOS, with no account. Everything stays on your computer.",
              "home", ""),
    "features": ("Features: Pluto",
                 "Everything Pluto does today: your day in one view, focus, time tracking, notes, projects, a private diary, and the companion itself. Plus what is coming next.",
                 "page", "features"),
    "characters": ("Pet library: Pluto",
                   "Meet the five companions: Pluto the bear, Mochi, Pip, Bolt and Ghosty. See every move, and dress them up with nine accessories and six outfits.",
                   "page", "characters"),
    "assistants": ("Assistants: Pluto",
                   "Pluto works with Claude Code, Codex, Cursor, OpenCode and other coding assistants: they read your day and add tasks, and the pet tells you when a chat finishes or needs you.",
                   "page", "assistants"),
    "pricing": ("Pricing: Pluto",
                "Pluto is free today, with no account. A paid plan with Pluto's own AI is coming soon.",
                "page", "pricing"),
    "privacy": ("Privacy: Pluto",
                "Pluto keeps your day on your computer: no account, nothing uploaded, a diary locked with your password. Here is exactly what it stores and what it reads.",
                "page", "privacy"),
    "download": ("Download Pluto",
                 "Download Pluto for Windows or macOS. Free, no account. How to install it and what to expect the first time you open it.",
                 "page", "download"),
    "404": ("Page not found: Pluto", "This page drifted out of orbit.", "page", ""),
}

NAV = [("features", "Features"), ("characters", "Pet library"), ("assistants", "Assistants"), ("pricing", "Pricing"), ("privacy", "Privacy")]

COLOURS = [
    ("periwinkle", "Periwinkle", "oklch(0.52 0.19 262)"),
    ("indigo", "Twilight Indigo", "oklch(0.5 0.2 275)"),
    ("ultraviolet", "Ultraviolet", "oklch(0.5 0.22 295)"),
    ("amethyst", "Midnight Amethyst", "oklch(0.52 0.21 288)"),
    ("copper", "Copper", "oklch(0.53 0.15 48)"),
]

RELEASES = "https://github.com/yokshith09/DESKTOP-PET/releases/latest"


def header(current: str) -> str:
    links = "\n".join(
        f'        <a href="{key}.html"{" aria-current=\"page\"" if key == current else ""}>{label}</a>' for key, label in NAV
    )
    swatches = "\n".join(
        f'        <label title="{name}"><input type="radio" name="colour" value="{key}" aria-label="{name}"{" checked" if key == "periwinkle" else ""}><span style="--sw: {sw}"></span></label>'
        for key, name, sw in COLOURS
    )
    return f'''  <header class="top">
    <a class="brand" href="index.html" aria-label="Pluto home"><img src="icon.png" alt="" width="32" height="32"><span>Pluto</span></a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav"><span aria-hidden="true"></span><b class="sr">Menu</b></button>
    <nav id="site-nav" aria-label="Main">
      <div class="nav-links">
{links}
      </div>
      <fieldset class="colours" id="colours">
        <legend>Colour of this page (the same five colours as the app)</legend>
{swatches}
      </fieldset>
      <a class="btn btn-small" href="download.html"{" aria-current=\"page\"" if current == "download" else ""}>Download</a>
    </nav>
  </header>'''


FOOTER = '''  <footer class="foot">
    <div class="foot-brand">
      <p class="foot-name"><img src="icon.png" alt="" width="28" height="28"> Pluto</p>
      <p>Small companion. Big universe.</p>
    </div>
    <nav class="foot-links" aria-label="More">
      <a href="features.html">Features</a>
      <a href="characters.html">Pet library</a>
      <a href="assistants.html">Assistants</a>
      <a href="pricing.html">Pricing</a>
      <a href="privacy.html">Privacy</a>
      <a href="download.html">Download</a>
    </nav>
    <p class="foot-small">© 2026 Quorbit Technologies.</p>
  </footer>'''


def page(name: str) -> str:
    title, desc, body_class, current = PAGES[name]
    body = (BODIES / f"{name}.html").read_text().rstrip() + "\n"
    body = body.replace("{{RELEASES}}", RELEASES)
    planet = '\n  <script src="planet.js" type="module"></script>' if "<canvas" in body else ""
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta name="theme-color" content="#151c33">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="shots/today.webp">
  <link rel="icon" href="favicon.png">
  <link rel="preload" href="fonts/unbounded-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="styles.css">
  <script src="site.js" defer></script>{planet}
</head>
<body class="{body_class}">
  <a class="skip" href="#main">Skip to content</a>

{header(current)}

  <main id="main">
{body}  </main>

{FOOTER}
</body>
</html>
'''


if __name__ == "__main__":
    for name in PAGES:
        (OUT / f"{name}.html").write_text(page(name))
        print("wrote", f"website/{name}.html")
