// Network Diagram app, version 1: draw, save, share, export.
//
// Hard rule (DIAGRAM_APP_SPEC.md, section 2): this file holds no rack plan. No expected addresses, VLANs,
// port assignments, routes or policies. Everything drawn comes from what the team typed. The only built-in
// facts are device kinds, the switch's port names and the firewall's interface names, which students
// already have on the reference pages.
"use strict";
(() => {
const SCHEMA = 1;
const KEY = "cyberhub-diagram";
const VB = { w: 1470, h: 760 };
const SW_PORTS = ["XG1","XG2","XG3","XG4","XG5","XG6","XG7","XG8","XG9","XG10","XG11","XG12","OOB"];
const FW_IFS = ["wan1", "internal", "dmz", "guest Wi-Fi"];
const SERVICES = ["ALL", "PING", "HTTP", "HTTPS", "SSH", "FTP", "DNS"];
const ACCESS = ["PING", "HTTPS", "SSH", "HTTP"];
const KINDS = {
  isp: "ISP router", firewall: "Firewall", switch: "Switch", hypervisor: "Hypervisor", nas: "NAS",
  pi: "Raspberry Pi", laptop: "Laptop", vm: "Virtual machine", generic: "Device",
};
const ENDPOINT = new Set(["hypervisor", "nas", "pi", "laptop", "vm", "generic"]);
const BOX_W = 250;
// Every rack has the same devices, so the layout is fixed. Teams add only laptops and virtual machines.
const FIXED = ["isp", "fw", "sw", "hv", "nas", "lap", "pi", "isplap", "guest"];
const removable = (d) => d.kind === "vm" || !FIXED.includes(d.id);

const $ = (id) => document.getElementById(id);
const svg = $("svg"), panel = $("panel"), listView = $("v-list");
const NS = "http://www.w3.org/2000/svg";

// ------------------------------------------------------------------ document
let uid = 0;
const newId = (p) => p + Date.now().toString(36) + (uid++).toString(36);
const ep = () => ({ address: "", mask: "", gateway: "", dhcp: false });
function blankDoc() {
  return {
    v: SCHEMA, meta: { company: "", updated: null },
    devices: [
      { id: "isp", kind: "isp", name: "ISP router", x: 30, y: 340, address: "", mask: "" },
      { id: "fw", kind: "firewall", name: "Firewall", x: 360, y: 340,
        interfaces: FW_IFS.map((n) => ({ name: n, address: "", mask: "", access: [], ...(n === "guest Wi-Fi" ? { ssid: "" } : {}) })),
        routes: [], vips: [], policies: [] },
      { id: "sw", kind: "switch", name: "Core switch", x: 740, y: 340, vlans: [], svis: [], routes: [],
        ports: SW_PORTS.map((n) => ({ name: n, mode: "", pvid: "", tagged: [], shutdown: false })), dhcpPools: [] },
      { id: "hv", kind: "hypervisor", name: "Hypervisor", x: 1200, y: 30, ...ep() },
      { id: "nas", kind: "nas", name: "NAS", x: 1200, y: 380, ...ep() },
      { id: "lap", kind: "laptop", name: "Team laptop (Data)", x: 1200, y: 510, ...ep() },
      { id: "pi", kind: "pi", name: "Vulnerable Pi", x: 1200, y: 640, ...ep() },
      { id: "isplap", kind: "laptop", name: "ISP-side laptop", x: 30, y: 600, ...ep() },
      { id: "guest", kind: "laptop", name: "Guest laptop", x: 360, y: 640, ...ep() },
    ],
    links: [],
  };
}
let doc = blankDoc();
const dev = (id) => doc.devices.find((d) => d.id === id);
const vmsOf = (id) => doc.devices.filter((d) => d.kind === "vm" && d.host === id);
const portsFor = (d) => d.kind === "switch" ? SW_PORTS : d.kind === "firewall" ? FW_IFS : d.kind === "isp" ? ["LAN"] : [];

// Bring an older or hand-edited document up to the current shape.
function normalize(x) {
  const d = blankDoc();
  if (!x || typeof x !== "object" || !Array.isArray(x.devices)) throw new Error("not a diagram");
  d.meta = { company: String(x.meta?.company ?? ""), updated: x.meta?.updated ?? null };
  d.devices = x.devices.filter((v) => v && KINDS[v.kind]).map((v) => {
    const o = { ...v, id: String(v.id || newId("d")), name: String(v.name ?? KINDS[v.kind]) };
    if (o.kind !== "vm") { o.x = +o.x || 40; o.y = +o.y || 40; }
    if (ENDPOINT.has(o.kind)) { for (const [k, val] of Object.entries(ep())) if (o[k] === undefined) o[k] = val; }
    if (o.kind === "vm" && o.vlanTag === undefined) o.vlanTag = "";
    if (o.kind === "switch") {
      for (const k of ["vlans", "svis", "routes", "dhcpPools"]) o[k] = Array.isArray(o[k]) ? o[k] : [];
      const have = new Map((o.ports || []).map((p) => [p.name, p]));
      o.ports = SW_PORTS.map((n) => ({ name: n, mode: "", pvid: "", tagged: [], shutdown: false, ...(have.get(n) || {}) }));
    }
    if (o.kind === "firewall") {
      for (const k of ["routes", "vips", "policies"]) o[k] = Array.isArray(o[k]) ? o[k] : [];
      const have = new Map((o.interfaces || []).map((p) => [p.name, p]));
      o.interfaces = FW_IFS.map((n) => ({ name: n, address: "", mask: "", access: [], ...(n === "guest Wi-Fi" ? { ssid: "" } : {}), ...(have.get(n) || {}) }));
    }
    if (o.kind === "isp") { o.address ??= ""; o.mask ??= ""; }
    return o;
  });
  const ids = new Set(d.devices.map((v) => v.id));
  d.links = (Array.isArray(x.links) ? x.links : []).filter((l) => l && ids.has(l.a?.device) && ids.has(l.b?.device))
    .map((l) => ({ id: String(l.id || newId("l")), a: { device: l.a.device, port: String(l.a.port || "") }, b: { device: l.b.device, port: String(l.b.port || "") } }));
  return d;
}

// ------------------------------------------------------------------ address helpers (format only, never values)
const isIP = (s) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s) && s.split(".").every((n) => +n <= 255);
function maskToPrefix(m) {
  m = String(m).trim().replace(/^\//, "");
  if (/^\d{1,2}$/.test(m) && +m <= 32) return String(+m);
  if (isIP(m)) {
    const bits = m.split(".").map((n) => (+n).toString(2).padStart(8, "0")).join("");
    if (/^1*0*$/.test(bits)) return String(bits.indexOf("0") === -1 ? 32 : bits.indexOf("0"));
  }
  return null;
}
const isCIDR = (s) => { const [a, p, ...r] = String(s).split("/"); return !r.length && isIP(a) && p !== undefined && maskToPrefix(p) !== null; };
const withPrefix = (a, m) => a ? a + (m ? "/" + m : "") : "";

// ------------------------------------------------------------------ history and saving
let hist = [], hi = -1, sharedJSON = null, saveFailed = false;
const snapshot = () => JSON.stringify(doc);
const contentOf = (j) => { try { const o = JSON.parse(j); delete o.meta.updated; return JSON.stringify(o); } catch { return j; } };
function commit() {
  const s = snapshot();
  if (hist[hi] === s) return;
  hist = hist.slice(0, hi + 1); hist.push(s);
  if (hist.length > 120) hist.shift();
  hi = hist.length - 1;
  doc.meta.updated = new Date().toISOString();
  save(); updateButtons();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(doc)); saveFailed = false; }
  catch { saveFailed = true; }
  const el = $("saved");
  el.classList.toggle("warn", saveFailed);
  el.textContent = saveFailed ? "Not saved: this browser blocks storage. Copy the share link to keep your work."
    : "Saved in this browser at " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function updateButtons() {
  $("b-undo").disabled = hi <= 0; $("b-redo").disabled = hi >= hist.length - 1;
  $("b-share").querySelector(".dot").hidden = sharedJSON === null ? !hasContent() : contentOf(sharedJSON) === contentOf(snapshot());
}
function restore(j) { doc = JSON.parse(j); doc.meta.updated = new Date().toISOString(); save(); if (sel && !findSel()) sel = null; renderAll(); updateButtons(); }
const undo = () => { if (hi > 0) restore(hist[--hi]); };
const redo = () => { if (hi < hist.length - 1) restore(hist[++hi]); };
function hasContent() {
  return doc.links.length > 0 || doc.devices.some((d) => d.address || d.gateway || d.svis?.length || d.vlans?.length ||
    d.interfaces?.some((i) => i.address) || d.kind === "vm");
}

// ------------------------------------------------------------------ selection
let sel = null; // {type:'dev'|'link', id}
const findSel = () => sel && (sel.type === "dev" ? dev(sel.id) : doc.links.find((l) => l.id === sel.id));
function select(s) { sel = s; renderSvg(); renderPanel(); }

// ------------------------------------------------------------------ drawing
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const text = (parent, x, y, cls, s, anchor) => { const t = el("text", { x, y, class: cls, "text-anchor": anchor }, parent); t.textContent = s; return t; };

function valueLines(d) {
  const L = [];
  if (d.kind === "isp") { if (d.address) L.push(withPrefix(d.address, d.mask)); }
  else if (d.kind === "firewall") { for (const i of d.interfaces) if (i.address) L.push(`${i.name} ${withPrefix(i.address, i.mask)}`); }
  else if (d.kind === "switch") {
    const s = d.svis.filter((v) => v.address || v.vlan);
    s.slice(0, 5).forEach((v) => L.push(`VLAN ${v.vlan || "?"} ${withPrefix(v.address, v.mask)}`.trim()));
    if (s.length > 5) L.push(`+${s.length - 5} more SVIs`);
    d.routes.filter((r) => r.dest).slice(0, 2).forEach((r) => L.push(`${r.dest} via ${r.nextHop || "?"}`));
    if (d.routes.length > 2) L.push(`+${d.routes.length - 2} more routes`);
  } else if (ENDPOINT.has(d.kind)) {
    if (d.address) L.push(withPrefix(d.address, d.mask)); else if (d.dhcp) L.push("DHCP");
    if (d.gateway) L.push("gw " + d.gateway);
  }
  return L;
}
const VM_H = 42;
function boxSize(d) {
  const lines = valueLines(d).length;
  let h = 42 + lines * 19 + (lines ? 8 : 0);
  if (d.kind === "hypervisor") h += vmsOf(d.id).length * (VM_H + 6) + (vmsOf(d.id).length ? 6 : 0);
  return { w: d.kind === "hypervisor" ? 290 : BOX_W, h: Math.max(h, 84) };
}
function edgePoint(d, tx, ty) {
  const { w, h } = boxSize(d), cx = d.x + w / 2, cy = d.y + h / 2, dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const s = Math.min(Math.abs((w / 2) / (dx || 1e-9)), Math.abs((h / 2) / (dy || 1e-9)));
  return [cx + dx * s, cy + dy * s];
}
function layout() {
  let y = 30;
  const col = [...["hv", "nas", "pi", "lap"].map(dev).filter(Boolean),
    ...doc.devices.filter((d) => d.kind !== "vm" && !FIXED.includes(d.id))];
  for (const d of col) { d.x = 1160; d.y = y; y += boxSize(d).h + 26; }
  const mid = 330, row = (id, x) => { const d = dev(id); if (d) { d.x = x; d.y = Math.round(mid - boxSize(d).h / 2); } };
  row("isp", 40); row("fw", 420); row("sw", 790);
  const low = (id, x) => { const d = dev(id); if (d) { d.x = x; d.y = 590; } };
  low("isplap", 40); low("guest", 420);
  VB.h = Math.max(760, y + 10);
  svg.setAttribute("viewBox", `0 0 ${VB.w} ${VB.h}`);
}
const center = (d) => { const { w, h } = boxSize(d); return [d.x + w / 2, d.y + h / 2]; };
function portLabel(d, port) {
  if (!port) return "";
  if (d.kind !== "switch") return port;
  const p = d.ports.find((q) => q.name === port);
  if (!p) return port;
  const bits = [port];
  if (p.mode === "access") bits.push("access" + (p.pvid ? " " + p.pvid : ""));
  if (p.mode === "trunk") bits.push("trunk", (p.pvid ? "U" + p.pvid : "") + (p.tagged.length ? " T" + p.tagged.join(",") : ""));
  if (p.shutdown) bits.push("shut");
  return bits.filter(Boolean).join(" ");
}
const isWifi = (l) => [l.a, l.b].some((e) => e.port === "guest Wi-Fi");

function drawInto(root, ui) {
  const gl = el("g", {}, root), gd = el("g", {}, root);
  const pairKey = (l) => [l.a.device, l.b.device].sort().join("|");
  const groups = new Map();
  for (const l of doc.links) { const k = pairKey(l); groups.set(k, [...(groups.get(k) || []), l]); }
  for (const l of doc.links) {
    const A = dev(l.a.device), B = dev(l.b.device);
    if (!A || !B) continue;
    const grp = groups.get(pairKey(l)), gi = grp.indexOf(l), off = (gi - (grp.length - 1) / 2) * 22;
    const [cax, cay] = center(A), [cbx, cby] = center(B);
    const L0 = Math.hypot(cbx - cax, cby - cay) || 1;
    // perpendicular, oriented the same way for both directions of a pair
    const flip = l.a.device < l.b.device ? 1 : -1;
    const px = (-(cby - cay) / L0) * off * flip, py = ((cbx - cax) / L0) * off * flip;
    const ea = edgePoint(A, cbx + px, cby + py), eb = edgePoint(B, cax + px, cay + py);
    const x1 = ea[0] + px, y1 = ea[1] + py, x2 = eb[0] + px, y2 = eb[1] + py;
    const g = el("g", { class: "lk" + (ui && sel?.type === "link" && sel.id === l.id ? " sel" : ""), "data-link": l.id }, gl);
    el("line", { x1, y1, x2, y2, class: "d-link" + (isWifi(l) ? " wifi" : "") }, g);
    if (ui) el("line", { x1, y1, x2, y2, class: "hit" }, g);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    // label side: the side away from the pair's other cables, else above (or right of) the line
    let nx = -uy, ny = ux;
    const want = off !== 0 ? Math.sign(off) * flip : (Math.abs(ux) > 0.4 ? (ny < 0 ? 1 : -1) : (nx > 0 ? 1 : -1));
    nx *= want; ny *= want;
    const label = (s2, x, y, dx, dy) => {
      if (!s2) return;
      const bx2 = x + dx * 10 + nx * 7, by2 = y + dy * 10 + ny * 7 + (ny > 0.3 ? 11 : ny < -0.3 ? -2 : 4);
      const anchor = Math.abs(dx) > 0.4 ? (dx > 0 ? "start" : "end") : (nx >= 0 ? "start" : "end");
      text(g, bx2, by2, "d-lab", s2, anchor);
    };
    const la = portLabel(A, l.a.port), lb = portLabel(B, l.b.port);
    label(la, x1, y1, ux, uy);
    // On a short cable the two labels would meet in the middle, so put the far one on the other side.
    if (la && lb && (la.length + lb.length) * 7.8 + 36 > len * Math.max(Math.abs(ux), 0.2)) { nx = -nx; ny = -ny; }
    label(lb, x2, y2, -ux, -uy);
  }
  for (const d of doc.devices) {
    if (d.kind === "vm") continue;
    const { w, h } = boxSize(d);
    const g = el("g", { class: "dev" + (ui && sel?.type === "dev" && sel.id === d.id ? " sel" : ""), "data-dev": d.id,
      transform: `translate(${d.x},${d.y})`, ...(ui ? { tabindex: 0, role: "button", "aria-label": `${d.name}, ${KINDS[d.kind]}` } : {}) }, gd);
    el("rect", { width: w, height: h, rx: 9, class: "d-box" + (d.kind === "isp" ? " fixed" : "") }, g);
    const lines = valueLines(d), alone = !lines.length && !(d.kind === "hypervisor" && vmsOf(d.id).length);
    text(g, w / 2, alone ? h / 2 + 6 : 28, "d-name", d.name || KINDS[d.kind], "middle");
    lines.forEach((s, i) => text(g, w / 2, 51 + i * 19, "d-val", s, "middle"));
    if (d.kind === "hypervisor") {
      let y = 42 + lines.length * 19 + (lines.length ? 8 : 0) + 2;
      for (const v of vmsOf(d.id)) {
        const vg = el("g", { class: "vm" + (ui && sel?.type === "dev" && sel.id === v.id ? " sel" : ""), "data-vm": v.id,
          ...(ui ? { tabindex: 0, role: "button", "aria-label": `${v.name}, virtual machine` } : {}) }, g);
        el("rect", { x: 12, y, width: w - 24, height: VM_H, rx: 6, class: "d-vm" }, vg);
        const det = [v.vlanTag ? "tag " + v.vlanTag : "", withPrefix(v.address, v.mask)].filter(Boolean).join("  ");
        text(vg, 22, y + 17, "d-vmname", v.name, "start");
        if (det) text(vg, 22, y + 34, "d-val", det, "start");
        y += VM_H + 6;
      }
    }
    if (ui) el("circle", { cx: w, cy: h / 2, r: 7, class: "handle", "data-handle": d.id }, g).appendChild(
      Object.assign(document.createElementNS(NS, "title"), { textContent: "Drag to another device to connect them" }));
  }
}
function renderSvg() {
  layout();
  svg.replaceChildren();
  drawInto(svg, true);
  if (!hasContent()) {
    const g = el("g", { class: "ghint" }, svg);
    ["Drag from the dot on a device's right edge to another device to record a cable.",
      "Select a device to enter its addresses, VLANs, routes and policies.",
      "Record only what you have built. Update it at the end of every lab."].forEach((s, i) => text(g, 40, VB.h - 82 + i * 24, "ghint", s));
  }
}

// ------------------------------------------------------------------ canvas interaction
const toSvg = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
let drag = null;
svg.addEventListener("pointerdown", (e) => {
  const h = e.target.closest("[data-handle]");
  if (h) {
    const d = dev(h.dataset.handle), [x, y] = center(d);
    drag = { mode: "link", from: d.id, line: el("line", { x1: x, y1: y, x2: x, y2: y, class: "temp" }, svg) };
    svg.setPointerCapture(e.pointerId); e.preventDefault(); return;
  }
  const vmEl = e.target.closest("[data-vm]");
  if (vmEl) { select({ type: "dev", id: vmEl.dataset.vm }); e.stopPropagation(); return; }
  const g = e.target.closest("[data-dev]");
  if (g) { select({ type: "dev", id: g.dataset.dev }); return; }
  const lk = e.target.closest("[data-link]");
  if (lk) { select({ type: "link", id: lk.dataset.link }); return; }
  if (sel) select(null);
});
svg.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const p = toSvg(e);
  {
    drag.line.setAttribute("x2", p.x); drag.line.setAttribute("y2", p.y);
    svg.querySelectorAll(".drop").forEach((n) => n.classList.remove("drop"));
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-dev]");
    if (over && over.dataset.dev !== drag.from) over.classList.add("drop");
  }
});
svg.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const dr = drag; drag = null;
  dr.line.remove();
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-dev]");
  if (over && over.dataset.dev !== dr.from) addLink(dr.from, over.dataset.dev); else renderSvg();
});
svg.addEventListener("keydown", (e) => {
  const g = e.target.closest?.("[data-vm]") || e.target.closest?.("[data-dev]");
  if (!g) return;
  const id = g.dataset.vm || g.dataset.dev;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault(); select({ type: "dev", id });
    svg.querySelector(g.dataset.vm ? `[data-vm="${id}"]` : `[data-dev="${id}"]`)?.focus(); return;
  }
});
function addLink(a, b) {
  const l = { id: newId("l"), a: { device: a, port: "" }, b: { device: b, port: "" } };
  doc.links.push(l); commit(); select({ type: "link", id: l.id });
  toast("Cable recorded. Choose the port on each end.");
}

