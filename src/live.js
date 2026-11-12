// ===== live: state, camera, power, take-apart, flows, attacks, tour, quiz =====
// DATA (M, V, SPEC, ANCH, K) is injected above this block by build.mjs.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const stage = $("#stage"), links = $("#links"), bubs = $("#bubbles"), tipEl = $("#tip");
const svgs = { front: $("#svg-front"), rear: $("#svg-rear") };
const DEVS = Object.fromEntries(M.devices.map((d) => [d.id, d]));
const PARTS = Object.fromEntries(M.parts.map((p) => [p.id, p]));
const OUT = Object.fromEntries(M.outside.map((o) => [o.id, o]));
const nameOf = (id) => (DEVS[id] ? DEVS[id].name : OUT[id] ? OUT[id].name : id);
const DEVICE_IDS = M.devices.map((d) => d.id);
const PULL = 66, SPREAD = 0;

const S = {
  view: "front", powered: false, t: 0, sel: null, exploded: false, labels: true, follow: false,
  cur: {}, tgt: {}, hold: {}, lit: {}, dim: new Set(), over: {}, battery: false,
  mode: "learn", run: null, tour: null, quiz: null, portZoom: false,
};
const UNUSED = new Set(["r420", "sw2", "aux"]);
const P = () => V[S.view].P;
const sg = () => (S.view === "front" ? 1 : -1);

// ---------- camera ----------
const cam = { cx: 350, cy: 410, w: 700 }, camT = { cx: 350, cy: 410, w: 700 };
const aspect = () => { const r = stage.getBoundingClientRect(); return Math.max(0.3, r.width / Math.max(1, r.height)); };
const sizeOf = () => ({ w: stage.clientWidth, h: stage.clientHeight });
function camTo(cx, cy, w, instant) {
  camT.cx = cx; camT.cy = cy; camT.w = w;
  if (instant || calm) Object.assign(cam, camT);
  kick();
}
function pts2box(points) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
const fitW = (b, pad) => Math.max(b.w * pad, b.h * pad * aspect());
const pullVec = (id, useTarget) => {
  if (S.view !== "front" || !DEVS[id] || id === "rack" || id === "pdu") return [0, 0];
  const a = useTarget ? (S.tgt[id] || 0) : (S.cur[id] || 0);
  return axisVector(P(), [0, PULL * a, SPREAD * ((parseInt(DEVS[id].u, 10) || 1) - 1) * a]);
};
function camAll(instant) {
  const p = P(), pts = [];
  for (const c of boxCorners({ x: -92, y: -88, w: 184, d: 176 }, 0, K.TOP_Z + 8)) pts.push(iso(c, p));
  const e = S.exploded || Object.keys(S.cur).some((k) => S.cur[k] > 0.05) ? 1 : 0;
  if (e && S.view === "front") for (const c of boxCorners({ x: -92, y: 60, w: 184, d: 10 }, 0, K.TOP_Z)) pts.push(iso([c[0], c[1] + 120, c[2]], p));
  const b = pts2box(pts);
  camTo(b.cx, b.cy, fitW(b, 1.1), instant);
}
function faceBox(id) {
  const a = ANCH[id] && ANCH[id][S.view];
  if (!a) return null;
  const p = P(), W2 = K.W / 2;
  const pts = [[-W2, a.y0, a.z0], [W2, a.y0, a.z0], [-W2, a.y0, a.z0 + a.H], [W2, a.y0, a.z0 + a.H]];
  if (id === "pdu" || id === "rack") { pts.length = 0; pts.push([a.edge[0], a.y0, a.z0], [a.edge[0], a.y0, a.z0 + a.H]); if (id === "rack") pts.push([-92, -88, 0], [92, 88, K.TOP_Z]); }
  const pv = pullVec(id, true);
  return pts2box(pts.map((q) => { const s = iso(q, p); return [s[0] + pv[0], s[1] + pv[1]]; }));
}
function camDev(id, ports, instant) {
  const b = faceBox(id);
  if (!b) return camAll(instant);
  if (id === "rack") return camAll(instant);
  const boost = DEVS[id] && DEVS[id].u && String(DEVS[id].u).length < 4 ? 1 : 1;
  let w = 470;
  if (ports) w = Math.max(120, w * 0.42);
  const pv = [0, 0];
  const cx = b.cx + (ports ? b.w * 0.18 : 70);
  camTo(cx, b.cy + (ports ? 0 : 40), w, instant);
}
function camNode(id) {
  if (DEVS[id]) camDev(id, false);
  else camAll();
}
function camTick(dt) {
  const k = calm ? 1 : 1 - Math.exp(-dt / 0.32);
  cam.cx += (camT.cx - cam.cx) * k; cam.cy += (camT.cy - cam.cy) * k; cam.w += (camT.w - cam.w) * k;
  if (Math.abs(camT.cx - cam.cx) < 0.05 && Math.abs(camT.cy - cam.cy) < 0.05 && Math.abs(camT.w - cam.w) < 0.1) Object.assign(cam, camT);
  const h = cam.w / aspect();
  const vb = `${(cam.cx - cam.w / 2).toFixed(2)} ${(cam.cy - h / 2).toFixed(2)} ${cam.w.toFixed(2)} ${h.toFixed(2)}`;
  svgs.front.setAttribute("viewBox", vb); svgs.rear.setAttribute("viewBox", vb);
}
const camSettled = () => cam.cx === camT.cx && cam.cy === camT.cy && cam.w === camT.w;

// ---------- device state ----------
function devState(id) {
  if (S.over[id] === "off") return "off";
  if (!S.powered) return "off";
  const st = M.power.find((p) => p.id === id);
  if (!st) return "on";
  if (S.t < st.at) return "off";
  if (S.t < st.at + st.dur) return "boot";
  return "on";
}
const POWER_END = Math.max(...M.power.map((p) => p.at + p.dur)) + 0.4;
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const PORT_ACTIVE = (dev, n) => hash(dev + ":" + n) % 5 < 3;

function ledOf(el) {
  const dev = el.dataset.dev, key = el.dataset.led, n = el.dataset.n;
  const st = devState(dev), lit = S.lit[dev], over = S.over[dev];
  if (st === "off") return key === "batt" && S.battery && dev === "ups" ? ["a", "slow"] : [null, null];
  const hit = lit === "hit", use = lit === "use";
  const boot = st === "boot";
  switch (key) {
    case "pwr": return boot ? ["g", "slow"] : ["g", null];
    case "sta": case "stat": case "sys": return hit ? ["a", "fast"] : boot ? ["g", "slow"] : ["g", null];
    case "alm": case "alarm": case "alert": case "over": case "repl": return hit && (key === "alm" || key === "alarm" || key === "alert") ? ["r", null] : [null, null];
    case "line": return S.battery ? [null, null] : ["g", null];
    case "batt": return S.battery ? ["a", "slow"] : [null, null];
    case "port": case "fg": case "sg": case "lan": case "lan2": {
      if (boot) return [null, null];
      const act = key === "port" ? PORT_ACTIVE(dev, n) : (parseInt(n || "0", 10) % 2 === 0 || key.startsWith("lan"));
      if (!act) return [null, null];
      return hit ? ["a", "fast"] : use ? ["g", "fast"] : ["g", null];
    }
    case "drv": { if (boot) return [null, null]; return hit ? ["a", "fast"] : use ? ["g", "fast"] : [parseInt(n || "0", 10) < 4 ? "g" : null, null]; }
    case "oob": return ["g", null];
    case "sel": return dev === "kvm" && use ? ["g", "fast"] : ["g", null];
    case "psu": return ["g", null];
    default: return [null, null];
  }
}
const ledSig = {};
function updateLeds(force) {
  const sig = {};
  for (const id of [...DEVICE_IDS, "pdu"]) sig[id] = devState(id) + "|" + (S.lit[id] || "") + "|" + (S.battery ? 1 : 0);
  for (const el of $$(".led")) {
    const id = el.dataset.dev;
    if (!force && ledSig[id] === sig[id]) continue;
    const [c, b] = ledOf(el);
    if (c) el.dataset.s = c; else delete el.dataset.s;
    if (b) el.dataset.blink = b === "slow" ? "slow" : ""; else delete el.dataset.blink;
    if (b === "fast") el.dataset.blink = "";
  }
  Object.assign(ledSig, sig);
}
const LEDNAME = { pwr: "Power", sta: "Status", stat: "Status", sys: "System", alert: "Alert", alm: "Alarm", alarm: "Alarm", port: "Port link / activity", drv: "Drive activity", batt: "On battery", line: "Line power", over: "Overload", repl: "Replace battery", lan: "LAN link", lan2: "LAN 2 link", oob: "Out-of-band port", usb: "USB", sel: "Selected KVM port", psu: "Power supply", sg: "Status", fg: "Port link / activity", ha: "HA" };
const LEDRE = { pwr: /power|pwr/i, sta: /sta|status/i, stat: /status/i, sys: /sys/i, alert: /alert|status/i, alm: /alarm/i, alarm: /alarm/i, port: /port|link/i, drv: /drive/i, batt: /battery/i, line: /line/i, over: /overload/i, repl: /replace/i, lan: /lan/i, sg: /port|power/i, fg: /port/i, psu: /power|psu/i };
function ledTip(el) {
  const dev = el.dataset.dev, key = el.dataset.led, d = DEVS[dev];
  const col = { g: "green", a: "amber", b: "blue", r: "red", w: "white" }[el.dataset.s];
  const now = col ? `${col}${el.hasAttribute("data-blink") ? ", blinking" : ", solid"}` : "off";
  const leg = d && d.leds.find((l) => LEDRE[key] && LEDRE[key].test(l[0]));
  return [`${d ? d.name : dev} · ${LEDNAME[key] || key} LED`, `Right now: ${now}.` + (leg ? ` Legend: ${leg[1]}.` : "")];
}

