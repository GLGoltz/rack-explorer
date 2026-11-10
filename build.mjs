// Server Rack Explorer: build script.
//
//   node build.mjs            writes server-rack.html
//
// What lives where
//   build.mjs                 geometry: the rack frame, the device table, shelf items, views
//   src/content.json          everything the panel says: devices, parts, power order, flows, attacks
//   src/parts.json            removable pieces (drive carriers, PSUs) and how far they slide or lift
//   src/faces/<view>/*.svg    front and rear panel artwork, drawn flat in panel units
//                             (1 unit = 1 world unit; x runs left to right, y runs down from the top edge)
//   src/style.css             panel artwork and palette styles
//   src/live.js               the interactive layer (camera, power, take-apart, tabs)
//   src/shell.html            page layout around the drawing
//   kit/iso-kit.mjs           the anatomy kit (projection, solids, CSS)
//
// World units: x across the rack (left to right seen from the front), y front (+) to back (-), z up.
// One rack unit (U) is 14 units tall. A device in U n sits at z = 12 + (n - 1) * 14.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "./kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");
const json = (p) => JSON.parse(read(p));

// ---------------------------------------------------------------- dimensions
const U = 14;              // one rack unit
const GAP = 1.2;           // clearance between neighbouring devices
const H1 = U - GAP;        // height of a 1U device
const W = 152;             // device width, ears included (19-inch class)
const FRONT_Y = 68;        // plane of every device front panel
const BASE_Z = 12;         // bottom of U1
const TOP_Z = BASE_Z + 24 * U; // 348: top of U24
const zOfU = (u) => BASE_Z + (u - 1) * U;

const FRAME = {
  postX: [78, 84],         // post spans x 78..84 (and mirrored)
  postY: [69, 75],         // post spans y 69..75 (and mirrored)
  barH: 6,                 // top and bottom frame bar height
  base: { x: -90, y: -80, w: 180, d: 160, r: 2 },
  baseZ: [4, BASE_Z],
  foot: { r: 3.5, h: 4, inset: 10 },
};

// ---------------------------------------------------------------- device table
// kind: "server" (solid chassis), "drawer" (sliding shelf), "tray" (cantilever shelf)
// pal:  colour class from src/style.css
const DEVICES = [
  { id: "ups",    u: 1,  d: 130, pal: "pal-blk", kind: "server" },
  { id: "drawer", u: 2,  d: 124, pal: "pal-blk", kind: "drawer", floor: 2.6 },
  { id: "nas",    u: 4,  d: 120, pal: "pal-nas", kind: "server" },
  { id: "aux",    u: 6,  d: 130, pal: "pal-blk", kind: "server" },
  { id: "bk",     u: 8,  d: 100, pal: "pal-wht", kind: "tray", floor: 2.8 },
  { id: "fw",     u: 10, d: 100, pal: "pal-wht", kind: "tray", floor: 2.8 },
  { id: "sw2",    u: 12, d: 84,  pal: "pal-wht", kind: "server" },
  { id: "core",   u: 14, d: 84,  pal: "pal-wht", kind: "server" },
  { id: "hv",     u: 16, d: 130, pal: "pal-blk", kind: "server" },
  { id: "r420",   u: 18, d: 130, pal: "pal-gry", kind: "server" },
  { id: "kvm",    u: 24, d: 124, pal: "pal-blk", kind: "server" },
];

// Power strip on the rear rail: panel artwork faces the back.
const PDU = { id: "pdu", x: [62, 70], y: [-68, -62], z: [48, 304], pal: "pal-frame" };

