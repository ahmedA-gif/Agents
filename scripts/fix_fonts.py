"""One-shot legibility pass: scale every font size in styles.css up.

The original theme used 7–10px text which is unreadably small. This script
scales all font-size declarations (and `font:` shorthands / clamp()) by
FACTOR and enforces a MINIMUM of 11px, leaving zero-size (used to hide
mobile elements) untouched.
"""
import re
import sys

PATH = "frontend/src/styles.css"
FACTOR = 1.32
MIN = 11

css = open(PATH).read()


def scale(value: float) -> int:
    v = value * FACTOR
    if v < MIN:
        v = MIN
    return int(round(v))


def repl_font_size(m: re.Match) -> str:
    val = float(m.group(1))
    if val == 0:
        return m.group(0)
    return f"font-size:{scale(val)}px"


def repl_font(m: re.Match) -> str:
    weight = m.group(1) or ""
    return f"font:{weight}{scale(float(m.group(2)))}px"


def repl_clamp(m: re.Match) -> str:
    a, vw, c = float(m.group(1)), float(m.group(2)), float(m.group(3))
    return f"clamp({scale(a)}px,{round(vw * FACTOR, 2)}vw,{scale(c)}px)"


before = css
css = re.sub(r"font-size:(\d+(?:\.\d+)?)px", repl_font_size, css)
css = re.sub(r"font:(\d+\s+)?(\d+(?:\.\d+)?)px", repl_font, css)
css = re.sub(r"clamp\((\d+(?:\.\d+)?)px,(\d+(?:\.\d+)?)vw,(\d+(?:\.\d+)?)px\)", repl_clamp, css)

open(PATH, "w").write(css)

# report any remaining tiny fonts
tiny = re.findall(r"font(?:-size)?:(?:\d+\s+)?(\d+)px", css)
bad = sorted({int(t) for t in tiny if 0 < int(t) < MIN})
if bad:
    print("WARNING: fonts below minimum still present:", bad)
    sys.exit(1)
print("styles.css font scaling applied")