// ---------- take apart ----------
const regenCache = {};
function regen(view, id, m) {
  const sp = SPEC[view][id];
  if (!sp || sp.kind !== "face") return;
  const el = svgs[view].querySelector(`[data-part="${id}"] .pbody`);
  if (!el) return;
  const key = Math.round(m * 4);
  if (regenCache[view + id] === key) return;
  regenCache[view + id] = key;
  if (m < 0.3) { el.innerHTML = ""; return; }
  const plan = { x: sp.x0, y: sp.s > 0 ? sp.y0 : sp.y0 - m, w: sp.x1 - sp.x0, d: m, r: 0.3 };
  el.innerHTML = solidSvg(slabOf(plan, sp.zb, sp.zt - sp.zb, V[view].P, 2, 0.2), { tone: "mid", crease: "faint" });
}
function applyAnim() {
  for (const view of ["front", "rear"]) {
    const p = V[view].P, s = view === "front" ? 1 : -1;
    for (const id of DEVICE_IDS) {
      const el = svgs[view].querySelector(`.dev[data-dev="${id}"]`);
      if (!el) continue;
      const a = view === "front" ? S.cur[id] || 0 : 0;
      el.setAttribute("transform", a > 0.001 ? translateAlong(p, [0, PULL * a, SPREAD * ((parseInt(DEVS[id].u, 10) || 1) - 1) * a]) : "");
    }
    for (const id in SPEC[view]) {
      const sp = SPEC[view][id], a = S.cur[id] || 0;
      const el = svgs[view].querySelector(`[data-part="${id}"]`);
      if (!el) continue;
      if (sp.kind === "face") {
        el.querySelector(".pface").setAttribute("transform", a > 0.001 ? translateAlong(p, [0, s * sp.out * a, 0]) : "");
        regen(view, id, sp.out * a);
      } else el.setAttribute("transform", a > 0.001 ? translateAlong(p, [0, 0, sp.lift * a]) : "");
    }
  }
  svgs.front.parentNode.classList.toggle("exploded", Object.values(S.cur).some((v) => v > 0.05));
}
function setPull(id, v, delay = 0) { S.tgt[id] = v; S.hold[id] = performance.now() + delay; kick(); }
function toggleExplode(on) {
  S.exploded = on === undefined ? !S.exploded : on;
  const v = S.exploded ? 1 : 0;
  const devs = [...M.devices.filter((d) => d.u && d.u !== "rear rail" && DEVS[d.id] && d.id !== "rack")];
  devs.sort((a, b) => +b.num - +a.num);
  devs.forEach((d, i) => setPull(d.id, v, (S.exploded ? i * 70 : 400 + i * 40)));
  M.parts.forEach((p, i) => setPull(p.id, v, (S.exploded ? 500 + i * 22 : i * 14)));
  $("#b-explode").setAttribute("aria-pressed", S.exploded);
  $("#b-explode .lbl").textContent = S.exploded ? "Put back together" : "Take apart";
  setTimeout(() => camAll(), 350);
  refreshPanel();
}
function togglePart(id) {
  const on = !(S.tgt[id] > 0.5);
  setPull(id, on ? 1 : 0);
  if (DEVS[id] && !on) M.parts.filter((p) => p.host === id).forEach((p) => setPull(p.id, 0));
  S.exploded = Object.values(S.tgt).some((v) => v > 0.5);
  $("#b-explode").setAttribute("aria-pressed", S.exploded);
  $("#b-explode .lbl").textContent = S.exploded ? "Put back together" : "Take apart";
  refreshPanel();
}

// ---------- power ----------
let lastBoot = -1;
function power(on) {
  S.powered = on === undefined ? !S.powered : on;
  S.t = S.powered ? 0 : 0; lastBoot = -1;
  S.battery = false;
  $("#b-power").setAttribute("aria-pressed", S.powered);
  $("#b-power .lbl").textContent = S.powered ? "Power off" : "Power on";
  updateLeds(true); kick(); refreshPanel();
  if (S.powered) setStatus("Powering on: watch the lights come up from the UPS to the servers.");
  else setStatus("Everything is off. LEDs are dark.");
}
function powerInstant() { if (!S.powered) { S.powered = true; S.t = POWER_END + 1; $("#b-power").setAttribute("aria-pressed", true); $("#b-power .lbl").textContent = "Power off"; updateLeds(true); } }

// ---------- lighting, dimming ----------
function applyLit() {
  for (const view of ["front", "rear"]) {
    for (const el of $$(".dev", svgs[view])) {
      const id = el.dataset.dev;
      const l = S.lit[id] || (S.sel === id ? "sel" : "");
      if (l) el.dataset.lit = l; else delete el.dataset.lit;
      if (S.dim.size && DEVS[id] && S.dim.has(id)) el.setAttribute("data-dim", ""); else el.removeAttribute("data-dim");
      if (S.iso && id !== S.iso) el.setAttribute("data-away", ""); else el.removeAttribute("data-away");
    }
    svgs[view].classList.toggle("frame-sel", S.sel === "rack");
    svgs[view].classList.toggle("isolating", !!S.iso);
    for (const el of $$(".part", svgs[view])) {
      const p = PARTS[el.dataset.part];
      if (S.iso && p && p.host !== S.iso) el.setAttribute("data-away", ""); else el.removeAttribute("data-away");
    }
  }
  for (const b of $$(".bub")) { const id = b.dataset.dev; b.dataset.lit = S.lit[id] || (S.sel === id ? "sel" : ""); b.classList.toggle("dim", S.dim.has(id)); b.classList.toggle("unused", UNUSED.has(id)); b.classList.toggle("away", !!S.iso && id !== S.iso); }
  updateLeds(true);
}
function clearLit() { S.lit = {}; S.dim = new Set(); S.over = {}; S.battery = false; applyLit(); }

