// Pluto admin: a tiled dashboard of the counting server's numbers (server/src/api.ts,
// GET /v1/admin/stats). Plain SVG, no libraries. The site and its /api path sit behind
// Cloudflare Access, so only the owner's login reaches them. ?demo shows made-up numbers.
// Charts follow the dataviz method: colour by job, one y-axis, thin marks, a hover tooltip on
// every chart, a legend for two or more series, and every chart readable as a table.
(() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  let W = 640; // chart drawing width; narrower on phones so labels keep their shape
  const fmt = (n) => Number(n || 0).toLocaleString();
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "–");
  const sum = (a) => a.reduce((t, n) => t + (n || 0), 0);
  const short = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });
  const C = { win: "var(--s1)", mac: "var(--s2)", linux: "var(--s3)", one: "var(--s1)" };

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined) e.setAttribute(k, v);
    for (const k of kids) if (k !== null && k !== undefined) e.append(k);
    return e;
  }
  function s(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
    return e;
  }
  const text = (x, y, str, attrs) => { const t = s("text", { x, y, ...attrs }); t.textContent = str; return t; };

  /* ---------- Tooltip: one for the page, follows the pointer ---------- */
  let tip = null;
  function showTip(evt, title, rows) {
    if (!tip) { tip = el("div", { class: "tip", role: "status" }); document.body.append(tip); }
    tip.textContent = "";
    tip.append(el("b", {}, title));
    for (const [colour, label, value] of rows) {
      const sw = el("i");
      if (colour) sw.style.background = colour; else sw.style.display = "none";
      tip.append(el("p", {}, el("span", {}, sw, label), el("strong", {}, value)));
    }
    tip.style.display = "block";
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, evt.clientX + 14);
    const y = Math.max(8, evt.clientY - tip.offsetHeight - 10);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }
  const hideTip = () => { if (tip) tip.style.display = "none"; };

  /** A y-scale with round grid steps. */
  function scale(max) {
    const raw = Math.max(1, max) / 3;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) || raw;
    return { top: step * 3, ticks: [0, step, step * 2, step * 3] };
  }

  function frame(svgEl, W, H, pad, top) {
    const { ticks } = scale(top);
    const y = (v) => H - pad.b - (v / ticks[3]) * (H - pad.t - pad.b);
    for (const t of ticks) {
      svgEl.append(s("line", { class: t ? "grid" : "base", x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t) }));
      svgEl.append(text(pad.l - 6, y(t) + 3.5, fmt(t), { "text-anchor": "end" }));
    }
    return y;
  }
  function xLabels(svgEl, days, x, H) {
    const n = days.length;
    const idx = n <= 1 ? [0] : [0, Math.round((n - 1) / 2), n - 1];
    idx.forEach((i, k) => svgEl.append(text(x(i), H - 4, short(days[i]), { "text-anchor": k === 0 ? "start" : k === idx.length - 1 ? "end" : "middle" })));
  }

  /** Bars per day, stacked; 2px gap between segments; hover a day for its numbers. */
  function bars(days, series, opts = {}) {
    const H = opts.short ? 150 : 220, pad = { l: 34, r: 4, t: 10, b: 20 };
    const svgEl = s("svg", { class: `chart${opts.short ? " short" : ""}`, viewBox: `0 0 ${W} ${H}`, role: "img", preserveAspectRatio: "none" });
    const totals = days.map((_, i) => sum(series.map((x) => x.values[i])));
    const y = frame(svgEl, W, H, pad, Math.max(...totals, 1));
    const bw = (W - pad.l - pad.r) / Math.max(1, days.length);
    const x = (i) => pad.l + i * bw + bw / 2;
    days.forEach((day, i) => {
      let base = y(0);
      series.forEach((ser, k) => {
        const v = ser.values[i] || 0;
        if (!v) return;
        const top = y(v) - (y(0) - base);
        const h = Math.max(1, base - top - (k ? 2 : 0));
        svgEl.append(s("rect", { x: pad.l + i * bw + bw * 0.15, y: base - h - (k ? 2 : 0), width: Math.max(1, bw * 0.7), height: h, rx: Math.min(3, bw * 0.3), fill: ser.colour }));
        base = top;
      });
      const hit = s("rect", { class: "hit", x: pad.l + i * bw, y: pad.t, width: bw, height: H - pad.t - pad.b });
      hit.addEventListener("pointermove", (e) => showTip(e, short(day), [...series.map((ser) => [ser.colour, ser.label, fmt(ser.values[i])]), ...(series.length > 1 ? [[null, "Total", fmt(totals[i])]] : [])]));
      hit.addEventListener("pointerleave", hideTip);
      svgEl.append(hit);
    });
    xLabels(svgEl, days, x, H);
    svgEl.setAttribute("aria-label", series.map((x2) => `${x2.label}: ${fmt(sum(x2.values))} in all`).join(", "));
    return svgEl;
  }

  /** A line per series with a soft area under the first, an optional 7-day average, and a crosshair. */
  function lines(days, series, opts = {}) {
    const H = 220, pad = { l: 34, r: 6, t: 10, b: 20 };
    const svgEl = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", preserveAspectRatio: "none" });
    const all = series.flatMap((x) => x.values);
    const y = frame(svgEl, W, H, pad, Math.max(...all, 1));
    const step = (W - pad.l - pad.r) / Math.max(1, days.length - 1);
    const x = (i) => pad.l + i * step;
    const path = (vals) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v || 0).toFixed(1)}`).join("");
    const first = series[0];
    svgEl.append(s("path", { d: `${path(first.values)}L${x(days.length - 1)},${y(0)}L${x(0)},${y(0)}Z`, fill: first.colour, opacity: 0.1 }));
    const avg = opts.average ? first.values.map((_, i) => { const w = first.values.slice(Math.max(0, i - 6), i + 1); return sum(w) / w.length; }) : null;
    if (avg) svgEl.append(s("path", { d: path(avg), fill: "none", stroke: "var(--text-2)", "stroke-width": 1.5, "stroke-dasharray": "4 4", "vector-effect": "non-scaling-stroke" }));
    for (const ser of series) svgEl.append(s("path", { d: path(ser.values), fill: "none", stroke: ser.colour, "stroke-width": 2, "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" }));
    const cross = s("line", { class: "cross", y1: pad.t, y2: H - pad.b, x1: 0, x2: 0, visibility: "hidden" });
    const dot = s("circle", { r: 4, cx: 0, cy: 0, fill: first.colour, stroke: "var(--raised)", "stroke-width": 2, visibility: "hidden" });
    svgEl.append(cross, dot);
    const hit = s("rect", { class: "hit", x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b });
    hit.addEventListener("pointermove", (e) => {
      const r = svgEl.getBoundingClientRect();
      const i = Math.max(0, Math.min(days.length - 1, Math.round(((e.clientX - r.left) / r.width * W - pad.l) / step)));
      cross.setAttribute("visibility", "visible"); dot.setAttribute("visibility", "visible");
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(first.values[i] || 0));
      showTip(e, short(days[i]), [...series.map((ser) => [ser.colour, ser.label, fmt(ser.values[i])]), ...(avg ? [[null, "7-day average", fmt(Math.round(avg[i]))]] : [])]);
    });
    hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
    svgEl.append(hit);
    xLabels(svgEl, days, x, H);
    svgEl.setAttribute("aria-label", `${first.label} per day; latest ${fmt(first.values[first.values.length - 1])}`);
    return svgEl;
  }

  function sparkline(values, colour) {
    const W = 200, H = 34;
    const max = Math.max(1, ...values);
    const step = W / Math.max(1, values.length - 1);
    const d = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(H - 2 - ((v || 0) / max) * (H - 4)).toFixed(1)}`).join("");
    const svgEl = s("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" });
    svgEl.append(s("path", { d: `${d}L${W},${H}L0,${H}Z`, fill: colour, opacity: 0.1 }), s("path", { d, fill: "none", stroke: colour, "stroke-width": 1.75, "vector-effect": "non-scaling-stroke" }));
    return svgEl;
  }

  function legend(items) {
    return el("ul", { class: "legend" }, ...items.map(([colour, label, kind]) => { const i = el("i", { class: kind || "" }); if (kind !== "dash") i.style.background = colour; return el("li", {}, i, label); }));
  }
  function table(head, rows, scroll) {
    const t = el("table", { class: "data" }, el("thead", {}, el("tr", {}, ...head.map((h) => el("th", {}, h)))));
    const body = el("tbody");
    for (const r of rows) body.append(el("tr", {}, ...r.map((c) => el("td", {}, String(c)))));
    t.append(body);
    return scroll ? el("div", { class: "scroll" }, t) : t;
  }
  const asTable = (head, rows) => el("details", { class: "as-table" }, el("summary", {}, "Show as a table"), table(head, rows, true));
  function tile(span, title, sub, ...kids) {
    const t = el("section", { class: `tile${span === 12 ? " wide" : ""}`, "aria-label": title }, el("h2", {}, title), sub ? el("p", { class: "sub" }, sub) : null, ...kids);
    t.style.setProperty("--span", String(span));
    return t;
  }

  function change(now, before, label) {
    if (!before && !now) return el("p", { class: "change" }, `No change ${label}`);
    if (!before) return el("p", { class: "change" }, el("b", {}, "New"), ` ${label}`);
    const d = Math.round(((now - before) / before) * 100);
    return el("p", { class: "change" }, el("b", { class: d >= 0 ? "up" : "down" }, `${d >= 0 ? "+" : ""}${d}%`), ` ${label}`);
  }
  function kpi(label, value, changeEl, spark) {
    const t = el("section", { class: "tile kpi", "aria-label": label }, el("p", { class: "label" }, label), el("p", { class: "value" }, value), changeEl, spark || null);
    t.style.setProperty("--span", "2");
    return t;
  }

  function donut(parts) {
    const total = sum(parts.map((p) => p.value));
    const svgEl = s("svg", { viewBox: "0 0 120 120", role: "img", "aria-label": parts.map((p) => `${p.label} ${pct(p.value, total)}`).join(", ") });
    const r = 46, c = 2 * Math.PI * r;
    let off = 0;
    svgEl.append(s("circle", { cx: 60, cy: 60, r, fill: "none", stroke: "var(--grid)", "stroke-width": 16 }));
    for (const p of parts) {
      const len = total ? (p.value / total) * c : 0;
      const arc = s("circle", { cx: 60, cy: 60, r, fill: "none", stroke: p.colour, "stroke-width": 16, "stroke-dasharray": `${Math.max(0, len - 2)} ${c}`, "stroke-dashoffset": -off, transform: "rotate(-90 60 60)" });
      arc.addEventListener("pointermove", (e) => showTip(e, p.label, [[p.colour, "Installs", `${fmt(p.value)} (${pct(p.value, total)})`]]));
      arc.addEventListener("pointerleave", hideTip);
      svgEl.append(arc);
      off += len;
    }
    svgEl.append(text(60, 62, fmt(total), { class: "total", "text-anchor": "middle" }), text(60, 78, "installs", { "text-anchor": "middle" }));
    return svgEl;
  }

  const OS_NAME = { windows: "Windows", macos: "macOS", linux: "Linux" };
  const OS_COLOUR = { windows: C.win, macos: C.mac, linux: C.linux };

  let shown = null;
  function render(st, root) {
    shown = { st, root };
    W = root.clientWidth && root.clientWidth < 720 ? 360 : 640;
    root.textContent = "";
    const n = st.days.length;
    const last = (a, k = 7) => sum(a.slice(n - k));
    const prev = (a, k = 7) => sum(a.slice(Math.max(0, n - 2 * k), n - k));
    const dl = st.downloads.windows.map((w, i) => w + (st.downloads.macos[i] || 0));
    const tail = (a) => a.slice(-30);
    const stick = st.totals.mau ? Math.round((st.totals.dau / st.totals.mau) * 100) : 0;
    const grid = el("div", { class: "tiles" });

    // Row 1: the headline numbers, each with its change and last 30 days.
    grid.append(
      kpi("Downloads, last 7 days", fmt(last(dl)), change(last(dl), prev(dl), "vs the 7 days before"), sparkline(tail(dl), C.one)),
      kpi("New installs, last 7 days", fmt(last(st.installs)), change(last(st.installs), prev(st.installs), "vs the 7 days before"), sparkline(tail(st.installs), C.one)),
      kpi("Active today", fmt(st.totals.dau), change(st.totals.dau, st.active[n - 8] || 0, "vs same day last week"), sparkline(tail(st.active), C.one)),
      kpi("Active this week", fmt(st.totals.wau), change(st.totals.wau, st.totals.wauPrev || 0, "vs last week")),
      kpi("Active this month", fmt(st.totals.mau), el("p", { class: "change" }, "Installs open at least once in 30 days")),
      kpi("Daily of monthly", `${stick}%`, el("p", { class: "change" }, "How many of this month's users came today")),
    );

    // Row 2: active users over time, and the funnel.
    const act = [{ label: "Active installs", values: st.active, colour: C.one }];
    grid.append(tile(8, "Active installs per day", "Installs that were open that day. The dashed line is the 7-day average.",
      lines(st.days, act, { average: true }), legend([[C.one, "Active installs", "line"], ["", "7-day average", "dash"]]),
      asTable(["Day", "Active"], st.days.map((d, i) => [d, fmt(st.active[i])]).reverse())));
    const f = st.funnel;
    const widest = Math.max(1, f.downloads, f.installs, f.active);
    const step = (label, value, rate) => { const bar = el("i"); bar.style.width = `${(value / widest) * 100}%`; return el("div", { class: "step" }, el("div", { class: "row" }, el("span", {}, label), el("b", {}, fmt(value))), el("div", { class: "track" }, bar), rate ? el("p", { class: "rate" }, rate) : null); };
    grid.append(tile(4, "Downloads → installs → active", "Last 30 days.",
      el("div", { class: "funnel" },
        step("Website downloads", f.downloads),
        step("New installs (first open)", f.installs, `${pct(f.installs, f.downloads)} of downloads`),
        step("Active installs", f.active, "Open at least once in 30 days")),
      el("p", { class: "foot" }, "A download is not an install: people download twice, or never open the file.")));

    // Row 3: downloads by system, and new installs.
    const dls = [{ label: "Windows", values: st.downloads.windows, colour: C.win }, { label: "macOS", values: st.downloads.macos, colour: C.mac }];
    grid.append(tile(6, "Website downloads per day", `By system. ${fmt(sum(dl))} in this range; crawlers and link previews are not counted.`,
      bars(st.days, dls), legend(dls.map((x) => [x.colour, x.label])),
      asTable(["Day", "Windows", "macOS", "Total"], st.days.map((d, i) => [d, fmt(st.downloads.windows[i]), fmt(st.downloads.macos[i]), fmt(dl[i])]).reverse())));
    const inst = [{ label: "New installs", values: st.installs, colour: C.one }];
    grid.append(tile(6, "New installs per day", `First time Pluto opened on a computer. ${fmt(sum(st.installs))} in this range.`,
      bars(st.days, inst),
      asTable(["Day", "New installs"], st.days.map((d, i) => [d, fmt(st.installs[i])]).reverse())));

    // Row 4: systems, versions, retention.
    const osTotal = sum(st.os.map((o) => o.installs));
    const osParts = st.os.map((o) => ({ label: OS_NAME[o.os] || o.os, value: o.installs, colour: OS_COLOUR[o.os] || "var(--text-3)" }));
    grid.append(tile(3, "Systems", "Installs active in the last 30 days.",
      el("div", { class: "donut-wrap" }, donut(osParts), legend(osParts.map((p) => [p.colour, `${p.label} ${pct(p.value, osTotal)}`]))),
      asTable(["System", "Installs"], osParts.map((p) => [p.label, fmt(p.value)]))));
    const vMax = Math.max(1, ...st.versions.map((v) => v.installs));
    const vTotal = sum(st.versions.map((v) => v.installs));
    grid.append(tile(4, "Versions in use", "Installs active in the last 30 days; the newest version should lead.",
      st.versions.length ? el("div", { class: "hbars" }, ...st.versions.slice(0, 6).map((v) => { const i = el("i"); i.style.width = `${(v.installs / vMax) * 100}%`; return el("div", { class: "hbar" }, el("div", { class: "row" }, el("span", {}, v.version), el("b", {}, `${fmt(v.installs)} · ${pct(v.installs, vTotal)}`)), el("div", { class: "track" }, i)); }))
        : el("p", { class: "sub" }, "No installs in the last 30 days."),
      st.versions.length > 6 ? el("p", { class: "foot" }, `And ${st.versions.length - 6} older versions.`) : null));
    const level = (r) => (r >= 0.6 ? 4 : r >= 0.45 ? 3 : r >= 0.3 ? 2 : r >= 0.15 ? 1 : 0);
    const heat = el("table", { class: "heat" }, el("thead", {}, el("tr", {}, el("th", {}, "Installed"), el("th", {}, "Installs"), el("th", {}, "7 days on"), el("th", {}, "30 days on"))));
    const hb = el("tbody");
    for (const r of st.retention.slice(-8).reverse()) {
      const cell = (k, done) => {
        if (!done) return el("td", { title: "Not long enough ago yet" }, "–");
        const ratio = r.installs ? k / r.installs : 0;
        const td = el("td", { class: `l${level(ratio)}` }, pct(k, r.installs));
        td.style.background = `var(--seq-${level(ratio)})`;
        return td;
      };
      const age = (Date.parse(`${st.to}T00:00:00Z`) - Date.parse(`${r.week}T00:00:00Z`)) / 864e5;
      hb.append(el("tr", {}, el("td", { class: "wk" }, short(r.week)), el("td", {}, fmt(r.installs)), cell(r.week1, age >= 14), cell(r.month1, age >= 37)));
    }
    heat.append(hb);
    grid.append(tile(5, "Still using it", "By install week: share opened again 7 and 30 days later. The stronger the blue, the more came back.",
      st.retention.length ? heat : el("p", { class: "sub" }, "No installs yet.")));

    // Row 5: unusual activity.
    const hours = st.unusual.newPerHour;
    const avgHour = hours.length ? sum(hours.map((h) => h.installs)) / hours.length : 0;
    const spikes = hours.filter((h) => h.installs >= 20 && h.installs > avgHour * 5);
    const hourBars = hours.length ? bars(hours.map((h) => h.hour.slice(0, 10)), [{ label: "New installs", values: hours.map((h) => h.installs), colour: C.one }], { short: true }) : el("p", { class: "sub" }, "No new installs in the last 48 hours.");
    grid.append(tile(8, "Unusual activity", "New installs per hour, last 48 hours. A sudden spike can be fake installs from a script.",
      el("p", { class: `status${spikes.length ? " warn" : ""}` }, spikes.length ? `Spike: ${spikes.map((h) => `${h.installs} at ${h.hour.slice(11)}:00 UTC on ${short(h.hour.slice(0, 10))}`).join(", ")}` : "No spikes in new installs."),
      hourBars));
    grid.append(tile(4, "Opened once, never again", "Installs older than a day that never came back.",
      el("p", { class: "big-stat" }, fmt(st.unusual.openedOnce)),
      el("p", { class: "sub" }, `${pct(st.unusual.openedOnce, st.totals.installs)} of ${fmt(st.totals.installs)} installs. High numbers can mean a first-run problem, or fake installs.`)));

    grid.append(tile(12, "All time", null, el("p", { class: "sub" }, `${fmt(st.totals.downloads)} website downloads and ${fmt(st.totals.installs)} installs. This view: ${st.from} to ${st.to} (UTC).`)));
    root.append(grid);
  }

  /** Made-up numbers, only for ?demo: to check the layout before there is real data. */
  function demo(days) {
    const to = new Date();
    const list = Array.from({ length: days }, (_, i) => new Date(to.getTime() - (days - 1 - i) * 864e5).toISOString().slice(0, 10));
    const wave = (base, i, k) => Math.max(0, Math.round(base * (1 + i / days) + Math.sin(i / k) * base * 0.3 + ((i * 7) % 5) - 2));
    const windows = list.map((_, i) => wave(30, i, 3)), macos = list.map((_, i) => wave(12, i, 4));
    const installs = list.map((_, i) => Math.round((windows[i] + macos[i]) * 0.6));
    const active = list.map((_, i) => wave(180, i, 6) + (new Date(`${list[i]}T00:00:00Z`).getUTCDay() % 6 === 0 ? -40 : 0));
    const s30 = (a) => a.slice(-30).reduce((t, n) => t + n, 0);
    const hours = Array.from({ length: 48 }, (_, h) => ({ hour: new Date(to.getTime() - (47 - h) * 36e5).toISOString().slice(0, 13), installs: 1 + ((h * 5) % 4) }));
    return {
      from: list[0], to: list[list.length - 1], days: list, downloads: { windows, macos }, installs, active,
      totals: { downloads: s30(windows) * 4, installs: s30(installs) * 3, dau: active[active.length - 1], wau: 420, wauPrev: 380, mau: 900 },
      funnel: { downloads: s30(windows) + s30(macos), installs: s30(installs), active: 900 },
      versions: [{ version: "0.6.2", installs: 520 }, { version: "0.6.1", installs: 290 }, { version: "0.6.0", installs: 90 }],
      os: [{ os: "windows", installs: 640 }, { os: "macos", installs: 260 }],
      retention: [7, 6, 5, 4, 3, 2, 1, 0].map((w) => ({ week: list[Math.max(0, list.length - 1 - 7 * w)], installs: 220 - w * 10, week1: 120 - w * 4, month1: w >= 5 ? 70 - w : 0 })),
      unusual: { newPerHour: hours, openedOnce: 180 },
    };
  }

  async function load() {
    const root = document.getElementById("app");
    const days = Number(document.getElementById("days").value) || 90;
    if (new URLSearchParams(location.search).has("demo")) {
      document.getElementById("demo-note").hidden = false;
      render(demo(days), root);
      return;
    }
    try {
      const res = await fetch(`/api/v1/admin/stats?days=${days}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(res.status === 403 ? "Not signed in through Cloudflare Access." : `The server answered ${res.status}.`);
      render(await res.json(), root);
    } catch (e) {
      root.textContent = "";
      root.append(el("p", { class: "error" }, `Couldn't load the numbers. ${e.message}`));
    }
  }

  window.PlutoAdmin = { render, demo };
  if (!window.PLUTO_ADMIN_NO_AUTOLOAD) {
    document.addEventListener("DOMContentLoaded", () => {
      document.getElementById("days").addEventListener("change", load);
      let wide = window.innerWidth >= 720;
      window.addEventListener("resize", () => { if ((window.innerWidth >= 720) !== wide && shown) { wide = !wide; render(shown.st, shown.root); } });
      load();
    });
  }
})();