// ------------------------------------------------------------------ form helpers
const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "class") n.className = v;
    else if (k === "value") n.value = v;
    else if (k in n && typeof v !== "string") n[k] = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
  return n;
};
// A text field bound to obj[key]. kind: 'ip' | 'cidr' | 'mask' | 'num' | 'list' | undefined
function inp(obj, key, { kind, ph, label, onAfter, size } = {}) {
  const val = kind === "list" ? (obj[key] || []).join(", ") : (obj[key] ?? "");
  const hint = h("span", { class: "hint", hidden: true });
  const check = (s) => {
    let bad = "";
    if (s && kind === "ip" && !isIP(s) && !isCIDR(s)) bad = "Not an IPv4 address";
    if (s && kind === "cidr" && !isCIDR(s) && !isIP(s)) bad = "Use an address with a prefix, like a.b.c.d/nn";
    if (s && kind === "mask" && maskToPrefix(s) === null) bad = "Use a prefix like /nn or a dotted mask";
    if (s && kind === "num" && !/^\d+$/.test(s)) bad = "Use a number";
    if (s && kind === "list" && !/^\s*\d+(\s*,\s*\d+)*\s*$/.test(s)) bad = "Use numbers separated by commas";
    hint.hidden = !bad; hint.textContent = bad;
  };
  const i = h("input", { value: val, placeholder: ph || "", "aria-label": label || key, size,
    spellcheck: false, autocomplete: "off",
    oninput: (e) => { set(e.target.value, false); check(e.target.value.trim()); renderSvg(); },
    onchange: (e) => {
      let s = e.target.value.trim();
      if (kind === "ip" && s.includes("/") && "mask" in obj) { const [a, p] = s.split("/"); if (isIP(a) && maskToPrefix(p) !== null) { obj.mask = maskToPrefix(p); s = a; } }
      if (kind === "mask" && maskToPrefix(s) !== null) s = maskToPrefix(s);
      set(s, true); e.target.value = kind === "list" ? (obj[key] || []).join(", ") : obj[key];
      check(s); commit(); renderSvg(); onAfter?.(); if (kind === "ip" && "mask" in obj) renderPanel();
    } });
  function set(s, final) {
    if (kind === "list") obj[key] = s.split(",").map((x) => x.trim()).filter(Boolean);
    else obj[key] = final ? s.trim() : s;
  }
  check(String(val));
  return h("span", { style: "display:block" }, i, hint);
}
const field = (label, input) => h("label", { class: "f" }, h("span", {}, label), input);
function chk(obj, key, label) {
  return h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!obj[key],
    onchange: (e) => { obj[key] = e.target.checked; commit(); renderSvg(); } }), label);
}
function multi(obj, key, options) {
  return h("div", { class: "checks" }, options.map((o) => h("label", { class: "check" }, h("input", { type: "checkbox",
    checked: (obj[key] || []).includes(o), onchange: (e) => {
      const s = new Set(obj[key] || []); e.target.checked ? s.add(o) : s.delete(o); obj[key] = options.filter((x) => s.has(x)); commit(); renderSvg();
    } }), o)));
}
function selectBox(obj, key, options, label, blank = "Not set") {
  return h("select", { "aria-label": label, onchange: (e) => { obj[key] = e.target.value; commit(); renderSvg(); } },
    h("option", { value: "" }, blank), options.map((o) => h("option", { value: o, selected: obj[key] === o }, o)));
}
// Editable rows. cols: [{key, label, kind, ph, w}]
function rows(arr, cols, make, label, rerender) {
  const t = h("table", { class: "t" },
    h("thead", {}, h("tr", {}, cols.map((c) => h("th", { style: c.w ? `width:${c.w}` : "" }, c.label)), h("th", {}))),
    h("tbody", {}, arr.map((r, i) => h("tr", {},
      cols.map((c) => h("td", {}, c.render ? c.render(r) : inp(r, c.key, { kind: c.kind, ph: c.ph, label: `${label} ${i + 1} ${c.label}` }))),
      h("td", {}, h("button", { class: "rowx small", title: "Remove row", "aria-label": `Remove ${label} ${i + 1}`,
        onclick: () => { arr.splice(i, 1); commit(); renderSvg(); rerender(); } }, "✕"))))));
  return [t, h("button", { class: "small", onclick: () => { arr.push(make()); commit(); rerender(); } }, "Add " + label)];
}