// ---------- bubbles ----------
const bubList = M.devices.map((d) => d.id);
function buildBubbles() {
  bubs.innerHTML = M.devices.map((d) => {
    const hasUse = d.uses.slice(0, 2).map((u) => `<li>${esc(u)}</li>`).join("");
    return `<div class="bub" data-dev="${d.id}"><button class="tag" type="button"><b>${d.id === "rack" ? "Rack" : d.id === "pdu" ? "Rear" : "U" + d.u}</b><span>${esc(d.name)}</span></button><div class="more"><div class="mk">${esc(d.make)} ${esc(d.model)}</div><p class="role">${esc(d.role)}</p><p>${esc(d.what)}</p><ul>${hasUse}</ul><div class="hint">Click to inspect and zoom</div></div></div>`;
  }).join("");
  links.innerHTML = `<g id="lk"></g>`;
  $$(".bub .tag", bubs).forEach((t) => t.addEventListener("click", () => select(t.parentNode.dataset.dev)));
}
function placeBubbles() {
  const { w, h } = sizeOf();
  const p = P(), vb = cam, hh = vb.w / aspect(), sc = w / vb.w;
  const narrow = w < 560;
  const bw = narrow ? 138 : 178;
  const items = [];
  for (const b of $$(".bub", bubs)) {
    const id = b.dataset.dev, a = ANCH[id] && ANCH[id][S.view];
    if (!a || !S.labels || S.quizHide) { b.style.display = "none"; continue; }
    const s = iso(a.edge, p), pv = pullVec(id);
    const x = (s[0] + pv[0] - (vb.cx - vb.w / 2)) * sc, y = (s[1] + pv[1] - (vb.cy - hh / 2)) * sc;
    const on = x > -10 && x < w + 10 && y > 6 && y < h - 6;
    const focus = (S.iso && id !== S.iso) || S.mode === "topo";
    b.style.display = on && !focus ? "" : "none";
    if (on && !focus) items.push({ b, id, x, y });
  }
  items.sort((a, b) => a.y - b.y);
  const gap = narrow ? 24 : 30;
  let last = -1e9;
  for (const it of items) { it.ty = Math.max(it.y, last + gap); last = it.ty; }
  const over = last - (h - 14);
  if (over > 0) { let next = h - 14; for (let i = items.length - 1; i >= 0; i--) { items[i].ty = Math.min(items[i].ty, next); next = items[i].ty - gap; } }
  let lines = "";
  for (const it of items) {
    const bx = w - bw - 8;
    it.b.style.transform = `translate(${bx}px,${it.ty - 12}px)`;
    it.b.style.width = bw + "px";
    const state = S.lit[it.id] || (S.sel === it.id ? "sel" : "");
    lines += `<path class="lk ${state}" d="M${bx} ${it.ty.toFixed(1)}L${(it.x + 7).toFixed(1)} ${it.y.toFixed(1)}L${it.x.toFixed(1)} ${it.y.toFixed(1)}"/><circle class="lkd ${state}" cx="${it.x.toFixed(1)}" cy="${it.y.toFixed(1)}" r="3.6"/>`;
  }
  $("#lk").innerHTML = lines;
}

// ---------- selection and panel ----------
function canPull(id) { return DEVS[id] && DEVS[id].u && id !== "rack" && id !== "pdu"; }
function isolate(id) {
  if (S.iso && S.iso !== id && canPull(S.iso)) setPull(S.iso, 0);
  S.iso = id && id !== "rack" ? id : null;
  if (!S.iso && S.view !== "front") setView("front");
  if (S.iso && canPull(S.iso)) setPull(S.iso, 1);
}
function select(id, opts = {}) {
  if (S.run) stopRun(true);
  if (S.view !== "front") setView("front");
  isolate(id);
  S.sel = id; S.portZoom = !!opts.ports;
  if (id && id !== "rack") camDev(id, !!opts.ports); else if (id === "rack") camAll();
  setTab("learn");
  applyLit(); refreshPanel();
}
function deselect() { if (S.view !== "front") setView("front"); isolate(null); S.sel = null; S.portZoom = false; applyLit(); camAll(); refreshPanel(); }
function stateText(id) {
  const s = devState(id), l = S.lit[id];
  if (UNUSED.has(id)) return "Not used";
  if (!DEVS[id].u || id === "rack") return s === "off" && !S.powered ? "Off" : "On";
  return ({ off: "Off", boot: "Booting…", on: l === "use" ? "On · in use" : l === "hit" ? "On · affected" : "On" })[s];
}
function legend(d) {
  if (!d.leds.length) return "";
  return `<h4>Indicator lights</h4><ul class="leg">${d.leds.map((l) => `<li><b>${esc(l[0])}</b> ${esc(l[1])}</li>`).join("")}</ul>`;
}
function partsOf(id) { return M.parts.filter((p) => p.host === id); }
function learnHtml() {
  const id = S.sel;
  if (!id) {
    const pg = S.page ? `<div class="pagebar"><b>Cyber Hub ${S.page.n}: ${esc(S.page.t)}</b><span>Highlighted: the devices this page uses.</span></div>` : "";
    return pg + `<div class="intro"><h3>Cyber Hub · Your lab rack</h3>
<p>This is the rack your team works on, drawn to match the room. Hover any label for a quick summary, or click a device to see it on its own and read its lights.</p>
<ul class="how"><li><b>Click a device</b> to slide it out and see it on its own.</li><li><b>Power on</b> to watch the boot order and the lights come up.</li><li><b>Traffic</b> shows how a request moves between devices.</li><li><b>Topology</b> shows how the networks connect.</li></ul>
<p class="note">Labels with a dashed grey outline are devices that stay in the rack but are not used in Cyber Hub. Cabling is left out on purpose: working out what connects where is part of the lab.</p></div>
`;
  }
  const d = DEVS[id], parts = partsOf(id);
  const canPull = d.u && d.id !== "rack" && d.id !== "pdu";
  return `<div class="dhead"><div><div class="u">${id === "rack" ? "Cabinet" : id === "pdu" ? "Rear rail" : "U" + d.u}</div><h3>${esc(d.name)}</h3><div class="mk">${esc(d.make)} · ${esc(d.model)}</div></div><div class="st" data-st="${UNUSED.has(id) ? "unused" : devState(id)}">${stateText(id)}</div></div>
<p class="role">${esc(d.role)}</p>
<div class="btns">
 
 ${S.iso === id && ANCH[id] && ANCH[id].rear ? `<button class="btn" data-act="flip">${S.view === "front" ? "See the back" : "See the front"}</button>` : ""}
 ${d.leds.length ? `<button class="btn" data-act="ports">Zoom to ports and lights</button>` : ""}
 ${TOPO.nodes.some((n) => n.dev === id) ? `<button class="btn" data-act="topo-show">Show it in the topology</button>` : ""}
 <button class="btn ghost" data-act="back">Back to whole rack</button></div>
<h4>What it is</h4><p>${esc(d.what)}</p><h4>How it works</h4><p>${esc(d.how)}</p>
<h4>What we use it for</h4><ul>${d.uses.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>${legend(d)}
${parts.length ? `<h4>Parts</h4><ul class="parts-info">${parts.map((p) => `<li><b>${esc(p.name)}</b> ${esc(p.what)}</li>`).join("")}</ul>` : ""}`;
}
function refreshPanel() {
  if (S.mode === "learn") $("#p-learn").innerHTML = learnHtml();
  if (S.mode === "parts") renderParts();
}
function setTab(t) {
  if (t !== "flow" && S.run) stopRun(true);
  S.mode = t;
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  $$(".pane").forEach((p) => p.hidden = p.id !== "p-" + t);
  $("#topo").hidden = t !== "topo";
  if (t === "topo") { if (S.iso) { isolate(null); S.sel = null; applyLit(); camAll(); } renderTopo(); topoPanel(null); }
  kick();
  if (t === "learn") refreshPanel();
  if (t === "parts") renderParts();
  if (t === "flow") renderFlowList();
  if (t === "attack") renderAttackList();
  if (t === "tour") renderTour();
  if (t === "quiz") renderQuiz();
}
function setStatus(t) { $("#status").textContent = t; }

// ---------- parts index ----------
function renderParts() {
  const q = ($("#q") && $("#q").value || "").toLowerCase();
  const rows = M.devices.map((d) => {
    const ps = partsOf(d.id).filter((p) => !q || (p.name + p.what + d.name).toLowerCase().includes(q));
    const show = !q || (d.name + d.model + d.make + d.role).toLowerCase().includes(q) || ps.length;
    if (!show) return "";
    return `<div class="grp"><button class="grow" data-sel="${d.id}"><b>${d.id === "rack" || d.id === "pdu" ? "" : "U" + d.u + " "}</b>${esc(d.name)}<span>${esc(d.make)} ${esc(d.model)}</span></button>${ps.map((p) => `<button class="prow" data-part="${p.id}" data-go="1" aria-pressed="${S.tgt[p.id] > 0.5}"><span class="pn">${esc(p.name)}</span><span class="pa">${S.tgt[p.id] > 0.5 ? "Put back" : "Take out"}</span></button>`).join("")}</div>`;
  }).join("");
  const total = M.devices.length - 1 + M.parts.length;
  $("#parts-list").innerHTML = rows || `<p class="note">Nothing matches.</p>`;
  $("#parts-count").textContent = `${M.devices.length - 1} devices, ${M.parts.length} removable pieces`;
}

