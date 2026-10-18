# Prompt: let any AI make a Desktop Buddy

Copy everything inside the big box below into a chat with any AI that can write
code (Claude, ChatGPT, Gemini, Mistral, Llama, ...). Replace the line after
**MY BUDDY** with a description of your character, send it, and the AI answers
with **one JSON code block**. Copy that block and import it, see
[CREATE-A-BUDDY.md](CREATE-A-BUDDY.md#2-import-it).

The prompt is self-contained: it explains the format, the drawing rules, and
includes a small working example, so the AI needs nothing else.

````text
You are an expert SVG illustrator and sprite animator. Create a "buddy" for the
Desktop Buddy app: a small animated desktop pet that walks along the bottom of
the screen, sits and sleeps when the user is idle, looks at the active window,
points at things, and celebrates. You draw every animation as a few SVG frames
and deliver everything as ONE JSON file.

MY BUDDY
<<< Describe your character here: what it is, colours, style (cute chibi,
pixel art, realistic, glossy toy, ...), personality, accessories. >>>

OUTPUT FORMAT (strict)
Reply with exactly one ```json code block containing a single JSON object and
nothing after it. Do not split the answer over several messages. If you are
running out of space, use fewer frames or simpler shapes; never cut the JSON
off. The object has three keys:

  "id"        lowercase letters, digits and dashes, e.g. "blobby"
  "manifest"  the settings and the list of animations (described below)
  "files"     an object: file name -> the complete SVG text of that frame

CANVAS RULES (every frame)
- Start each frame with <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'>
  and end with </svg>. Transparent background, no background rectangle.
- Use SINGLE quotes for all SVG attributes, so the JSON needs no escaping.
  Never put a double quote or a backslash inside an SVG string.
- The character faces RIGHT in every frame and is centred around x = 64.
- The lowest point of the standing character (soles of the feet) is at y = 122.
  Keep this ground line the same in all frames so the buddy does not jump around.
  A floating character should still have its lowest point near y = 122 in idle
  and walk.
- The character is roughly 70 to 105 units tall. Keep a margin: nothing may touch
  or cross the edge of the 128 x 128 box.

ANIMATIONS (fps = frames per second)
  idle    2-4 frames, fps 2    standing, breathing, blinking          REQUIRED
  walk    4 frames,   fps 8    walk cycle: legs/feet alternate, body bobs 1-3  REQUIRED
  sit     2-4 frames, fps 1.5  sitting or crouching
  sleep   2 frames,   fps 1    lying or slumped, eyes closed, small "z" shapes
  watch   2-4 frames, fps 1.5  looking up curiously (used when watching a window)
  point   2 frames,   fps 2    one arm / paw / wing / head clearly points to the upper right
  alert   2 frames,   fps 4    startled or excited, red "!" above the head
  happy   2 frames,   fps 5    cheering, big smile, hearts or sparkles
  drag    2 frames,   fps 2    being picked up, dangling, worried
  trick   3-4 frames, fps 8    the double-click signature move (jump, spin, dance, flex, ...)
Missing animations fall back to idle, but please provide all of them.

STYLE RULES
- Use simple shapes (ellipse, circle, rect, path, polygon). Linear and radial
  gradients are allowed; define them inside the same file with ids that are
  unique within that file.
- Give shapes an outline (stroke 1.5-3) in a darker shade of the fill, plus a
  small highlight or shade, so the buddy reads on light and dark wallpapers.
- Frames of one animation must differ only in what animates. Keep the other
  body parts at the same positions so it does not jitter.
- Pixel art: build it from <rect> cells and add shape-rendering='crispEdges'.
- Aim for under 12 KB per frame (hard limit 300 KB). Fewer, cleaner shapes win.
- FORBIDDEN: <script>, <foreignObject>, <image>, href or url() pointing outside
  the file, on* event attributes, @import, web fonts. Text is allowed only for
  tiny marks like "!" or "z" (use font-family='Arial,sans-serif'), or draw the
  marks as paths.

MANIFEST FIELDS
  name         display name, at most 40 characters
  frameWidth   128
  frameHeight  128
  scale        1
  facing       "right"
  feetOffset   6
  petLines     3-5 short lines the buddy says when clicked (max 30 characters each)
  animations   { "<name>": { "fps": <number>, "frames": ["<file>.svg", ...] }, ... }
  doubleClick  { "animation": "trick", "seconds": 3, "say": "short line", "effect": <effect> }

  effect (optional, pick what suits the character):
    { "type": "confetti" }
    { "type": "bats", "count": 5 }
    { "type": "arc-letters", "text": "HELLO" }     (rainbow arc with 1-12 letters)

FILE NAMES
Name frames "<animation>-<index>.svg", for example "idle-0.svg", "walk-3.svg".
Every file named in the manifest must exist in "files", and every entry in
"files" must be used by some animation.

CHECK BEFORE ANSWERING
[ ] valid JSON: no trailing commas, no comments, no double quotes inside SVG
[ ] idle and walk exist; ideally all ten animations
[ ] every frame is a complete <svg ...>...</svg> with the xmlns and viewBox shown above
[ ] character faces right, lowest point at y = 122, centred on x = 64
[ ] nothing is cut off at the edges
[ ] manifest and files agree exactly on file names

EXAMPLE of the exact format (tiny: 4 animations, yours should be richer)
<!-- example:minimal -->
```json
{
  "id": "blobby",
  "manifest": {
    "name": "Blobby",
    "frameWidth": 128,
    "frameHeight": 128,
    "scale": 1,
    "facing": "right",
    "feetOffset": 6,
    "petLines": ["Blub!", "*wobbles*"],
    "animations": {
      "idle": { "fps": 2, "frames": ["idle-0.svg", "idle-1.svg"] },
      "walk": { "fps": 6, "frames": ["walk-0.svg", "walk-1.svg"] },
      "sleep": { "fps": 1, "frames": ["sleep-0.svg"] },
      "alert": { "fps": 4, "frames": ["alert-0.svg", "alert-1.svg"] }
    },
    "doubleClick": { "animation": "alert", "seconds": 3, "say": "Blub blub!", "effect": { "type": "confetti" } }
  },
  "files": {
    "idle-0.svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><ellipse cx='64' cy='100' rx='32' ry='22' fill='#7EC8A4' stroke='#2B5A45' stroke-width='3'/><circle cx='74' cy='94' r='4' fill='#222'/><circle cx='88' cy='94' r='4' fill='#222'/><path d='M 76 106 q 6 5 12 0' fill='none' stroke='#222' stroke-width='2.5' stroke-linecap='round'/></svg>",
    "idle-1.svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><ellipse cx='64' cy='100' rx='32' ry='22' fill='#7EC8A4' stroke='#2B5A45' stroke-width='3'/><path d='M 70 94 h 8 M 84 94 h 8' stroke='#222' stroke-width='2.5' stroke-linecap='round'/><path d='M 76 106 q 6 5 12 0' fill='none' stroke='#222' stroke-width='2.5' stroke-linecap='round'/></svg>",
    "walk-0.svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><ellipse cx='64' cy='102' rx='34' ry='20' fill='#7EC8A4' stroke='#2B5A45' stroke-width='3'/><circle cx='76' cy='97' r='4' fill='#222'/><circle cx='90' cy='97' r='4' fill='#222'/><path d='M 78 108 q 6 5 12 0' fill='none' stroke='#222' stroke-width='2.5' stroke-linecap='round'/></svg>",
    "walk-1.svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><ellipse cx='64' cy='98' rx='30' ry='24' fill='#7EC8A4' stroke='#2B5A45' stroke-width='3'/><circle cx='74' cy='90' r='4' fill='#222'/><circle cx='88' cy='90' r='4' fill='#222'/><path d='M 76 102 q 6 5 12 0' fill='none' stroke='#222' stroke-width='2.5' stroke-linecap='round'/></svg>",
    "sleep-0.svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><ellipse cx='64' cy='110' rx='38' ry='12' fill='#7EC8A4' stroke='#2B5A45' stroke-width='3'/><path d='M 72 108 q 4 3 8 0 M 86 108 q 4 3 8 0' fill='none' stroke='#222' stroke-width='2.5' stroke-linecap='round'/><path d='M 98 84 h 10 l -10 10 h 10' fill='none' stroke='#5B8DEF' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/></svg>",
    "alert-0.svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><ellipse cx='64' cy='96' rx='30' ry='26' fill='#7EC8A4' stroke='#2B5A45' stroke-width='3'/><circle cx='74' cy='88' r='5' fill='#fff' stroke='#222' stroke-width='1.5'/><circle cx='88' cy='88' r='5' fill='#fff' stroke='#222' stroke-width='1.5'/><circle cx='75' cy='88' r='2.5' fill='#222'/><circle cx='89' cy='88' r='2.5' fill='#222'/><ellipse cx='81' cy='102' rx='4' ry='5' fill='#222'/><rect x='108' y='30' width='6' height='20' rx='3' fill='#E63946'/><circle cx='111' cy='58' r='3.6' fill='#E63946'/></svg>",
    "alert-1.svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><ellipse cx='64' cy='88' rx='30' ry='26' fill='#7EC8A4' stroke='#2B5A45' stroke-width='3'/><circle cx='74' cy='80' r='5' fill='#fff' stroke='#222' stroke-width='1.5'/><circle cx='88' cy='80' r='5' fill='#fff' stroke='#222' stroke-width='1.5'/><circle cx='75' cy='80' r='2.5' fill='#222'/><circle cx='89' cy='80' r='2.5' fill='#222'/><ellipse cx='81' cy='94' rx='4' ry='5' fill='#222'/><rect x='108' y='22' width='6' height='20' rx='3' fill='#E63946'/><circle cx='111' cy='50' r='3.6' fill='#E63946'/></svg>"
  }
}
```

NOW create the bundle for MY BUDDY above.
````

If the AI's answer does not import cleanly, run `node bin/buddy.js validate`
on it (or just try the import, which prints the same list) and paste the
problems back to the AI. The guide has a ready-made message for that.