// ---------------------------------------------------------------- shelf items
// Small things that sit on a shelf and lift off it when taken apart.
// plan = footprint on the shelf; h = height; the panel art width must match w.
const ITEMS = [
  { id: "dongle",    host: "drawer", pal: "pal-gry",  plan: { x: -53.5, y: 5,    w: 16, d: 7.5 },  h: 3.4 },
  { id: "kvm-cable", host: "drawer", pal: "pal-blk",  plan: { x: -6.5,  y: -1,   w: 22, d: 13.5 }, h: 3.6 },
  { id: "pi-web",    host: "drawer", pal: "pal-grn",  plan: { x: -60.5, y: 29,   w: 30, d: 19.5 }, h: 7 },
  { id: "pi-vuln",   host: "drawer", pal: "pal-red",  plan: { x: -24.5, y: 29,   w: 30, d: 19.5 }, h: 7 },
  { id: "console",   host: "drawer", pal: "pal-blue", plan: { x: 44.5,  y: 31,   w: 16, d: 15.5 }, h: 3.6 },
  { id: "usb-b",     host: "drawer", pal: "pal-wht",  plan: { x: 23,    y: 38.5, w: 11, d: 4 },    h: 3 },
  { id: "usb-a",     host: "drawer", pal: "pal-blk",  plan: { x: 23,    y: 50.5, w: 11, d: 4 },    h: 3 },
  { id: "sg3100",    host: "bk",     pal: "pal-wht",  plan: { x: -68.5, y: 21.5, w: 54, d: 33 },   h: 10 },
  { id: "fw60e",     host: "bk",     pal: "pal-wht",  plan: { x: 3.5,   y: 11,   w: 66, d: 45.5 }, h: 10.5 },
  { id: "fw-unit",   host: "fw",     pal: "pal-wht",  plan: { x: -70.5, y: 7,    w: 66, d: 51.5 }, h: 10.5 },
];

// ---------------------------------------------------------------- views
// Same camera for both views; the rear view looks from behind (azimuth + 180).
const PROJ = { origin: [350, 674.7159133047919], scale: 1.3575924817192546, elevation: 30 };
const VIEWS = {
  front: { ...PROJ, azimuth: 45 },
  rear: { ...PROJ, azimuth: 225 },
};
const SIGN = { front: 1, rear: -1 };

// ---------------------------------------------------------------- data
const content = json("src/content.json");
const PARTS = json("src/parts.json"); // removable face pieces per view
// Windows refuses files named after devices (aux, con, prn, nul, com1, lpt1...),
// so those faces are stored as "<name>-face.svg".
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const face = (view, name) => {
  const p = join(HERE, "src/faces", view, (RESERVED.test(name) ? name + "-face" : name) + ".svg");
  return existsSync(p) ? readFileSync(p, "utf8").trim() : "";
};

// ---------------------------------------------------------------- helpers
const dec = (v) => (Math.round(v * 10000) / 10000).toFixed(4);
// Matrix that maps flat panel art (u right, v down, 1 unit = 1 world unit)
// onto a vertical face whose top-left corner is `at`, running along world x.
function faceMatrix(P, at, sign) {
  const u = K.axisVector(P, [sign, 0, 0]);
  const v = K.axisVector(P, [0, 0, -1]);
  const o = K.iso(at, P);
  return `matrix(${dec(u[0])} ${dec(u[1])} ${dec(v[0])} ${dec(v[1])} ${o[0].toFixed(2)} ${o[1].toFixed(2)})`;
}
const artOn = (P, at, sign, art) => (art ? `<g transform="${faceMatrix(P, at, sign)}">${art}</g>` : "");
const solid = (plan, z, h, P, opts = {}) =>
  K.solidSvg(K.slabOf({ r: 0.6, ...plan }, z, h, P, 2, opts.bevel ?? 0.4), { tone: "hi", crease: "lo", ...opts });
const depth = (P, [x, y, z]) => K.depthOf([x, y, z], P);