// ---------- scenarios: flows and attacks ----------
function renderFlowList() {
  $("#p-flow .list").innerHTML = M.traffic.map((t) => `<button class="card" data-flow="${t.id}"><b>${esc(t.name)}</b><span>${esc(t.layer)}</span></button>`).join("");
  if (!S.run || S.run.type !== "flow") $("#flow-run").hidden = true;
}
function renderAttackList() {
  $("#p-attack .list").innerHTML = M.attacks.map((a) => `<button class="card ${a.kind}" data-attack="${a.id}"><i>${a.kind === "attack" ? "Attack" : "Outage"}</i><b>${esc(a.name)}</b><span>${esc(a.summary)}</span></button>`).join("");
  if (!S.run || S.run.type !== "attack") $("#attack-run").hidden = true;
}
let runTimer = 0;
function startRun(type, id) {
  stopRun(true);
  powerInstant();
  const sc = (type === "flow" ? M.traffic : M.attacks).find((x) => x.id === id);
  if (S.iso) { isolate(null); S.sel = null; }
  S.run = { type, sc, i: 0, auto: false };
  $("#" + type + "-run").hidden = false;
  $("#" + type + "-list").hidden = true;
  showStep();
  scheduleNext();
}
function scheduleNext() { clearTimeout(runTimer); if (S.run && S.run.auto) runTimer = setTimeout(() => stepRun(1, true), 4600); }
function stopRun(silent) {
  clearTimeout(runTimer); S.run = null;
  clearLit(); hideLane();
  for (const t of ["flow", "attack"]) { $("#" + t + "-run").hidden = true; $("#" + t + "-list").hidden = false; }
  if (!silent) { camAll(); setStatus("Back to normal."); }
}
function stepRun(d, auto) {
  if (!S.run) return;
  const n = S.run.type === "flow" ? S.run.sc.steps.length : S.run.sc.steps.length;
  const ni = S.run.i + d;
  if (ni >= n) { if (auto) { S.run.auto = false; S.run.done = true; showStep(); return; } return; }
  if (ni < 0) return;
  S.run.i = ni; S.run.auto = auto ? true : false; showStep(); if (auto) scheduleNext();
}
function showStep() {
  const r = S.run; if (!r) return;
  const sc = r.sc, i = r.i, n = sc.steps.length;
  clearLit();
  let focus = null, route = [];
  if (r.type === "flow") {
    route = sc.route;
    const idx = Math.round((i * (route.length - 1)) / Math.max(1, n - 1));
    const upto = route.slice(0, idx + 1);
    upto.forEach((id) => { if (DEVS[id]) S.lit[id] = "use"; });
    focus = route[idx];
    r.idx = idx;
    $("#flow-run .stepn").textContent = `Step ${i + 1} of ${n}`;
    $("#flow-run .stept").textContent = sc.steps[i];
    $("#flow-run h3").textContent = sc.name;
    $("#flow-run .why").textContent = i === n - 1 ? sc.why : "";
    $("#flow-run .layer").textContent = sc.layer;
    for (const id of DEVICE_IDS) if (!sc.route.includes(id)) S.dim.add(id);
    S.dim.delete("rack");
  } else {
    const st = sc.steps[i];
    route = st.route || [];
    for (const id of DEVICE_IDS) { if (id === "rack") continue; if (st.hit[id]) S.lit[id] = "hit"; else if (st.watch[id]) S.lit[id] = "watch"; else S.dim.add(id); }
    if (st.fx === "battery" || st.fx === "dead" || st.fx === "shutdown") S.battery = true;
    if (st.fx === "dead") Object.keys(st.hit).forEach((id) => (S.over[id] = "off"));
    if (st.fx === "shutdown") ["hv", "aux", "r420"].forEach((id) => (S.over[id] = "off"));
    focus = st.focus;
    r.idx = route.length ? Math.min(route.length - 1, Math.round((i * (route.length - 1)) / Math.max(1, n - 1))) : -1;
    $("#attack-run .stepn").textContent = `${sc.kind === "attack" ? "Attack" : "Outage"} · step ${i + 1} of ${n}`;
    $("#attack-run h3").textContent = sc.name;
    $("#attack-run .stept").innerHTML = `<b>${esc(st.title)}.</b> ${esc(st.text)}`;
    $("#attack-run .goal").textContent = sc.goal;
    const hitN = Object.keys(st.hit).map(nameOf), watchN = Object.keys(st.watch).map(nameOf);
    $("#attack-run .aff").innerHTML = (hitN.length ? `<div><span class="dot r"></span><b>Affected:</b> ${hitN.map(esc).join(", ")}</div>` : "") + (watchN.length ? `<div><span class="dot a"></span><b>At risk:</b> ${watchN.map(esc).join(", ")}</div>` : "") + (!hitN.length && !watchN.length ? `<div class="note">No device in the rack is touched yet.</div>` : "");
    $("#attack-run .def").hidden = i < n - 1;
    $("#attack-run .def ul").innerHTML = sc.defend.map((x) => `<li>${esc(x)}</li>`).join("");
  }
  showLane(route, r.idx, r.type);
  applyLit();
  if (focus && DEVS[focus] && S.follow) camDev(focus, false); else if (S.follow) camAll();
  const atEnd = i === n - 1;
  $("#" + r.type + "-run .prev").disabled = i === 0;
  $("#" + r.type + "-run .next").disabled = atEnd;
  $("#" + r.type + "-run .play").textContent = r.auto && !atEnd ? "Pause" : atEnd ? "Replay" : "Play";
  setStatus((r.type === "flow" ? "Flow: " : "Scenario: ") + sc.name + ` (${i + 1}/${n})`);
}
function showLane(route, idx, type) {
  const lane = $("#lane");
  if (!route.length) { lane.hidden = true; return; }
  lane.hidden = false;
  lane.className = "lane " + (type === "attack" ? "bad" : "good");
  const key = route.join(">");
  if (lane.dataset.key !== key) {
    lane.dataset.key = key;
    lane.innerHTML = `<div class="track"></div>${route.map((id, i) => `<div class="hop ${DEVS[id] ? "" : "ext"}"><span class="hd"></span><span class="hn">${esc(nameOf(id))}</span></div>`).join("")}<div class="bead"></div>`;
  }
  const hops = $$(".hop", lane);
  hops.forEach((h, i) => { h.classList.toggle("done", i <= idx); h.classList.toggle("now", i === idx); });
  const place = () => {
    const c = (h) => h.offsetLeft + h.offsetWidth / 2;
    const tr = $(".track", lane);
    tr.style.left = c(hops[0]) + "px"; tr.style.right = (lane.clientWidth - c(hops[hops.length - 1])) + "px";
    $(".bead", lane).style.left = c(hops[Math.max(0, idx)]) + "px";
  };
  place(); requestAnimationFrame(place);
}
function hideLane() { $("#lane").hidden = true; $("#lane").dataset.key = ""; }