// ------------------------------------------------------------------ editors
function editor(d, rerender) {
  const out = [];
  out.push(field("Name", inp(d, "name", { label: "Name", ph: "Device name" })));
  if (ENDPOINT.has(d.kind)) {
    out.push(h("div", { class: "row2" }, field("Address", inp(d, "address", { kind: "ip", ph: "a.b.c.d", label: "Address" })),
      field("Mask", inp(d, "mask", { kind: "mask", ph: "/nn", label: "Mask" }))));
    out.push(field("Gateway", inp(d, "gateway", { kind: "ip", ph: "a.b.c.d", label: "Gateway" })));
    if (d.kind === "vm") out.push(field("VLAN tag (blank means untagged)", inp(d, "vlanTag", { kind: "num", ph: "none", label: "VLAN tag" })));
    out.push(chk(d, "dhcp", "Gets its address by DHCP"));
    if (d.kind === "vm") {
      const hosts = doc.devices.filter((x) => x.kind === "hypervisor");
      if (hosts.length > 1) out.push(field("Runs on", h("select", { onchange: (e) => { d.host = e.target.value; commit(); renderSvg(); } },
        hosts.map((x) => h("option", { value: x.id, selected: d.host === x.id }, x.name)))));
    }
    if (d.kind === "hypervisor") {
      out.push(h("div", { class: "sec" }, "Virtual machines"));
      const v = vmsOf(d.id);
      out.push(v.length ? h("p", {}, v.map((x, i) => [i ? ", " : "", h("a", { href: "#", onclick: (e) => { e.preventDefault(); select({ type: "dev", id: x.id }); } }, x.name)]))
        : h("p", { class: "muted" }, "None yet."));
      out.push(h("button", { class: "small", onclick: () => addVM(d.id) }, "Add a virtual machine"));
    }
  }
  if (d.kind === "isp") out.push(h("div", { class: "row2" }, field("Address", inp(d, "address", { kind: "ip", ph: "a.b.c.d", label: "Address" })),
    field("Mask", inp(d, "mask", { kind: "mask", ph: "/nn", label: "Mask" }))));
  if (d.kind === "switch") {
    out.push(h("div", { class: "sec" }, "VLANs"), ...rows(d.vlans, [{ key: "id", label: "ID", kind: "num", w: "30%" }, { key: "name", label: "Name" }], () => ({ id: "", name: "" }), "VLAN", rerender));
    out.push(h("div", { class: "sec" }, "VLAN interfaces (SVIs)"), ...rows(d.svis, [{ key: "vlan", label: "VLAN", kind: "num", w: "20%" }, { key: "address", label: "Address", kind: "ip", ph: "a.b.c.d" }, { key: "mask", label: "Mask", kind: "mask", w: "20%", ph: "/nn" }], () => ({ vlan: "", address: "", mask: "" }), "SVI", rerender));
    out.push(h("div", { class: "sec" }, "Static routes"), ...rows(d.routes, [{ key: "dest", label: "Destination", kind: "cidr", ph: "a.b.c.d/nn" }, { key: "nextHop", label: "Next hop", kind: "ip", ph: "a.b.c.d" }], () => ({ dest: "", nextHop: "" }), "route", rerender));
    out.push(h("div", { class: "sec" }, "Ports"));
    out.push(h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["Port", "Mode", "Untagged", "Tagged", "Off"].map((c) => h("th", {}, c)))),
      h("tbody", {}, d.ports.map((p) => h("tr", {}, h("td", { class: "n" }, p.name),
        h("td", {}, selectBox(p, "mode", ["access", "trunk"], `${p.name} mode`, "—")),
        h("td", {}, inp(p, "pvid", { kind: "num", label: `${p.name} untagged VLAN` })),
        h("td", {}, p.mode === "trunk" ? inp(p, "tagged", { kind: "list", label: `${p.name} tagged VLANs` }) : h("span", { class: "muted" }, "")),
        h("td", {}, h("input", { type: "checkbox", "aria-label": `${p.name} shut down`, checked: p.shutdown,
          onchange: (e) => { p.shutdown = e.target.checked; commit(); renderSvg(); } })))))));
    // mode changes show or hide the tagged column
    out.at(-1).querySelectorAll("select").forEach((s) => s.addEventListener("change", rerender));
    out.push(h("div", { class: "sec" }, "DHCP pools"), ...rows(d.dhcpPools, [{ key: "vlan", label: "VLAN", kind: "num", w: "16%" }, { key: "start", label: "Start", kind: "ip", ph: "a.b.c.d" }, { key: "end", label: "End", kind: "ip", ph: "a.b.c.d" }, { key: "router", label: "Router", kind: "ip", ph: "a.b.c.d" }], () => ({ vlan: "", start: "", end: "", router: "" }), "pool", rerender));
  }
  if (d.kind === "firewall") {
    out.push(h("div", { class: "sec" }, "Interfaces"));
    for (const i of d.interfaces) {
      out.push(h("div", { class: "card-b" }, h("h3", {}, i.name),
        h("div", { class: "row2" }, field("Address", inp(i, "address", { kind: "ip", ph: "a.b.c.d", label: `${i.name} address` })),
          field("Mask", inp(i, "mask", { kind: "mask", ph: "/nn", label: `${i.name} mask` }))),
        i.name === "guest Wi-Fi" ? field("SSID", inp(i, "ssid", { label: "SSID" })) : null,
        h("span", { class: "f" }, h("span", {}, "Administrative access")), multi(i, "access", ACCESS)));
    }
    out.push(h("div", { class: "sec" }, "Static routes"), ...rows(d.routes, [{ key: "dest", label: "Destination", kind: "cidr", ph: "a.b.c.d/nn" }, { key: "gateway", label: "Gateway", kind: "ip", ph: "a.b.c.d" },
      { key: "interface", label: "Interface", w: "28%", render: (r) => selectBox(r, "interface", FW_IFS, "Route interface", "—") }], () => ({ dest: "", gateway: "", interface: "" }), "route", rerender));
    out.push(h("div", { class: "sec" }, "Virtual IPs (port forwards)"), ...rows(d.vips, [{ key: "name", label: "Name" }, { key: "external", label: "External", kind: "ip", ph: "a.b.c.d" }, { key: "port", label: "Port", kind: "num", w: "16%" }, { key: "mapped", label: "Mapped to", kind: "ip", ph: "a.b.c.d" }], () => ({ name: "", external: "", port: "", mapped: "" }), "VIP", rerender));
    out.push(h("div", { class: "sec" }, "Policies"));
    d.policies.forEach((p, n) => {
      out.push(h("div", { class: "card-b" },
        h("h3", {}, h("span", {}, `Policy ${n + 1}`), h("button", { class: "small danger", onclick: () => { d.policies.splice(n, 1); commit(); renderSvg(); rerender(); } }, "Remove")),
        field("Name", inp(p, "name", { label: `Policy ${n + 1} name` })),
        h("div", { class: "row2" }, field("From", selectBox(p, "from", FW_IFS, "From interface", "—")), field("To", selectBox(p, "to", FW_IFS, "To interface", "—"))),
        h("div", { class: "row2" }, field("Source (blank is any)", inp(p, "source", { kind: "cidr", ph: "any", label: "Source" })), field("Destination (blank is any)", inp(p, "dest", { kind: "cidr", ph: "any", label: "Destination" }))),
        h("span", { class: "f" }, h("span", {}, "Services")), multi(p, "services", SERVICES),
        h("div", { class: "checks" }, chk(p, "nat", "NAT"), chk(p, "log", "Logging"))));
    });
    out.push(h("button", { class: "small", onclick: () => { d.policies.push({ name: "", from: "", to: "", source: "", dest: "", services: [], nat: false, log: false }); commit(); rerender(); } }, "Add policy"));
  }
  return out;
}
function linkEditor(l) {
  const A = dev(l.a.device), B = dev(l.b.device);
  const end = (e, D) => {
    const ports = portsFor(D);
    if (!ports.length) return h("p", {}, h("b", {}, D.name), h("span", { class: "muted" }, " (one network port)"));
    const used = new Set(doc.links.filter((x) => x !== l).flatMap((x) => [x.a, x.b]).filter((x) => x.device === D.id).map((x) => x.port));
    return field(D.name + (D.kind === "firewall" ? " interface" : " port"), h("select", { onchange: (ev) => { e.port = ev.target.value; commit(); renderSvg(); } },
      h("option", { value: "" }, "Choose…"), ports.map((p) => h("option", { value: p, selected: e.port === p }, p + (used.has(p) ? "  (already used)" : "")))));
  };
  return [end(l.a, A), end(l.b, B),
    h("p", { class: "muted" }, "A guest Wi-Fi link is drawn dashed. Switch port settings are edited on the switch.")];
}