// ---------------------------------------------------------------- frame
function posts() {
  const [x0, x1] = FRAME.postX, [y0, y1] = FRAME.postY;
  return [
    { id: "FL", plan: { x: -x1, y: y0, w: x1 - x0, d: y1 - y0 } },
    { id: "FR", plan: { x: x0, y: y0, w: x1 - x0, d: y1 - y0 } },
    { id: "RL", plan: { x: -x1, y: -y1, w: x1 - x0, d: y1 - y0 } },
    { id: "RR", plan: { x: x0, y: -y1, w: x1 - x0, d: y1 - y0 } },
  ];
}
function frameParts(view) {
  const P = VIEWS[view], s = SIGN[view];
  const near = (p) => depth(P, [p.plan.x + p.plan.w / 2, p.plan.y + p.plan.d / 2, 0]) > 0;
  const out = { base: [], far: [], near: [], top: [] };
  // base plinth, feet and halo
  const b = FRAME.base;
  out.base.push(`<path class="iso-halo" d="${K.haloOf({ x: b.x - 6, y: b.y - 6, w: b.w + 12, d: b.d + 12, r: 8 }, 0, 1, P)}"/>`);
  const f = FRAME.foot;
  const feet = [[b.x + f.inset, b.y + f.inset], [b.x + b.w - f.inset, b.y + f.inset], [b.x + f.inset, b.y + b.d - f.inset], [b.x + b.w - f.inset, b.y + b.d - f.inset]]
    .sort((p, q) => depth(P, [...p, 0]) - depth(P, [...q, 0]));
  for (const [cx, cy] of feet)
    out.base.push(`<g class="pal-frame">${K.solidSvg(K.cylinder(cx, cy, f.r, 0, f.h, P, 24, 0.3), { tone: "mid", crease: "lo" })}</g>`);
  out.base.push(`<g class="pal-frame">${solid(b, FRAME.baseZ[0], FRAME.baseZ[1] - FRAME.baseZ[0], P, { bevel: 0.8 })}</g>`);
  // bottom side bars join front and rear posts
  const [x0, x1] = FRAME.postX, [, y1] = FRAME.postY;
  for (const sx of [-1, 1]) {
    const plan = { x: sx < 0 ? -x1 : x0, y: -y1, w: x1 - x0, d: 2 * y1 };
    out.base.push(`<g class="pal-frame">${solid(plan, BASE_Z, FRAME.barH, P)}</g>`);
  }
  // posts: far ones behind the devices, near ones in front
  const ps = posts().sort((p, q) => depth(P, [p.plan.x, p.plan.y, 0]) - depth(P, [q.plan.x, q.plan.y, 0]));
  for (const p of ps) {
    const svg = solid(p.plan, BASE_Z, TOP_Z - BASE_Z, P);
    (near(p) ? out.near : out.far).push(svg);
  }
  // U-numbered rail face on the front-left post as seen from this view
  const railAt = view === "front" ? [-FRAME.postX[1], FRAME.postY[1], TOP_Z] : [FRAME.postX[1], -FRAME.postY[1], TOP_Z];
  out.rail = `<g class="railface">${artOn(P, railAt, s, face(view, "rail"))}</g>`;
  // top frame: four bars and a roof panel
  const bars = [
    { x: -x1, y: FRAME.postY[0], w: 2 * x1, d: FRAME.postY[1] - FRAME.postY[0] },
    { x: -x1, y: -y1, w: 2 * x1, d: FRAME.postY[1] - FRAME.postY[0] },
    { x: -x1, y: -y1, w: x1 - x0, d: 2 * y1 },
    { x: x0, y: -y1, w: x1 - x0, d: 2 * y1 },
  ].sort((p, q) => depth(P, [p.x + p.w / 2, p.y + p.d / 2, 0]) - depth(P, [q.x + q.w / 2, q.y + q.d / 2, 0]));
  out.top.push(solid({ x: -x0, y: -FRAME.postY[0], w: 2 * x0, d: 2 * FRAME.postY[0], r: 1 }, TOP_Z + 1, 2, P, { tone: "mid" }));
  for (const bar of bars) out.top.push(solid(bar, TOP_Z, FRAME.barH, P));
  return out;
}