// ---------- tour ----------
const TOUR = [
  { dev: "rack", t: "The rack", x: "Everything lives in this 24U cabinet. Notice the gaps between devices: the U numbers on the left rail skip on purpose." },
  { dev: "ups", t: "Start at the bottom: the UPS", x: "Power enters here. The UPS cleans the wall power and keeps everything alive through a short outage.", act: () => power(true) },
  { dev: "pdu", t: "The PDU", x: "From the UPS, power is shared out along the rear rail so every device has an outlet.", view: "rear" },
  { dev: "fw", t: "The firewall", x: "The main FortiGate sits between the lab network and the simulated Internet. Policies are checked top to bottom, first match wins.", view: "front" },
  { dev: "bk", t: "Backup appliances", x: "An SG-3100 and a FortiWiFi 60E share one tray, a second vendor to compare with." },
  { dev: "core", t: "The core switch", x: "VLANs, inter-VLAN routing and DHCP all live here. Most of your configuration time is spent on this box." },
  { dev: "sw2", t: "The second switch", x: "Same hardware, so a config you learn on one works on the other." },
  { dev: "nas", t: "Storage", x: "Four drives in RAID 5 hold the virtual machine disks, shared over NFS on the storage VLAN." },
  { dev: "hv", t: "The hypervisor", x: "Proxmox runs here. Watch what happens when a drive carrier is pulled.", act: () => setPull("hv-d2", 1) },
  { dev: "aux", t: "Auxiliary server", x: "A twin of the hypervisor host, used for extra practice machines.", act: () => setPull("hv-d2", 0) },
  { dev: "r420", t: "The legacy server", x: "An older Dell with an LCD panel. Compare it with the R440s." },
  { dev: "kvm", t: "The KVM console", x: "One screen, keyboard and mouse for every server. It works even when the network is down." },
  { dev: "drawer", t: "The component drawer", x: "Raspberry Pis, adapters and cables live here. Check it at the start and end of every shift.", act: () => { setPull("drawer", 1); } },
];
function tourStop(i, auto) {
  const T = S.tour; if (!T) return;
  T.i = Math.max(0, Math.min(TOUR.length - 1, i));
  const st = TOUR[T.i];
  const want = st.view || "front"; if (want !== S.view) setView(want);
  if (T.i === 0) { clearLit(); resetPulls(); }
  if (st.act) st.act();
  S.sel = st.dev === "rack" ? null : st.dev;
  S.lit = {}; S.lit[st.dev] = "use"; S.dim = new Set(DEVICE_IDS.filter((x) => x !== st.dev && x !== "rack"));
  applyLit();
  if (st.dev === "rack") camAll(); else camDev(st.dev, false);
  renderTour();
  clearTimeout(T.timer);
  if (T.auto && T.i < TOUR.length - 1) T.timer = setTimeout(() => tourStop(T.i + 1, true), 7000);
  else if (T.auto) T.auto = false;
}
function resetPulls() { Object.keys(S.tgt).forEach((k) => setPull(k, 0)); S.exploded = false; $("#b-explode").setAttribute("aria-pressed", false); $("#b-explode .lbl").textContent = "Take apart"; }
function renderTour() {
  const T = S.tour, el = $("#p-tour .body");
  if (!T) {
    el.innerHTML = `<p>A hands-free walk through the whole rack, bottom to top. The camera follows along. You can pause at any stop.</p><div class="btns"><button class="btn primary" data-act="tour-go">Start the tour</button></div><ol class="toc">${TOUR.map((s) => `<li>${esc(s.t)}</li>`).join("")}</ol>`;
    return;
  }
  const st = TOUR[T.i];
  el.innerHTML = `<div class="stepn">Stop ${T.i + 1} of ${TOUR.length}</div><h3>${esc(st.t)}</h3><p>${esc(st.x)}</p>${DEVS[st.dev] && st.dev !== "rack" ? `<p class="mk">${esc(DEVS[st.dev].make)} ${esc(DEVS[st.dev].model)}</p>` : ""}
<div class="btns"><button class="btn" data-act="tour-prev" ${T.i === 0 ? "disabled" : ""}>Back</button><button class="btn primary" data-act="tour-play">${T.auto ? "Pause" : "Play"}</button><button class="btn" data-act="tour-next" ${T.i === TOUR.length - 1 ? "disabled" : ""}>Next</button><button class="btn ghost" data-act="tour-end">End tour</button></div>`;
}
function tourEnd() { if (S.tour) { clearTimeout(S.tour.timer); S.tour = null; } clearLit(); S.sel = null; resetPulls(); camAll(); renderTour(); applyLit(); }

