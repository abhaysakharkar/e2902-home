# E2-902 · Home

A scroll-driven walk through flat E2-902 at Palladio Kharadi Central II, Pune. The page opens on the floor plan. When you scroll, the walls rise out of the drawing and the camera walks through eight rooms. Each room stays a line drawing until you get there, then the real materials sweep across it. At the end the camera rises back up to a full-colour plan.

**Live:** https://abhaysakharkar.github.io/e2902-home/

- [Scroll walk](https://abhaysakharkar.github.io/e2902-home/): the plan turns into the flat as you scroll
- [Walk it yourself](https://abhaysakharkar.github.io/e2902-home/walk/): first person, plus VR / AR on a headset or phone
- [Set the mood](https://abhaysakharkar.github.io/e2902-home/studio/): restyle surfaces, arrange furniture, real sun, compare

It runs in the browser and works best on a laptop. Anything you change (materials, layouts, furniture) is saved only in your own browser.

The idea and page structure follow [Casa Serra](https://sam1983aing.github.io/casa-serra/) by Sam Aing. The code here is new, written for this flat.

## Walk it yourself

`walk/` is a first-person version of the same flat, after [this demo](https://x.com/finebutwhy/status/2109336205120995600): WASD with a free mouse cursor (joystick on phones), collision with walls and furniture, evening light, and every texture drawn in code (`walk/proctex.js`), with no image files. The pointer stays visible while you walk: its position sets where you look (up to about 55° each side), resting at the left or right edge keeps turning, and the layout buttons, room list, map and toggles can be clicked without pausing. Over a panel the view eases back to straight ahead. Press C (or the Mouse button) for the classic locked mouse-look. Keys: 1–8 jump to a room, F switch layout, L lights, T day/evening, M big map, Esc pause. It reuses `js/plan.js` and `js/build.js`, so both pages show the same model.

## Set the mood

`studio/` is an interior configurator for the same flat, after [this demo](https://x.com/nikosolenne/status/2111603809848029601). It shows a cutaway dollhouse on a dark plinth.

- **Restyle any surface:** 12 surfaces (floors, walls, feature wall, upholstery, accents, bedding, rugs, woodwork, kitchen shutters, countertop, deck). Click a surface in the room or in the moodboard, then pick a swatch, or drag a swatch straight onto the model. Swatches that don't suit a surface are dimmed (no marble bedding).
- **33 procedural swatches** in Wood, Stone, Fabric and Paint (`studio/swatches.js`), all drawn in code.
- **Mood meter:** Cozy / Bright / Moody, worked out from the colours and warmth of the main surfaces plus the light. A line describes the result. Three presets set materials and time together.
- **Daylight:** a time slider from 06:00 to 23:30, four presets with live thumbnails, and a sun handle you can drag. Lamps come on after sunset.
- **Furniture:** drag pieces across the floor, press R to turn them. The Furniture tab switches each room between its A/B/C layouts.
- **Toolbar:** undo/redo (Ctrl+Z / Ctrl+Y), save PNG, copy a share link (materials, time, walls and layouts go in the URL; hand-moved furniture doesn't), hide panels, record an 8-second orbit video (.webm), help.
- **Walls:** full, cut or low.

## Arrange furniture and save custom layouts

The **Arrange** tab in the tools card (studio and walk; key G in the walk) is for placing furniture precisely (`js/arrange.js`):
- **Pick a piece:** click it. In the walk, the Arrange tab must be open (G). The mouse is then a normal pointer, with a hand over furniture, and the view holds still. Hold the right button and drag to look around; WASD still walks. A locked mouse (C) is released while Arrange is open and comes back when you leave it. Its own parts come with it (a wardrobe's handles, a table's legs and vase, a lamp's base, pole and shade); neighbours don't.
- **Place it:** nudge 5 cm (arrow keys in the studio, Shift for 1 cm), turn 15° or 90° (R), "Against wall", remove, or reset. The panel shows the piece's size and its gap to each wall.
- **Save as custom layout:** name the room's arrangement. It's saved as the base layout (A/B/C) plus where each piece sits and what you removed, and appears as a ★ chip next to A/B/C in the studio, the walk and the studio's Furniture tab. Update or delete it any time. Choosing A, B or C puts the room back as drawn for that layout.
- Custom layouts are stored in browser storage (`e2902-custom`), and the active arrangement goes into the shared design, so the scroll page shows it too.

## One design everywhere

The studio saves its materials and any furniture you drag (`js/design.js`, browser storage). The walk and scroll pages apply it when they load, and follow changes live if they are already open in another tab. Layouts (A/B/C) and fit-check pieces were already shared. "Original look ↺" in the studio's moodboard clears the saved materials and furniture moves. A share link (`#s=…`) still overrides the saved design in the studio.

## VR and AR (walk page)

The **VR / AR** button in the walk (after "Step inside"):
- **Enter VR** (Quest and other headsets):
  - you stand in the flat at true scale;
  - left stick walks with wall collision, right stick snap-turns 30°;
  - point a controller at the floor and pull the trigger to teleport;
  - A/X switches the current room's layout, B/Y toggles the lights.
- **AR · dollhouse** (Android Chrome with ARCore, Quest 3 passthrough): tap a table to place the flat at 1:40 with the walls cut low.
- **AR · true scale:** stand at the real front door facing in, then start. Your furniture, kitchen and fit-check pieces appear at full size; the model's walls, floors, windows and railing are hidden so the real ones show through. On-screen arrows nudge and rotate it to line it up.

WebXR only runs on secure (https) pages. The published site is https, so on a Quest or phone just open https://abhaysakharkar.github.io/e2902-home/walk/ and use the VR / AR button.

## Real sun and compare

**Real sun** (`js/sun.js`): NOAA solar-position equations for Kharadi (18.55° N, 73.95° E, IST). North comes from the compass on the builder's drawings: 26.3° clockwise from the top of the sheet, so the sky deck faces roughly north-north-west.
- **Studio:**
  - a date picker with solstice/equinox chips, live sunrise and sunset times, and the sun's height and direction;
  - the day's sun path drawn as a dotted arc with hour labels, and a sun handle you can drag along it;
  - Morning / Midday / Evening presets that follow the date.
- **Shading:** invisible full-height walls, sills, lintels and the slab above cast the shadows, so sunlight only lands where it really gets in, even with the walls cut down. The front door counts as closed (it opens onto the enclosed corridor).
- **Direct sun by room:** hours of sun on each room's floor for the chosen date, sampled every 15 minutes. Neighbouring towers aren't modelled.
- **Walk:** the ☀ button opens the date and time; T jumps between golden hour and midday.

**Compare** (studio, split-screen button): two independent copies of the flat side by side, A and B, each with its own materials, layouts, date and time and a shared camera. Click a side to edit it, and copy one side to the other with Copy A → / ← Copy B. "June vs December" sets up a seasonal study. The share link and the walk/scroll pages use A. Tools and floating tags are off in compare.

## Tools: electrical, tape measure, fit check

Both the walk and the studio have a **Tools** card (top right in the walk, bottom right in the studio). The code is shared in `js/tools.js`.

- **Electrical** (key E): 129 points from the builder's electrical layout ("Original layout with fittings"): switchboards, sockets, lights, fans, exhausts, smoke detectors and panels, each colour-coded. Hover a point for its schedule description and mounting height. The kitchen points follow the customised drawing and wear a gold ring; this adds the new west-run switchboard, PP3 at 600 mm, the under-counter purifier point and the robot-dock point. **Clash check:** any switchboard or socket hidden behind furniture in the current layout is listed and shown in red. Click a clash to go to it. Appliance points (PP, P) are skipped because they belong behind appliances. Data is in `js/electrical-data.js`, aligned to the model at 58.54 pt/m.
- **Tape** (key Q): click two points to get feet-inches and mm. Shift keeps the line straight; right-click or Backspace removes the last one.
- **Fit check:** pick a preset or type W × D × H in cm and place the piece. It shows the gap on each side, amber under 75 cm and red on overlap. Nudge or turn it from the list; in the studio, drag it and press R. Pieces are saved in the browser and shared by both pages, and you collide with them in the walk.

## Furniture layouts

Every room has three furniture layouts. **A** is always the layout from the customised drawing; **B** and **C** are alternatives, each placed against the room's real doors, door swings and windows.

| Room | A | B | C |
| --- | --- | --- | --- |
| Lobby | As drawn | Console & mirror | Tall storage |
| Parent's bedroom | As drawn | Bed on west wall | Twin beds |
| Living | As drawn | L-sectional | Conversation |
| Sky deck | As drawn | Bistro dining | Lounge |
| Dining | 6 seats | Round · 4 seats | Long table · 8 seats |
| Kitchen | Sage & white | Walnut & charcoal | Navy & white |
| Kid's bedroom | As drawn | Bunk bed | Study corner |
| Master bedroom | As drawn | Bed on west wall | Dressing wall |

The kitchen cabinetry is built in, so its options change finishes, not layout. Bathrooms are fixed.

- **Scroll page:** use the A/B/C buttons in each room's card.
- **Walk page:** the panel shows the layouts for the room you're standing in; press **F** to cycle, or click when paused (Esc).
- Choices are remembered in the browser and shared by both pages.
- Layouts live in `js/build.js` (`layout('room', i, ...)`); names are in `LAYOUTS` in `js/plan.js`. Collision follows whichever layout is showing. All lobby × living × dining combinations were checked so every room stays reachable on foot.

## Run it

Or run a copy locally. It needs a web server, because ES modules don't load from `file://`:

```bash
python -m http.server 8643
```

Then open http://localhost:8643, http://localhost:8643/walk/ or http://localhost:8643/studio/.

## Where the geometry comes from

The builder's and designer's original PDF drawings are not included in this repository; the measurements taken from them are in `js/plan.js` and `js/electrical-data.js`.

- **Walls, doors and windows**: traced from the vector fills in the builder's dimension drawing (E2-02). The scale is 1.12 pt to the inch, so the model is the drawing at true size (about 14.2 × 10.1 m).
- **Kitchen and furniture**: from the customised layout (drawing no. 1, 06 Jan 2026) and the kitchen option 1 drawing. The store is merged into a U-shaped kitchen and the lobby opening is closed.
- **The five change notes** show up as numbered red markers in the kitchen and living room, and are listed in the closing section.

## Files

| File | What it does |
| --- | --- |
| `js/plan.js` | All the data: wall polygons, openings, rooms, plan labels, camera path, room cards, note markers |
| `js/materials.js` | The reveal map (paper → material sweep), the shader patch, ink lines, texture loading |
| `js/build.js` | Walls, floors, doors, windows, furniture, and the city outside |
| `js/main.js` | Renderer, lights, scroll → camera path, UI overlays |
| `css/style.css` | Page styling |
| `assets/` | CC0 textures and sky from [Poly Haven](https://polyhaven.com) |

To change the walk, edit `SHOTS` in `js/plan.js`. Each shot is a camera position, a look-at target and a field of view. `move` and `hold` set how much scrolling each part takes, and `stop` marks a room with a card.

To check one camera pose, open `http://localhost:8643/?u=16`, where `u` is the shot index (16 is the kitchen).

## Stack

three.js 0.160, GSAP 3.13 + ScrollTrigger, Lenis. Plain files, no build step.