function addVM(hostId) {
  const host = hostId || doc.devices.find((x) => x.kind === "hypervisor")?.id;
  if (!host) { toast("Add a hypervisor first."); return; }
  const v = { id: newId("vm"), kind: "vm", host, name: "New VM", ...ep(), vlanTag: "" };
  doc.devices.push(v); commit(); select({ type: "dev", id: v.id });
  setTimeout(() => panel.querySelector("input")?.select(), 0);
}
function addDevice(kind) {
  const d = { id: newId("d"), kind, name: "Laptop " + (doc.devices.filter((x) => x.kind === "laptop").length + 1), x: 0, y: 0, ...ep() };
  doc.devices.push(d); commit(); select({ type: "dev", id: d.id });
  setTimeout(() => panel.querySelector("input")?.select(), 0);
}
function removeDevice(d) {
  ask("Delete " + d.name + "?", [h("p", {}, d.kind === "hypervisor" && vmsOf(d.id).length ? "This also deletes its virtual machines and every cable connected to it." : "This also deletes every cable connected to it."), h("p", { class: "muted" }, "You can undo this.")],
    [["Cancel"], ["Delete", () => {
      const gone = new Set([d.id, ...vmsOf(d.id).map((v) => v.id)]);
      doc.devices = doc.devices.filter((x) => !gone.has(x.id));
      doc.links = doc.links.filter((l) => !gone.has(l.a.device) && !gone.has(l.b.device));
      commit(); select(null);
    }, "danger"]]);
}

