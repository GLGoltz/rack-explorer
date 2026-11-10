# Server Rack Explorer

Rebuilt from the built `server-rack.html` so it can be edited and rebuilt.

```
node build.mjs        # writes server-rack.html (Node 18 or newer, no packages needed)
```

## Where to change things

| To change | Edit |
|---|---|
| What the panel says about a device, flows, attack scenarios, boot order | `src/content.json` |
| Which U a device sits in, its depth, colour, or shelf type | `DEVICES` in `build.mjs` |
| Items on the drawer and shelves (Pis, USB sticks, desktop firewalls) | `ITEMS` in `build.mjs` |
| Rack frame size, posts, base, feet | `FRAME` in `build.mjs` |
| Front or rear panel artwork (ports, LEDs, logos, vents) | `src/faces/front/<id>.svg`, `src/faces/rear/<id>.svg` (the Auxiliary Server's is `aux-face.svg`, because Windows reserves the name `aux`) |
| Drive carriers and PSUs that slide out | `src/parts.json` (position) and `src/faces/<view>/part-<id>.svg` (art) |
| Colours of panel artwork and device palettes | `src/style.css` |
| Buttons, tabs, camera, power-on and take-apart behaviour | `src/live.js` |
| Page layout around the drawing | `src/shell.html` |

## Panel artwork

Each face file is flat SVG in panel units: 1 unit = 1 world unit, x runs left to right as you
look at the face, y runs down from the top edge. A 1U front panel is 152 wide and 12.8 tall.
The build places it on the device's face in the right perspective. Keep these attributes,
because `live.js` looks for them:

- `class="led" data-dev="<device id>" data-led="<kind>"` on LEDs (pwr, sta, port, drv, ...)
- `class="port" data-dev=... data-port=... data-tip=...` on hoverable ports

## Adding a device

1. Add a row to `DEVICES` (id, U, depth, palette, kind).
2. Add `src/faces/front/<id>.svg` and `src/faces/rear/<id>.svg`.
3. Add the device to `devices` in `src/content.json` (and to `power` if it boots).

## World units

x across the rack, y front (+) to back (-), z up. 1U = 14 units; a device in U n sits at
z = 12 + (n - 1) × 14. Device fronts are at y = 68; the rack posts' front faces at y = 75.