// ---------- quiz ----------
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const shuf = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function makeQuiz() {
  const real = M.devices.filter((d) => d.id !== "rack");
  const qs = [];
  for (const d of shuf(real).slice(0, 4)) qs.push({ type: "click", text: `Click the device that does this: “${d.role}”.`, ans: d.id, why: `${d.name} (${d.make} ${d.model}): ${d.what}` });
  for (const d of shuf(real).slice(0, 3)) {
    const opts = shuf([d, ...shuf(real.filter((x) => x.id !== d.id)).slice(0, 3)]);
    qs.push({ type: "mc", text: `Which description fits the ${d.name}?`, opts: opts.map((o) => o.role), ans: opts.findIndex((o) => o.id === d.id), why: d.how });
  }
  for (const a of shuf(M.attacks).slice(0, 3)) {
    const good = rnd(a.defend);
    const others = shuf(M.attacks.filter((x) => x.id !== a.id).flatMap((x) => x.defend)).filter((x) => !a.defend.includes(x)).slice(0, 3);
    const opts = shuf([good, ...others]);
    qs.push({ type: "mc", text: `Which is a sound defence for “${a.name}”?`, opts, ans: opts.indexOf(good), why: a.summary });
  }
  const pp = shuf(M.parts.filter((p) => !p.id.includes("-d") && !p.id.includes("psu") || true)).slice(0, 2);
  for (const p of pp) {
    const h = DEVS[p.host], opts = shuf([h, ...shuf(M.devices.filter((x) => x.id !== h.id && x.id !== "rack")).slice(0, 3)]);
    qs.push({ type: "mc", text: `The “${p.name}” belongs to which device?`, opts: opts.map((o) => o.name + " (" + o.model + ")"), ans: opts.findIndex((o) => o.id === h.id), why: p.what });
  }
  return shuf(qs);
}
function renderQuiz() {
  const Q = S.quiz, el = $("#p-quiz .body");
  if (!Q) { el.innerHTML = `<p>Test what you have learned. Some questions ask you to click a device in the rack. Labels are hidden while you play.</p><div class="btns"><button class="btn primary" data-act="quiz-go">Start quiz</button></div>`; S.quizHide = false; return; }
  if (Q.i >= Q.qs.length) { S.quizHide = false; el.innerHTML = `<h3>Score: ${Q.score} / ${Q.qs.length}</h3><p>${Q.score === Q.qs.length ? "Perfect. You are ready for the rack." : Q.score >= Q.qs.length * 0.7 ? "Nice work. Review the ones you missed in the Parts tab." : "Keep going: use the Tour tab, then try again."}</p><div class="btns"><button class="btn primary" data-act="quiz-go">Try again</button><button class="btn ghost" data-act="quiz-end">Close</button></div>`; return; }
  const q = Q.qs[Q.i];
  S.quizHide = q.type === "click";
  let h = `<div class="stepn">Question ${Q.i + 1} of ${Q.qs.length} · score ${Q.score}</div><h3 class="qt">${esc(q.text)}</h3>`;
  if (q.type === "mc") h += `<div class="opts">${q.opts.map((o, i) => `<button class="opt" data-opt="${i}" ${Q.done ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>`;
  else h += `<p class="note">Click a device in the rack.</p>`;
  if (Q.done) h += `<div class="fb ${Q.ok ? "ok" : "no"}"><b>${Q.ok ? "Correct." : "Not quite."}</b> ${esc(q.why)}</div><div class="btns"><button class="btn primary" data-act="quiz-next">${Q.i === Q.qs.length - 1 ? "See score" : "Next question"}</button></div>`;
  el.innerHTML = h;
  if (Q.done && q.type === "mc") $$(".opt", el).forEach((b, i) => { if (i === q.ans) b.classList.add("right"); else if (i === Q.pick) b.classList.add("wrong"); });
}
function quizAnswer(ok, pick) {
  const Q = S.quiz; if (!Q || Q.done) return;
  Q.done = true; Q.ok = ok; Q.pick = pick; if (ok) Q.score++;
  const q = Q.qs[Q.i];
  if (q.type === "click") { S.lit = {}; S.lit[q.ans] = ok ? "safe" : "hit"; S.quizHide = false; applyLit(); camDev(q.ans); }
  renderQuiz();
}

// ---------- tooltips ----------
let tipFor = null;
function showTip(ev) {
  const t = ev.target.closest && ev.target.closest(".led, .port, .part");
  if (!t) { tipEl.hidden = true; tipFor = null; return; }
  let title, body;
  if (t.classList.contains("led")) [title, body] = ledTip(t);
  else if (t.classList.contains("part")) { const p = PARTS[t.dataset.part]; title = p.name; body = p.what + " Click to " + (S.tgt[p.id] > 0.5 ? "put it back." : "take it out."); }
  else { title = t.dataset.tip; const led = t.querySelector(".led"); body = t.dataset.tipb + (led ? ` Light now: ${ledTip(led)[1].split(".")[0].replace("Right now: ", "")}.` : ""); }
  tipEl.innerHTML = `<b>${esc(title)}</b><span>${esc(body)}</span>`;
  tipEl.hidden = false;
  const r = stage.getBoundingClientRect();
  let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 16;
  const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  if (x + tw > r.width - 6) x = ev.clientX - r.left - tw - 14;
  if (y + th > r.height - 6) y = ev.clientY - r.top - th - 14;
  tipEl.style.transform = `translate(${Math.max(4, x)}px,${Math.max(4, y)}px)`;
}


// ---------- logical topology ----------
const TOPO = {
  nodes: [
    { id: "net", x: 400, y: 34, w: 170, t: "The internet", a: "past the ISP", info: "Everything outside your rack. In the lab, a laptop plugged into the ISP router stands in for it." },
    { id: "isp", x: 400, y: 112, w: 190, t: "ISP router", a: "10.R.200.1", dev: "fw", info: "The FortiGate 50E acts as a mock ISP. Your firewall's default route points here." },
    { id: "fw", x: 400, y: 222, w: 250, t: "Perimeter firewall", a: "wan1 .2 · internal .1 · dmz .1", dev: "bk", info: "The FortiWiFi 60E. Every packet between the internet, the DMZ, the guest network and your internal networks passes one of its policies." },
    { id: "guest", x: 110, y: 222, w: 170, t: "Guest laptops", a: "DHCP 10.R.50.x", info: "Guest Wi-Fi lives on the firewall itself. Its only policy allows HTTP to the web server, so guests cannot reach anything else." },
    { id: "web", x: 690, y: 300, w: 170, t: "Web server VM", a: "10.R.40.10", dev: "hv", info: "Your company homepage. It runs on the Proxmox host but lives in the DMZ, so its gateway is the firewall, not the switch." },
    { id: "ftp", x: 690, y: 362, w: 170, t: "FTP server VM", a: "10.R.40.11", dev: "hv", info: "Also a VM on the Proxmox host, also in the DMZ. In Cyber Hub 07 you find its login in plain text." },
    { id: "core", x: 400, y: 338, w: 250, t: "Core switch (Layer 3)", a: "SVIs .254 · routes between VLANs", dev: "core", info: "Routes between the Management, Data and Storage VLANs, hands out DHCP, and sends everything else to the firewall over the Transit VLAN." },
    { id: "pve", x: 130, y: 486, w: 170, t: "Proxmox host", a: "10.R.10.10", dev: "hv", info: "Managed on the Management VLAN at https://10.R.10.10:8006. Its VMs are tagged into other VLANs over the same cable." },
    { id: "scan", x: 130, y: 546, w: 170, t: "Scanner VM", a: "10.R.10.20", dev: "hv", info: "Your Greenbone scanner appliance, a VM on the Proxmox host. Its own firewall policy, Scanner_to_DMZ, lets it test every port in the DMZ." },
    { id: "admin", x: 130, y: 606, w: 170, t: "Admin laptop", a: "10.R.10.5", info: "A laptop on the Management VLAN, for managing infrastructure." },
    { id: "lap", x: 400, y: 486, w: 170, t: "Team laptops", a: "DHCP .100 to .199", info: "Your laptops on the Data VLAN. Their gateway is the switch at 10.R.20.254." },
    { id: "vpi", x: 400, y: 546, w: 170, t: "Vulnerable Pi", a: "DHCP on Data", dev: "drawer", info: "The Pi your team builds in Cyber Hub 08, on the Data VLAN where another team will scan it." },
    { id: "nas", x: 670, y: 516, w: 170, t: "Storage NAS", a: "10.R.30.10", dev: "nas", info: "Serves VM disks to the Proxmox host over NFS, on its own VLAN so heavy storage traffic stays separate." },
  ],
  zones: [
    { x: 15, y: 150, w: 190, h: 108, c: "#8a5a00", f: "#fff7e6", l: "Guest Wi-Fi", s: "10.R.50.0/24" },
    { x: 590, y: 238, w: 200, h: 160, c: "#a8332f", f: "#fdeeee", l: "DMZ · VLAN 40", s: "10.R.40.0/24" },
    { x: 30, y: 420, w: 200, h: 232, c: "#2f5fb0", f: "#edf3fc", l: "Management · VLAN 10", s: "10.R.10.0/24" },
    { x: 300, y: 420, w: 200, h: 172, c: "#1d7a4a", f: "#ecf7f0", l: "Data · VLAN 20", s: "10.R.20.0/24" },
    { x: 570, y: 448, w: 200, h: 106, c: "#6b4bb0", f: "#f3effb", l: "Storage · VLAN 30", s: "10.R.30.0/24" },
  ],
  links: [
    ["net", "isp", ""], ["isp", "fw", "ISP · 10.R.200.0/24"], ["fw", "guest", "", "wifi"],
    ["fw", "web", ""], ["fw", "core", "Transit · VLAN 100 · 10.R.100.0/24"],
    ["core", "pve", ""], ["core", "lap", ""], ["core", "nas", ""],
  ],
  policy: {
    "net-isp": { t: "Internet to ISP router", p: ["Outside your control. Nothing from here gets into your network unless the firewall allows it."] },
    "isp-fw": { t: "ISP router to firewall (wan1)", p: ["Out: Outbound_General_Access (HTTP, HTTPS, DNS) and Outbound_Ping, both with NAT.", "In: only the three VIPs, through Allow_Inbound_Services, with NAT off.", "Everything else: blocked by the firewall's implicit deny."] },
    "fw-guest": { t: "Firewall to guest Wi-Fi", p: ["Guest_to_DMZ_Web allows HTTP to the web server.", "Nothing else from guests is allowed, so they never see your internal networks."] },
    "fw-web": { t: "Firewall to the DMZ", p: ["Internal_to_DMZ allows HTTP, SSH and FTP from the Data and Management VLANs.", "Scanner_to_DMZ lets the scanner VM, and only it, test every port.", "In Cyber Hub 09, a temporary Assessor_to_DMZ policy does the same for the visiting assessors' appliance.", "Allow_Inbound_Services allows the VIPs from the internet side.", "DMZ to internal: no policy at all, so a broken-into server cannot reach inside."] },
    "fw-core": { t: "Transit link (VLAN 100)", p: ["Routing only, no NAT. Internal traffic going to the DMZ or the internet crosses here and is checked by the firewall.", "The firewall's static routes send replies back through the switch at 10.R.100.254."] },
    "core-pve": { t: "Switch to the Management VLAN", p: ["The switch routes between internal VLANs itself, so the firewall never sees this traffic.", "That is fast, but there is no firewall policy between your internal networks."] },
    "core-lap": { t: "Switch to the Data VLAN", p: ["Laptops get addresses from the switch's DHCP pool and use 10.R.20.254 as their gateway.", "Traffic to other internal VLANs is routed by the switch, not the firewall."] },
    "core-nas": { t: "Switch to the Storage VLAN", p: ["The Proxmox host reaches the NAS through the switch.", "Keeping storage on its own VLAN stops heavy disk traffic slowing everything else."] },
  },
  stops: [
    { t: "A laptop gets a 169.254.x.x address", s: [
      { n: "lap", ok: true, x: "The laptop sends a DHCP request, asking for an address." },
      { n: "core", ok: false, x: "No answer comes back. Check that the laptop's port is in the Data VLAN, and that the Data VLAN has a DHCP pool." } ] },
    { t: "A laptop pings its gateway but not other VLANs", s: [
      { n: "lap", ok: true, x: "A ping to 10.R.20.254 works, so the cable, VLAN and address are fine." },
      { n: "lap", ok: false, x: "Traffic for other networks never leaves the laptop. Check the laptop's default gateway." } ] },
    { t: "VLANs reach each other, but not the firewall", s: [
      { n: "lap", ok: true, x: "The laptop sends traffic to its gateway." },
      { n: "core", ok: true, x: "The switch routes between your VLANs, so internal traffic works." },
      { n: "fw", ok: false, x: "Nothing reaches the firewall, or replies never return. Check the switch's default route to 10.R.100.1, and the firewall's static routes back." } ] },
    { t: "A laptop cannot open the DMZ web page", s: [
      { n: "lap", ok: true, x: "The laptop asks for http://10.R.40.10." },
      { n: "core", ok: true, x: "The switch has no DMZ address, so it sends the request to the firewall." },
      { n: "fw", ok: false, x: "The firewall drops it. Check that Internal_to_DMZ allows HTTP from the Data VLAN." } ] },
    { t: "Proxmox works, but the web VM cannot be reached", s: [
      { n: "lap", ok: true, x: "The laptop asks for the web page." },
      { n: "core", ok: true, x: "The switch forwards it to the firewall." },
      { n: "fw", ok: true, x: "The policy allows it, and the firewall sends it out of its DMZ port." },
      { n: "web", ok: false, x: "The VM never answers. Check its VLAN tag (40), that VLAN 40 is tagged on XG3, and that vmbr0 is VLAN-aware." } ] },
    { t: "Outside visitors cannot open the web page", s: [
      { n: "net", ok: true, x: "A visitor asks for http://10.R.200.2, the firewall's WAN address." },
      { n: "isp", ok: true, x: "The ISP router delivers it to the firewall." },
      { n: "fw", ok: false, x: "The firewall drops it. Check that VIP-HTTP maps to 10.R.40.10 and that Allow_Inbound_Services allows it, with NAT off." } ] },
  ],
};
const TQ = { mode: "devices", stop: null, step: 0 };
function renderTopo() {
  const N = Object.fromEntries(TOPO.nodes.map((n) => [n.id, n]));
  const H = 26;
  const edge = (a, b) => [a.x, a.y + (b.y > a.y ? H : b.y < a.y ? -H : 0), b.x, b.y + (a.y > b.y ? H : a.y < b.y ? -H : 0)];
  const lk = TOPO.links.map(([a, b, l, k]) => {
    const A = N[a], B = N[b];
    let [x1, y1, x2, y2] = edge(A, B);
    if (A.y === B.y) { x1 = A.x + (B.x > A.x ? A.w / 2 : -A.w / 2); x2 = B.x + (A.x > B.x ? B.w / 2 : -B.w / 2); y1 = y2 = A.y; }
    if (b === "web") { x1 = A.x + A.w / 2; y1 = A.y; x2 = 590; y2 = 318; }
    const ZT = { pve: 420, lap: 420, nas: 448 };
    if (a === "core" && ZT[b]) y2 = ZT[b];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const path = Math.abs(x1 - x2) > 4 && A.y !== B.y && b !== "web" ? `M${x1},${y1} V${my} H${x2} V${y2}` : `M${x1},${y1} L${x2},${y2}`;
    return `<g class="link" data-link="${a}-${b}"><path class="lk${k ? " " + k : ""}" d="${path}"/><path class="lkh" d="${path}"/></g>${l ? `<text class="ll" x="${x1 - 10}" y="${my + 4}" text-anchor="end">${l}</text>` : ""}`;
  }).join("");
  const zs = TOPO.zones.map((z) => `<g class="zone"><rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="10" fill="${z.f}" stroke="${z.c}"/><text class="zl" x="${z.x + 10}" y="${z.y + 17}" fill="${z.c}">${z.l}</text><text class="zs" x="${z.x + 10}" y="${z.y + 31}" fill="${z.c}">${z.s}</text></g>`).join("");
  const ns = TOPO.nodes.map((n) => `<g class="node" data-node="${n.id}" tabindex="0" role="button" aria-label="${esc(n.t)}, ${esc(n.a)}"><rect x="${n.x - n.w / 2}" y="${n.y - H}" width="${n.w}" height="${H * 2 - 8}" rx="8"/><text class="nt" x="${n.x}" y="${n.y - 6}" text-anchor="middle">${esc(n.t)}</text><text class="na" x="${n.x}" y="${n.y + 11}" text-anchor="middle">${esc(n.a)}</text></g>`).join("");
  $("#topo").innerHTML = `<svg viewBox="0 0 800 670" role="img" aria-label="Logical topology of your rack's network" data-mode="${TQ.mode}">${zs}${lk}${ns}</svg>`;
}
function topoMark(nodes, cls, links) {
  $$("#topo .node").forEach((g) => { g.classList.remove("on", "ok", "bad"); });
  $$("#topo .link").forEach((g) => g.classList.remove("on"));
  for (const [id, c] of nodes) { const g = $(`#topo .node[data-node="${id}"]`); if (g) g.classList.add(c); }
  for (const l of links || []) { const g = $(`#topo .link[data-link="${l}"]`); if (g) g.classList.add("on"); }
}
function topoModes() {
  const m = [["devices", "Devices"], ["policies", "Policies"], ["stop", "Where does it stop?"]];
  return `<div class="tmodes" role="group" aria-label="Topology mode">${m.map(([k, l]) => `<button class="btn${TQ.mode === k ? " primary" : ""}" data-tmode="${k}">${l}</button>`).join("")}</div>`;
}
function linkBetween(a, b) { const l = TOPO.links.find(([x, y]) => (x === a && y === b) || (x === b && y === a)); return l ? l[0] + "-" + l[1] : null; }
function topoPanel(id) {
  const head = `<div class="intro"><h3>Logical topology</h3><p>How your rack's networks connect, regardless of which cable goes where. Replace R with your rack number.</p></div>${topoModes()}`;
  let body = "";
  if (TQ.mode === "devices") {
    const n = TOPO.nodes.find((x) => x.id === id);
    topoMark(n ? [[id, "on"]] : [], "on");
    body = n ? `<div class="dhead"><div><h3>${esc(n.t)}</h3><div class="mk">${esc(n.a)}</div></div></div><p>${esc(n.info)}</p>${n.dev ? `<div class="btns"><button class="btn" data-sel="${n.dev}">Show it in the rack</button></div>` : ""}` : `<p class="note">Click any device to see its role.</p>`;
  } else if (TQ.mode === "policies") {
    const L = id && TOPO.policy[id];
    topoMark(L ? id.split("-").map((x) => [x, "on"]) : [], "on", L ? [id] : []);
    body = L ? `<h3>${esc(L.t)}</h3><ul>${L.p.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="note">Click any line between two devices to see which rules decide the traffic on it.</p>`;
  } else if (TQ.mode === "stop") {
    if (!TQ.stop) {
      topoMark([], "on");
      body = `<p class="note">Pick a symptom. Step through it to see where the traffic stops and what to check.</p><div class="list">${TOPO.stops.map((s, i) => `<button class="item" data-stop="${i}"><b>${esc(s.t)}</b></button>`).join("")}</div>`;
    } else {
      const sc = TOPO.stops[TQ.stop - 1], st = sc.s[TQ.step];
      const seen = sc.s.slice(0, TQ.step + 1);
      const marks = seen.map((x, i) => [x.n, i === TQ.step ? (x.ok ? "ok" : "bad") : "ok"]);
      const links = []; for (let i = 1; i < seen.length; i++) { const l = linkBetween(seen[i - 1].n, seen[i].n); if (l) links.push(l); }
      topoMark(marks, "", links);
      body = `<div class="stepn">Step ${TQ.step + 1} of ${sc.s.length}</div><h3>${esc(sc.t)}</h3><p class="${st.ok ? "" : "fault"}">${st.ok ? "" : "<b>Stops here.</b> "}${esc(st.x)}</p><div class="btns"><button class="btn" data-stopstep="-1"${TQ.step ? "" : " disabled"}>Back</button><button class="btn primary" data-stopstep="1"${TQ.step < sc.s.length - 1 ? "" : " disabled"}>Next</button><button class="btn ghost" data-stopclose="1">Close</button></div>`;
    }
  }
  $("#p-topo").innerHTML = head + body;
}

// ---------- view, theme ----------
function setView(v) {
  S.view = v;
  svgs.front.toggleAttribute("hidden", v !== "front"); svgs.rear.toggleAttribute("hidden", v !== "rear");
  $$("[data-view]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === v));
  applyAnim(); applyLit();
  if (S.sel && S.sel !== "rack") camDev(S.sel, S.portZoom, true); else camAll(true);
  kick();
}
function setTheme(t) { document.body.dataset.theme = t; try { localStorage.setItem("rack-theme", t); } catch (e) {} $("#b-theme .lbl").textContent = t === "dark" ? "Light" : "Dark"; }

// ---------- loop ----------
let raf = 0, last = 0, visible = true;
function kick() { if (!raf && visible) { last = 0; raf = requestAnimationFrame(tick); } }
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60; last = now;
  let busy = !camSettled();
  if (S.powered && S.t < POWER_END) {
    S.t += dt; busy = true;
    const idx = M.power.reduce((b, p, i) => (S.t >= p.at ? i : b), -1);
    if (idx !== lastBoot) { lastBoot = idx; if (idx >= 0 && S.follow && !S.run && !S.tour) { const id = M.power[idx].id; if (DEVS[id]) camDev(id, false); setStatus(M.power[idx].note + "."); } if (idx === M.power.length - 1) setTimeout(() => { if (!S.run && !S.tour && !S.iso) camAll(); }, 1400); }
    updateLeds(true);
  } else if (S.powered && S.t >= POWER_END && lastBoot !== 99) { lastBoot = 99; updateLeds(true); refreshPanel(); }
  let moved = false;
  const nowMs = performance.now();
  for (const id in S.tgt) {
    if (nowMs < (S.hold[id] || 0)) { busy = true; continue; }
    const c = S.cur[id] || 0, t = S.tgt[id];
    if (c === t) continue;
    const n = c + (t - c) * (calm ? 1 : 1 - Math.exp(-dt / 0.2));
    S.cur[id] = Math.abs(t - n) < 0.002 ? t : n; moved = true; busy = true;
  }
  if (moved) applyAnim();
  camTick(dt);
  placeBubbles();
  raf = busy || S.run || S.tour ? requestAnimationFrame(tick) : 0;
}
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) kick(); }).observe(stage);
addEventListener("resize", () => { kick(); camAll(true); });