function renderPanel() {
  const top = panel.scrollTop;
  const s = findSel();
  const kids = [];
  if (!s) {
    kids.push(h("h2", {}, "Your network diagram"),
      h("p", {}, "Record what your team has built on the rack: every cable, address, VLAN, route and policy. Update it at the end of every lab."),
      h("p", {}, "Select a device to edit it. To record a cable, drag from the dot on a device's right edge to another device."),
      h("div", { class: "sec" }, "Add"),
      h("div", { class: "add" }, h("button", { onclick: () => addVM() }, "Virtual machine"), h("button", { onclick: () => addDevice("laptop") }, "Laptop")),
      h("div", { class: "sec" }, "Summary"),
      h("p", { class: "muted" }, `${doc.devices.filter((d) => d.kind !== "vm").length} devices, ${doc.devices.filter((d) => d.kind === "vm").length} virtual machines, ${doc.links.length} cables.`));
  } else if (sel.type === "dev") {
    kids.push(h("h2", {}, s.name || KINDS[s.kind]), h("p", { class: "kind" }, KINDS[s.kind] + (s.kind === "vm" ? " on " + (dev(s.host)?.name || "?") : "")));
    kids.push(...editor(s, renderPanel));
    kids.push(h("div", { class: "foot" },
      s.kind !== "vm" ? h("button", { onclick: () => { const g = svg.querySelector(`[data-dev="${s.id}"] .handle`); toast("Drag from the dot on its right edge to another device, or use List view."); g?.focus?.(); } }, "How do I connect it?") : null,
      removable(s) ? h("button", { class: "danger", onclick: () => removeDevice(s) }, "Delete " + (s.kind === "vm" ? "VM" : "laptop")) : null));
  } else {
    kids.push(h("h2", {}, "Cable"), h("p", { class: "kind" }, `${dev(s.a.device)?.name} to ${dev(s.b.device)?.name}`));
    kids.push(...linkEditor(s));
    kids.push(h("div", { class: "foot" }, h("button", { class: "danger", onclick: () => { doc.links = doc.links.filter((x) => x !== s); commit(); select(null); } }, "Delete cable")));
  }
  panel.replaceChildren(...kids);
  panel.scrollTop = top;
}