// ---------------------------------------------------------------- devices
function deviceSvg(dev, view) {
  const P = VIEWS[view], s = SIGN[view];
  const z0 = zOfU(dev.u), y0 = FRONT_Y - dev.d;
  const plan = { x: -W / 2, y: y0, w: W, d: dev.d };
  const body = [];
  if (dev.kind === "server") {
    body.push(solid(plan, z0, H1, P));
    // lid seam: a closed line inset on the top
    body.push(K.lineSvg(K.planOutline(K.insetPlan({ ...plan, r: 0.6 }, 3), z0 + H1, P), { tone: "faint" }));
  } else {
    const floor = dev.floor;
    const pieces = [{ plan, z: z0, h: floor }];
    if (dev.kind === "drawer") {
      pieces.push({ plan: { x: -71.5, y: y0, w: 0.8, d: dev.d - 3 }, z: z0, h: 6 });
      pieces.push({ plan: { x: 70.7, y: y0, w: 0.8, d: dev.d - 3 }, z: z0, h: 6 });
      pieces.push({ plan: { x: -W / 2, y: FRONT_Y - 2.8, w: W, d: 2.8 }, z: z0, h: H1 });
    } else {
      pieces.push({ plan: { x: -W / 2, y: y0, w: 0.8, d: dev.d }, z: z0, h: 5.6 });
      pieces.push({ plan: { x: W / 2 - 0.8, y: y0, w: 0.8, d: dev.d }, z: z0, h: 5.6 });
      pieces.push({ plan: { x: -0.4, y: y0, w: 0.8, d: dev.d }, z: z0 + floor, h: 0.8 });
      pieces.push({ plan: { x: -W / 2, y: FRONT_Y - 2.5, w: 6, d: 2.5 }, z: z0, h: H1 });
      pieces.push({ plan: { x: W / 2 - 6, y: FRONT_Y - 2.5, w: 6, d: 2.5 }, z: z0, h: H1 });
    }
    pieces.sort((a, b) => depth(P, [a.plan.x + a.plan.w / 2, a.plan.y + a.plan.d / 2, a.z]) - depth(P, [b.plan.x + b.plan.w / 2, b.plan.y + b.plan.d / 2, b.z]));
    // the front panel or ears go last in the front view, first in the rear view
    for (const pc of pieces) body.push(solid(pc.plan, pc.z, pc.h, P, { bevel: 0.2 }));
  }
  // panel art on the face this view sees
  const at = view === "front" ? [-W / 2, FRONT_Y, z0 + H1] : [W / 2, y0, z0 + H1];
  body.push(artOn(P, at, s, face(view, dev.id)));
  // removable face pieces (drive carriers, PSUs): body is filled in live when pulled
  for (const [id, sp] of Object.entries(PARTS[view] || {})) {
    if (sp.host !== dev.id || sp.kind !== "face") continue;
    const pat = [sp.s > 0 ? sp.x0 : sp.x1, sp.y0, sp.zt];
    body.push(`<g class="part" data-part="${id}" data-host="${dev.id}" data-tip="${id}"><g class="pbody"></g><g class="pface">${artOn(P, pat, s, face(view, "part-" + id))}</g></g>`);
  }
  // shelf items, far to near
  const items = ITEMS.filter((it) => it.host === dev.id)
    .map((it) => ({ ...it, zb: z0 + dev.floor }))
    .sort((a, b) => depth(P, [a.plan.x + a.plan.w / 2, a.plan.y + a.plan.d / 2, 0]) - depth(P, [b.plan.x + b.plan.w / 2, b.plan.y + b.plan.d / 2, 0]));
  for (const it of items) {
    const p = it.plan;
    const fat = view === "front" ? [p.x, p.y + p.d, it.zb + it.h] : [p.x + p.w, p.y, it.zb + it.h];
    body.push(`<g class="part up ${it.pal}" data-part="${it.id}" data-host="${dev.id}" data-tip="${it.id}">${solid({ ...p, r: 0.5 }, it.zb, it.h, P, { bevel: 0.3 })}${artOn(P, fat, s, face(view, "part-" + it.id))}</g>`);
  }
  return `<g class="dev ${dev.pal}" data-dev="${dev.id}">${body.join("")}</g>`;
}
function pduSvg(view) {
  const P = VIEWS[view];
  const plan = { x: PDU.x[0], y: PDU.y[0], w: PDU.x[1] - PDU.x[0], d: PDU.y[1] - PDU.y[0] };
  const art = artOn(P, [PDU.x[1], PDU.y[0], PDU.z[1]], -1, face(view, "pdu"));
  return `<g class="dev ${PDU.pal}" data-dev="pdu">${solid(plan, PDU.z[0], PDU.z[1] - PDU.z[0], P)}${art}</g>`;
}

