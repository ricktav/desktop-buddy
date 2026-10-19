# Photo-realistic buddies: pipeline and brief for an image-generation tool

Desktop Buddy plays a handful of short frame loops (idle, walk, sit, ...). A photo-style
buddy is the same thing made from **PNG/WebP frames with a transparent background**
instead of SVG. This page is two things in one:

- **Part 1** is the brief you can paste to an image- or video-generation tool (or an AI
  assistant that drives one). It produces raw pictures.
- **Part 2** is what you run on your computer to turn those pictures into a buddy.

```
generate raw frames  ->  node scripts/photo-pack.mjs  ->  buddy import  ->  it walks on your screen
 (Part 1)                 (cut out, scale, align, manifest)
```

Realistic = heavier files (about 60 to 200 KB per frame), 12 to 40 frames per buddy. That
is fine. A shipped photo buddy is typically 2 to 6 MB.

---

## Part 1. Brief for the image / video generator (copy from here)

### What you are making

Frames for a small desktop companion. It is a **side view** character that walks left and
right along the bottom of a screen, sits, sleeps, points at things and celebrates. The
character is shown about 128 pixels tall, so the frames only need to be clear and
consistent, not huge.

### Hard rules (apply to every image)

1. **One character, the same character in every image.** Same colours, markings, clothes,
   proportions, lighting. Use the reference image / character seed / "same character as
   image 1" feature of your tool for every shot.
2. **Strict side view** (profile), whole body visible including all feet and the tail or
   any prop, with a margin around it. The character **faces RIGHT** in every image.