// ------------------------------------------------------------------ list view
function renderList() {
  const top = listView.scrollTop;
  const cards = [];
  const real = doc.devices.filter((d) => d.kind !== "vm");
  for (const d of real) {
    cards.push(h("div", { class: "card-b" }, h("h3", {}, h("span", {}, d.name), h("span", { class: "muted", style: "font-weight:400;font-size:12px" }, KINDS[d.kind])), ...editor(d, renderList),
      removable(d) ? h("button", { class: "small danger", onclick: () => removeDevice(d) }, "Delete laptop") : null));
    for (const v of vmsOf(d.id)) cards.push(h("div", { class: "card-b" }, h("h3", {}, h("span", {}, v.name), h("span", { class: "muted", style: "font-weight:400;font-size:12px" }, "VM on " + d.name)), ...editor(v, renderList),
      h("button", { class: "small danger", onclick: () => removeDevice(v) }, "Delete VM")));
  }
  const opt = (sid, cur) => real.map((d) => h("option", { value: d.id, selected: cur === d.id }, d.name));
  const portSel = (end) => {
    const D = dev(end.device), ports = portsFor(D);
    if (!ports.length) return h("span", { class: "muted" }, "—");
    return h("select", { "aria-label": "Port", onchange: (e) => { end.port = e.target.value; commit(); renderSvg(); } }, h("option", { value: "" }, "Choose…"), ports.map((p) => h("option", { value: p, selected: end.port === p }, p)));
  };
  const devSel = (end) => h("select", { "aria-label": "Device", onchange: (e) => { end.device = e.target.value; end.port = ""; commit(); renderSvg(); renderList(); } }, opt(end.device, end.device));
  const links = h("div", { class: "card-b", style: "grid-column:1/-1" }, h("h3", {}, "Cables"),
    h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["Device", "Port", "Device", "Port", ""].map((c) => h("th", {}, c)))),
      h("tbody", {}, doc.links.map((l, i) => h("tr", {}, h("td", {}, devSel(l.a)), h("td", {}, portSel(l.a)), h("td", {}, devSel(l.b)), h("td", {}, portSel(l.b)),
        h("td", {}, h("button", { class: "rowx small", "aria-label": `Remove cable ${i + 1}`, onclick: () => { doc.links.splice(i, 1); commit(); renderSvg(); renderList(); } }, "✕")))))),
    h("button", { class: "small", onclick: () => { if (real.length < 2) return; doc.links.push({ id: newId("l"), a: { device: real[0].id, port: "" }, b: { device: real[1].id, port: "" } }); commit(); renderSvg(); renderList(); } }, "Add cable"));
  listView.replaceChildren(h("h2", {}, "Everything on the diagram"),
    h("p", { class: "muted" }, "The same information as the diagram, as forms. Changes here show on the diagram right away."),
    h("div", { class: "add" }, h("button", { class: "small", onclick: () => { addVM(); setView("list"); } }, "Add a virtual machine"), h("button", { class: "small", onclick: () => { addDevice("laptop"); setView("list"); } }, "Add a laptop")),
    h("div", { class: "grid" }, links, ...cards));
  listView.scrollTop = top;
}
let view = "canvas";
function setView(v) {
  view = v;
  $("t-canvas").setAttribute("aria-selected", v === "canvas"); $("t-list").setAttribute("aria-selected", v === "list");
  $("v-canvas").hidden = v !== "canvas"; panel.hidden = v !== "canvas"; listView.hidden = v !== "list";
  if (v === "list") renderList(); else { renderSvg(); renderPanel(); }
}
function renderAll() { $("company").value = doc.meta.company || ""; renderSvg(); if (view === "list") renderList(); else renderPanel(); }