// ---------- events ----------
let drag = null;
stage.addEventListener("pointerdown", (e) => { if (e.target.closest(".bub, .hud, #lane, .ctl, #topo")) return; drag = { x: e.clientX, y: e.clientY, cx: camT.cx, cy: camT.cy, moved: false }; });
addEventListener("pointermove", (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (drag.moved) { const sc = camT.w / stage.clientWidth; camT.cx = drag.cx - dx * sc; camT.cy = drag.cy - dy * sc; Object.assign(cam, { cx: camT.cx, cy: camT.cy }); kick(); }
  }
  if (stage.contains(e.target)) showTip(e);
});
addEventListener("pointerup", () => setTimeout(() => (drag = null), 0));
stage.addEventListener("pointerleave", () => (tipEl.hidden = true));
stage.addEventListener("wheel", (e) => { return; e.preventDefault(); const f = Math.exp(e.deltaY * 0.0012); camT.w = Math.max(70, Math.min(1400, camT.w * f)); Object.assign(cam, { w: camT.w }); kick(); }, { passive: false });
stage.addEventListener("click", (e) => {
  const tl = e.target.closest("#topo .link"); if (tl && TQ.mode === "policies") { topoPanel(tl.dataset.link); return; }
  const tn = e.target.closest("#topo .node"); if (tn) { if (TQ.mode === "devices") topoPanel(tn.dataset.node); return; }
  if (e.target.closest("#topo")) return;
  if (drag && drag.moved) return;
  if (e.target.closest(".bub, .hud, .ctl, #lane")) return;
  const part = e.target.closest(".part"), port = e.target.closest(".port"), dev = e.target.closest(".dev");
  if (S.quiz && !S.quiz.done && S.quiz.qs[S.quiz.i].type === "click") { if (dev) quizAnswer(dev.dataset.dev === S.quiz.qs[S.quiz.i].ans, null); return; }
  if (port && dev) { select(dev.dataset.dev, { ports: true }); return; }
  if (part) { const p = PARTS[part.dataset.part]; if (p) select(p.host); return; }
  if (dev) { if (S.iso === dev.dataset.dev) deselect(); else select(dev.dataset.dev); return; }
  if (S.sel) deselect();
});
document.addEventListener("click", (e) => {
  const t = e.target.closest("button, .chip"); if (!t) return;
  const a = t.dataset.act;
  if (t.dataset.tab) return setTab(t.dataset.tab);
  if (t.dataset.tmode) { TQ.mode = t.dataset.tmode; TQ.stop = null; TQ.step = 0; renderTopo(); return topoPanel(null); }
  if (t.dataset.stop !== undefined) { TQ.stop = +t.dataset.stop + 1; TQ.step = 0; return topoPanel(null); }
  if (t.dataset.stopstep) { TQ.step = Math.max(0, Math.min(TOPO.stops[TQ.stop - 1].s.length - 1, TQ.step + +t.dataset.stopstep)); return topoPanel(null); }
  if (t.dataset.stopclose) { TQ.stop = null; TQ.step = 0; return topoPanel(null); }
  if (t.dataset.view) return setView(t.dataset.view);
  if (t.dataset.sel) return select(t.dataset.sel);
  if (t.dataset.part) { const id = t.dataset.part; if (t.dataset.go) { const p = PARTS[id]; if (p.side === "front" || p.side === "rear") { if (S.view !== p.side) setView(p.side); } camDev(p.host, false); S.sel = p.host; applyLit(); } togglePart(id); return; }
  if (t.dataset.flow) return startRun("flow", t.dataset.flow);
  if (t.dataset.attack) return startRun("attack", t.dataset.attack);
  if (t.dataset.opt !== undefined) { const q = S.quiz.qs[S.quiz.i]; quizAnswer(+t.dataset.opt === q.ans, +t.dataset.opt); return; }
  switch (a) {
    case "flip": setView(S.view === "front" ? "rear" : "front"); return refreshPanel();
    case "topo-show": { const id = S.sel; setTab("topo"); TQ.mode = "devices"; renderTopo(); const ns = TOPO.nodes.filter((n) => n.dev === id); topoPanel(ns[0] && ns[0].id); topoMark(ns.map((n) => [n.id, "on"]), "on"); return; }
    case "pull": return togglePart(S.sel);
    case "ports": S.portZoom = true; return camDev(S.sel, true);
    case "back": return deselect();
    case "tour-go": S.tour = { i: 0, auto: true }; return tourStop(0);
    case "tour-play": S.tour.auto = !S.tour.auto; if (S.tour.auto) tourStop(S.tour.i); else { clearTimeout(S.tour.timer); renderTour(); } return;
    case "tour-next": return tourStop(S.tour.i + 1);
    case "tour-prev": return tourStop(S.tour.i - 1);
    case "tour-end": return tourEnd();
    case "quiz-go": S.quiz = { qs: makeQuiz(), i: 0, score: 0 }; clearLit(); S.sel = null; camAll(); return renderQuiz();
    case "quiz-next": S.quiz.i++; S.quiz.done = false; clearLit(); camAll(); return renderQuiz();
    case "quiz-end": S.quiz = null; S.quizHide = false; return renderQuiz();
    case "run-stop": return stopRun();
  }
  if (t.id === "b-power") return power();
  if (t.id === "b-explode") return toggleExplode();
  if (t.id === "b-theme") return setTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
  if (t.id === "b-labels") { S.labels = !S.labels; t.setAttribute("aria-pressed", S.labels); return kick(); }
  if (t.id === "b-follow") { S.follow = !S.follow; t.setAttribute("aria-pressed", S.follow); return; }
  if (t.id === "b-reset") { stopRun(true); tourEnd(); isolate(null); resetPulls(); power(false); S.sel = null; clearLit(); camAll(); setTab("learn"); return; }
  if (t.classList.contains("prev")) return stepRun(-1, false);
  if (t.classList.contains("next")) return stepRun(1, false);
  if (t.classList.contains("play")) { const r = S.run; if (r.done || r.i === r.sc.steps.length - 1) { r.i = 0; r.done = false; r.auto = true; showStep(); scheduleNext(); } else { r.auto = !r.auto; if (r.auto) scheduleNext(); else clearTimeout(runTimer); showStep(); } return; }
  if (t.classList.contains("stop")) return stopRun();
});
$("#q").addEventListener("input", renderParts);