// ---------------------------------------------------------------- views and anchors
function viewSvg(view) {
  const fr = frameParts(view);
  const devs = DEVICES.slice().sort((a, b) => a.u - b.u).map((d) => deviceSvg(d, view));
  const pdu = pduSvg(view);
  const label = view === "front" ? "Server rack, front view" : "Server rack, rear view";
  const hidden = view === "rear" ? " hidden" : "";
  return [
    `<svg id="svg-${view}" preserveAspectRatio="xMidYMid meet"${hidden} xmlns="http://www.w3.org/2000/svg" class="iso-svg view view-${view}" viewBox="0 0 700 820" role="img" aria-label="${label}">`,
    ...fr.base,
    `<g class="pal-frame frame frame-far">${fr.far.join("")}</g>`,
    view === "front" ? pdu : "",
    ...devs,
    view === "rear" ? pdu : "",
    `<g class="pal-frame frame frame-near">${fr.near.join("")}${fr.rail}</g>`,
    `<g class="pal-frame frame frame-top">${fr.top.join("")}</g>`,
    `</svg>`,
  ].join("");
}

function anchors() {
  const A = {};
  for (const d of DEVICES) {
    const z0 = zOfU(d.u), zc = z0 + H1 / 2 + 0;
    A[d.id] = {
      front: { edge: [W / 2, FRONT_Y - d.d / 2, z0 + 6.4], mid: [0, FRONT_Y, z0 + 6.4], z0, H: H1, y0: FRONT_Y, d: d.d },
      rear: { edge: [-W / 2, FRONT_Y - d.d / 2, z0 + 6.4], mid: [0, FRONT_Y - d.d, z0 + 6.4], z0, H: H1, y0: FRONT_Y - d.d, d: d.d },
    };
  }
  const pz = PDU.z[0], ph = PDU.z[1] - PDU.z[0];
  A.pdu = {
    front: { edge: [PDU.x[1], PDU.y[0], 188.8], z0: pz, H: ph, y0: PDU.y[0], d: PDU.y[1] - PDU.y[0] },
    rear: { edge: [PDU.x[1] - 8, PDU.y[0], 188.8], z0: pz, H: ph, y0: PDU.y[0], d: PDU.y[1] - PDU.y[0] },
  };
  A.rack = {
    front: { edge: [FRAME.postX[1], FRAME.postY[1] - 3, TOP_Z - 6], z0: BASE_Z, H: TOP_Z - BASE_Z, y0: 72, d: 150 },
    rear: { edge: [-FRAME.postX[1], -(FRAME.postY[1] - 3), TOP_Z - 6], z0: BASE_Z, H: TOP_Z - BASE_Z, y0: -72, d: 150 },
  };
  return A;
}

// ---------------------------------------------------------------- page
// parts.json lists every removable piece per view; shelf items not listed there get a default lift.
const SPEC = { front: { ...PARTS.front }, rear: { ...PARTS.rear } };
for (const view of ["front", "rear"])
  for (const it of ITEMS) SPEC[view][it.id] ??= { host: it.host, kind: "up", lift: it.h >= 6 ? 30 : 26 };
const V = { front: { P: VIEWS.front }, rear: { P: VIEWS.rear } };
const KC = { TOP_Z, W, U };
const data = `const M=${JSON.stringify(content)};const V=${JSON.stringify(V)};const SPEC=${JSON.stringify(SPEC)};const ANCH=${JSON.stringify(anchors())};const K=${JSON.stringify(KC)};`;
const kit = read("kit/iso-kit.mjs").replace(/^export /gm, "");
const page = read("src/shell.html")
  .replace("{{STYLE}}", () => K.ISO_CSS + read("src/style.css"))
  .replace("{{VIEWS}}", () => "   " + viewSvg("front") + viewSvg("rear"))
  // escape "</script" inside the inlined code so it cannot close the page's script tag
  .replace("{{SCRIPT}}", () => (kit + "\n" + data + "\n" + read("src/live.js")).replace(/<\/(script)/gi, "<\\/$1"));
const out = join(HERE, "server-rack.html");
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