// ------------------------------------------------------------------ share links
const b64u = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (s) => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function pipe(bytes, Stream, fmt) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Stream(fmt))).arrayBuffer()); }
async function encode(o) {
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  if (typeof CompressionStream === "function") { try { return "z." + b64u(await pipe(bytes, CompressionStream, "deflate-raw")); } catch {} }
  return "j." + b64u(bytes);
}
async function decode(s) {
  const [k, data] = [s.slice(0, 2), s.slice(2)];
  let bytes = unb64u(data);
  if (k === "z.") bytes = await pipe(bytes, DecompressionStream, "deflate-raw");
  else if (k !== "j.") throw new Error("unknown link");
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function share() {
  const url = location.origin + location.pathname + "#d=" + await encode(doc);
  sharedJSON = snapshot(); updateButtons();
  try { await navigator.clipboard.writeText(url); toast("Share link copied. Paste it on your Team Log cover page."); }
  catch {
    ask("Copy your share link", [h("p", {}, "Select the link and copy it, then paste it on your Team Log cover page."), h("textarea", { readonly: true, value: url, onfocus: (e) => e.target.select() })], [["Done"]]);
    setTimeout(() => $("m-body").querySelector("textarea")?.select(), 0);
  }
}

// ------------------------------------------------------------------ export
function contentBox() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of doc.devices) { if (d.kind === "vm") continue; const { w, h } = boxSize(d); x0 = Math.min(x0, d.x); y0 = Math.min(y0, d.y); x1 = Math.max(x1, d.x + w); y1 = Math.max(y1, d.y + h); }
  if (x0 === Infinity) return { x: 0, y: 0, w: VB.w, h: VB.h };
  const pad = 40; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(VB.w, x1 + pad); y1 = Math.min(VB.h, y1 + pad);
  return { x: x0, y: y0, w: Math.max(640, x1 - x0), h: y1 - y0 };
}
async function exportPng() {
  const B = contentBox(), W = B.w, HD = 70, H = B.h + HD;
  const out = document.createElementNS(NS, "svg");
  out.setAttribute("xmlns", NS); out.setAttribute("width", W); out.setAttribute("height", H); out.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const css = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
    .map((r) => r.cssText).filter((t) => /^\.d-/.test(t)).join("\n").replace(/var\(--navy\)/g, "#003366");
  el("style", {}, out).textContent = css;
  el("rect", { width: W, height: H, fill: "#ffffff" }, out);
  text(out, 30, 34, "d-title", (doc.meta.company || "Company") + " network diagram");
  text(out, 30, 54, "d-sub", "Updated " + new Date(doc.meta.updated || Date.now()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }));
  const g = el("g", { transform: `translate(${-B.x},${HD - B.y})` }, out);
  drawInto(g, false);
  const src = new XMLSerializer().serializeToString(out);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([src], { type: "image/svg+xml" }));
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement("canvas"); c.width = W * 2; c.height = H * 2;
    const ctx = c.getContext("2d"); ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    download(blob, fileBase() + ".png");
    toast("PNG downloaded. Paste it into your Team Log or SSP.");
  } catch { toast("This browser couldn't make the PNG. Try Print, then Save as PDF."); }
  finally { URL.revokeObjectURL(url); }
}
const fileBase = () => ((doc.meta.company || "network").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "network") + "-diagram-" + new Date().toISOString().slice(0, 10);
function download(blob, name) { const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

// ------------------------------------------------------------------ small UI
let toastT;
function toast(s) { const t = $("toast"); t.textContent = s; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3800); }
function ask(title, body, buttons) {
  const m = $("modal"), prev = document.activeElement;
  $("m-title").textContent = title; $("m-body").replaceChildren(...body);
  const close = () => { m.hidden = true; prev?.focus?.(); };
  $("m-acts").replaceChildren(...buttons.map(([label, fn, cls]) => h("button", { class: cls || (fn ? "primary" : ""), onclick: () => { close(); fn?.(); } }, label)));
  m.hidden = false; $("m-acts").lastChild?.focus();
  m.onkeydown = (e) => { if (e.key === "Escape") close(); };
}
function load(o, why) {
  doc = normalize(o); sel = null; hist = []; hi = -1; commit(); renderAll(); if (why) toast(why);
}