addEventListener("keydown", (e) => { const tn = e.target.closest && e.target.closest("#topo .node"); if (tn && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); topoPanel(tn.dataset.node); return; } if (e.key === "Escape") { if (S.run) stopRun(); else if (S.sel) deselect(); } });

// ---------- per-page view (#ch04) ----------
const PAGES = {
  "00": ["Launch Your Company", ["rack"]], "01": ["Switch Provisioning", ["core"]],
  "02": ["Perimeter Firewall", ["fw", "bk"]], "03": ["Firewall Policies and Guest Wi-Fi", ["bk"]],
  "04": ["Core Switching and VLANs", ["core", "bk"]], "05": ["Network Storage", ["nas", "core"]],
  "06": ["Hypervisor and DMZ Web Server", ["hv", "nas", "kvm"]], "07": ["Services and Traffic Analysis", ["hv"]],
  "08": ["Build the Vulnerable Pi", ["hv", "drawer"]], "09": ["Vulnerability Assessment", ["bk", "core", "hv", "drawer"]],
  "10": ["Remediation and SSP", ["fw", "bk", "core", "hv", "nas", "drawer"]], "12": ["Lab Restoration", ["fw", "bk", "core", "hv", "nas", "drawer"]],
};
function applyPage() {
  const m = /^#ch(\d\d)$/.exec(location.hash);
  S.page = m && PAGES[m[1]] ? { n: m[1], t: PAGES[m[1]][0], devs: PAGES[m[1]][1] } : null;
  S.lit = {}; if (S.page) for (const id of S.page.devs) S.lit[id] = "use";
  applyLit(); refreshPanel();
}
addEventListener("hashchange", applyPage);

// ---------- boot ----------
function init() {
  buildBubbles();
  for (const el of $$(".led")) { el.setAttribute("data-tip", "LED"); }
  setTheme("light");
  setView("front"); camAll(true);
  updateLeds(true); applyLit(); refreshPanel(); setTab("learn"); applyPage();
  const fit = () => { camAll(true); kick(); };
  new ResizeObserver(fit).observe(stage);
  kick();
}
init();
window.__rack = { S, select, power, toggleExplode, startRun, setView, setTab, camAll, camDev, tourStop, makeQuiz, togglePart, setPull };