3. **Plain, flat background of one solid colour: pure green #00FF00**, edge to edge, no
   gradient, no floor, no cast shadow, no reflection, no vignette, no text, no watermark.
   (If the character is green, use magenta #FF00FF instead and say so in the notes.)
4. **Even, soft, front-lit studio lighting** with no strong rim light in the background
   colour (that makes green fringes on the cut-out).
5. **Same framing in every image:** same camera distance, same camera height, character
   in the middle, feet resting at the same height in the picture. Do not zoom between shots.
6. **Square images, at least 768 x 768** (1024 x 1024 is ideal).
7. Sharp focus everywhere (no depth-of-field blur), no motion blur.
8. Expression: friendly, big-eyed, slightly stylised-cute is fine, uncanny is not.

### Master prompt (fill in the character, then reuse it for every shot)

```
[CHARACTER: e.g. "a golden labrador retriever puppy with a red collar"], photorealistic,
sharp fur detail, soft even studio lighting, strict side profile facing right, full body
visible with all four paws, centred with margin, standing on an invisible ground,
isolated on a flat solid pure green (#00FF00) background with no shadow and no floor.
Same character, same camera distance and height as the reference image.
POSE: [pose from the shot list]
```

Negative prompt, if the tool has one: `shadow, floor, reflection, gradient background,
text, watermark, cropped, cut off, multiple animals, three-quarter view, front view,
motion blur, depth of field, different colours`.

### Shot list

Name the files exactly like this (`<animation>-<number>.png`, numbers start at 1).
The ones marked **required** must exist; the others are optional, but a buddy with all of
them feels alive. More frames in a loop = smoother, but 2 to 4 is enough.

| File names | Frames | Pose to ask for |
|---|---|---|
| `idle-1`, `idle-2`, `idle-3`, `idle-4` **required** | 4 | Standing, relaxed. Tiny differences between frames: weight shifted, head slightly up/down, a blink in one frame, tail or hand in a slightly different place. |
| `walk-1` ... `walk-6` **required** | 6 | A full walk cycle in side view, walking right. Frame 1 contact (front foot forward), 2 down, 3 passing (legs together), 4 contact on the other leg, 5 down, 6 passing. Same size and same body height as idle. |
| `run-1`, `run-2` | 2 | Optional. A gallop in side view, used instead of walking when the buddy is sent somewhere in a hurry (`buddy alert --hurry`, fast speed). |
| `sit-1`, `sit-2` | 2 | Sitting down, looking forward. Frame 2: head turned or a blink. |
| `sleep-1`, `sleep-2` | 2 | Curled up or lying down asleep, eyes closed. Frame 2: body slightly higher (breathing). |
| `watch-1`, `watch-2` | 2 | Standing or sitting, head turned and eyes up as if looking at a screen far above, attentive. |
| `point-1`, `point-2` | 2 | Pointing or nodding towards the right: raised paw / hand / beak aimed forward, "look over there". |
| `alert-1`, `alert-2` | 2 | Surprised, ears or crest up, mouth open, on full alert. |
| `happy-1`, `happy-2`, `happy-3` | 3 | Celebration: jumping with joy, mouth open smiling. Frame 2 is the top of the jump (feet off the ground). |
| `drag-1` | 1 | Being picked up and dangling: legs hanging down, surprised face. |
| `trick-1` ... `trick-4` | 4 | One signature move for double-click (rears up, spins, rolls over, tips a hat...). |

Grid shortcut: tools that only make one picture at a time can make **one sheet per
animation** ("a 3 x 2 sprite sheet of the same character, 6 frames of a walk cycle, same
size in every cell, flat green background"). Keep the cells equal; the importer slices them.

### Delivery

Return the images (PNG preferred, JPG/WebP fine) in one folder or zip, named as above, plus
a small `buddy.meta.json` (the importer reads it):

```json
{
  "name": "Rex",
  "facing": "right",
  "petLines": ["Woof!", "*happy tail wiggles*", "*leans in*"],
  "doubleClick": { "animation": "trick", "seconds": 2.5, "say": "Ta-da!", "effect": { "type": "confetti" } }
}
```

`name`: short display name. `petLines`: 3 to 6 things it says when clicked, in its voice.
`doubleClick` is only needed if you made `trick-*` frames (`effect.type` is `confetti`,
`bats` or `arc-letters` with `"text": "HI"`).

---

## Part 2. Build the buddy from the pictures

One-time setup in the project folder: `npm install` (this installs `sharp`, used for image
handling) and `npm run build`.

### Folder of images

```bash
# put idle-1.png ... walk-6.png (+ buddy.meta.json) into ./raw/rex
node scripts/photo-pack.mjs raw/rex --name "Rex" --out out/rex --shadow --preview out/rex-preview.png
node bin/buddy.js import out/rex --id rex   # or add --install above
```

Open `out/rex-preview.png`: every frame on a checkerboard, with a pink line where the feet
should land. Check three things: no coloured fringe around the edge, nothing cut off, feet
on the line.

### One sheet instead of single files

```bash
node scripts/photo-pack.mjs --sheet walk-sheet.png --grid 3x2 --layout walk:6 \
  --name "Rex" --out out/rex
```

`--layout idle:4,walk:6,sit:2` reads cells left-to-right, top-to-bottom. With several sheets,
first cut each into one shared folder, then build from that folder:

```bash
node scripts/photo-pack.mjs --sheet idle-sheet.png --grid 2x2 --layout idle:4 --split raw/rex
node scripts/photo-pack.mjs --sheet walk-sheet.png --grid 3x2 --layout walk:6 --split raw/rex
node scripts/photo-pack.mjs raw/rex --name "Rex" --out out/rex
```

### What the tool does for you

| Step | Detail |
|---|---|
| Cut-out | Removes the background by flood-filling from the border (a green eye or white highlight inside the character is kept), soft edge, removes colour spill, shrinks the edge by 1 px (`--erode`). Pictures that are already transparent are left alone. |
| One scale | All frames share one scale factor (the biggest pose fits), so a sitting dog is smaller than a standing one. |
| Feet alignment | Feet on a common baseline, character centred. |
| Output | 256 x 256 transparent frames (`--size`), shown 128 px tall (`--display`). |
| Manifest | `buddy.json` with sensible frame rates (`--fps walk=10`). |
| Validation | Runs the app's own validator and prints problems. |

Options that matter most:

| Option | When |
|---|---|
| `--key green\|magenta\|white\|black\|#rrggbb\|none` | Default `auto` samples the background colour from the picture's border. Name it if auto picks wrong. |
| `--tolerance 60` | Raise (80 to 100) if background remnants remain, lower (30 to 40) if the character's edge is eaten. |
| `--registered` | Use when the character stands at the **same place in the camera frame in every image** (frames cut from one video, a fixed-camera render). Poses keep their relative position, so a hop stays a hop. Without it each frame is re-centred with its feet on the ground, which is what you want for separately generated stills. |
| `--facing left` | Your art faces left. The buddy mirrors it as needed. |
| `--flip walk-1,sit-1` | Some frames came out facing the other way. Mirrors just those frames so that all face `--facing`. |
| `--keep-shadows` | Cast shadows on the background are removed by default (same hue, darker). Use this to keep them. |
| `--keep-holes` | Keeps enclosed pockets of the background colour (for a character with green parts). By default a gap between the legs is cut out too. |
| `--frame-scale idle-1=1.4` | One frame came out smaller or larger than the others. |
| `--shadow` | Bakes a soft ground shadow under the feet. |
| `--format webp --quality 88` | About 3x smaller files. |
| `--size 384 --display 160` | A bigger buddy. |
| `--install` | Imports the result straight into your buddies. |

### Other ways to get the frames

**From a short video (image-to-video tools).** Ask for 3 to 4 seconds, locked camera, green
background, character walking in place (treadmill walk) or standing. Then:

```bash
mkdir -p raw
ffmpeg -i walk.mp4 -vf "fps=8,crop=min(iw\,ih):min(iw\,ih)" -start_number 1 raw/walk-%d.png
# keep the 6 to 8 frames that form one loop (delete the rest, renumber from 1), add idle-*.png the same way
node scripts/photo-pack.mjs raw --name "Rex" --registered
```

Walking *in place* is important: a walk that travels across the picture cannot loop.

**From photos of a real pet (or a toy).** Photograph on a plain coloured sheet (green card
is cheap), side-on, daylight, same distance, 6 to 10 shots as the animal moves: that is
enough for idle, sit, watch and a rough walk. Or let an image tool create the missing poses
from 2 or 3 photos using the character-reference feature, then follow Part 1. Only use
photos you have the right to use. Buddies of real people need their consent.

**From a 3D model or Blender / game character.** Render the animation from a fixed side
camera with a transparent background (PNG with alpha), 256 to 512 px square, and use
`--registered --key none`.

**Already have transparent PNGs** (for example from a background-removal tool): use
`--key none`, or leave `auto`, which detects the transparency.

### Walk cycles that jiggle

Image generators draw every frame separately, so the animal comes out at a slightly different size
and spot each time, and the legs barely change. Played as an animation that looks like jiggling, not
walking. Three options fix most of it:

```bash
node scripts/photo-pack.mjs raw/rex --name Rex --stabilize idle,walk,watch --ref idle-2 --bob walk=4
```

- `--stabilize idle,walk,...` lays each frame's silhouette over a reference frame, so the animal has the same size and place in every frame and only the legs and head move. Use it for poses of the same kind (standing and walking), not for lying or jumping poses.
- `--bob walk=4` adds a small body bounce between footfalls (px at the final frame size).
- `--pingpong walk` plays a short walk forwards and backwards (1 2 3 2) instead of jumping from the last frame to the first. Use it when you have only 2 to 4 walk frames that are not a real loop.

The tool can only use the poses it is given. For a convincing walk ask the generator for **8 frames of
one full stride in side view, with clearly different leg positions**: contact (front foot down, legs
far apart), down, passing (legs together, one leg lifted), up, and the same again for the other leg.
Say "exaggerated leg positions", "treadmill walk in place" and "same camera, same size in every frame".
Video-to-frames (see above) usually gives the best cycles.

### If it looks wrong

| Symptom | Fix |
|---|---|
| Green or white halo around the edge | `--erode 2`, raise `--tolerance`, or regenerate with a flatter background and softer light. |
| Parts of the character vanish | `--tolerance 35`, or use a key colour the character does not contain. Holes that touch the border can be eaten; leave a margin. |
| Buddy hops or jitters while walking | The walk frames differ in size or framing. Regenerate them in one go with the same camera, or use `--registered`. |
| Buddy looks too small or large | `--display 160` (bigger) or `96`, or edit `"scale"` in `buddy.json`. |
| Feet float or sink | `--pad-bottom` (space under the feet, default 8) or edit `"feetOffset"` in `buddy.json`. |
| "different sizes" warning | Frames were not made by this tool. Run them through it. |
| File too large | `--format webp`, `--size 192`, fewer frames. Limits: 1 MB per frame, 40 MB per pack. |
| Character faces the wrong way while walking | `--facing left`. |

### Sending it to someone else

A photo buddy is a folder (`buddy.json` plus frames), not a single JSON bundle. Zip the
folder; the other person unzips it and runs `node bin/buddy.js import ./rex`.