// ------------------------------------------------------------------ wiring
$("t-canvas").onclick = () => setView("canvas");
$("t-list").onclick = () => setView("list");
$("b-undo").onclick = undo; $("b-redo").onclick = redo;
$("b-share").onclick = share; $("b-png").onclick = exportPng;
const more = $("more");
$("b-more").onclick = (e) => { e.stopPropagation(); more.hidden = !more.hidden; $("b-more").setAttribute("aria-expanded", !more.hidden); };
document.addEventListener("click", () => { more.hidden = true; $("b-more").setAttribute("aria-expanded", false); });
$("b-json").onclick = () => download(new Blob([JSON.stringify(doc, null, 1)], { type: "application/json" }), fileBase() + ".json");
$("b-open").onclick = () => $("file").click();
$("file").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  try { const o = JSON.parse(await f.text()); ask("Open " + f.name + "?", [h("p", {}, "This replaces the diagram on screen. Copy its share link first if you want to keep it.")], [["Cancel"], ["Open", () => load(o, "Opened " + f.name)]]); }
  catch { toast("That file isn't a diagram backup."); }
};
$("b-print").onclick = () => { setView("canvas"); setTimeout(() => print(), 50); };
$("b-new").onclick = () => ask("Start a new diagram?", [h("p", {}, "This clears the diagram in this browser. Copy the share link first if you want to keep it."), h("p", { class: "muted" }, "You can undo this.")],
  [["Cancel"], ["Start new", () => { doc = blankDoc(); sel = null; sharedJSON = null; commit(); renderAll(); }, "danger"]]);
$("company").addEventListener("input", (e) => { doc.meta.company = e.target.value; });
$("company").addEventListener("change", commit);
document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input,textarea,select")) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); redo(); }
  if (e.key === "Escape" && sel) select(null);
});
window.addEventListener("hashchange", () => start());

async function start() {
  let local = null;
  try { const s = localStorage.getItem(KEY); if (s) local = normalize(JSON.parse(s)); } catch {}
  const m = location.hash.match(/^#d=(.+)$/);
  if (m) {
    let linked;
    try { linked = normalize(await decode(m[1])); } catch { history.replaceState(null, "", location.pathname + location.search); toast("That share link is incomplete or damaged."); }
    if (linked) {
      history.replaceState(null, "", location.pathname + location.search);
      sharedJSON = JSON.stringify(linked);
      const differs = local && contentOf(JSON.stringify(local)) !== contentOf(JSON.stringify(linked));
      const localHasWork = local && (local.links.length || local.devices.some((d) => d.address || d.svis?.length || d.interfaces?.some((i) => i.address) || d.kind === "vm"));
      if (differs && localHasWork) {
        doc = local; renderAll(); commit();
        ask("Which diagram do you want?", [h("p", {}, "This browser already holds a different diagram" + (local.meta.company ? ` (${local.meta.company})` : "") + "."),
          h("p", {}, "Opening the link replaces it. If you need the one in this browser, cancel and copy its share link first.")],
          [["Keep this browser's diagram", () => { sharedJSON = null; updateButtons(); }], ["Open the link", () => { load(linked, "Opened the shared diagram."); sharedJSON = snapshot(); updateButtons(); }]]);
        return;
      }
      load(linked, "Opened the shared diagram."); sharedJSON = snapshot(); updateButtons();
      return;
    }
  }
  doc = local || blankDoc(); sel = null; hist = []; hi = -1; commit(); renderAll();
}
start();
})();
