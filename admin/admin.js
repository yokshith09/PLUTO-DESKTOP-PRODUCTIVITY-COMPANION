// Pluto admin: the numbers from the counting server (server/src/api.ts, GET /v1/admin/stats),
// drawn with plain SVG. The site and its /api path sit behind Cloudflare Access, so only the
// owner's login reaches them. Add ?demo to the address to see the layout with made-up numbers.
(() => {
  "use strict";
  const SVG = "http://www.w3.org/2000/svg";
  const fmt = (n) => Number(n || 0).toLocaleString();
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "–");

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    for (const k of kids) e.append(k);
    return e;
  }
  function svg(tag, attrs) {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
    return e;
  }

  /** Bars per day; `series` stack on each other. */
  function chart(days, series) {
    const W = 600, H = 180, pad = 22;
    const s = svg("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img" });
    const totals = days.map((_, i) => series.reduce((t, x) => t + (x.values[i] || 0), 0));
    const max = Math.max(1, ...totals);
    const bw = (W - pad) / Math.max(1, days.length);
    s.append(svg("line", { class: "axis", x1: pad, y1: H - pad, x2: W, y2: H - pad }));
    days.forEach((d, i) => {
      let y = H - pad;
      for (const x of series) {
        const h = ((x.values[i] || 0) / max) * (H - pad * 2);
        if (h > 0) {
          const r = svg("rect", { x: pad + i * bw + 0.5, y: y - h, width: Math.max(1, bw - 1), height: h, fill: x.colour });
          const t = svg("title");
          t.textContent = `${d} · ${x.label}: ${x.values[i]}`;
          r.append(t);
          s.append(r);
        }
        y -= h;
      }
    });
    const label = (x, txt, anchor) => { const t = svg("text", { x, y: H - 6, "text-anchor": anchor }); t.textContent = txt; s.append(t); };
    if (days.length) { label(pad, days[0], "start"); label(W, days[days.length - 1], "end"); }
    const top = svg("text", { x: 0, y: pad - 6 });
    top.textContent = fmt(max);
    s.append(top);
    s.setAttribute("aria-label", series.map((x) => `${x.label}: ${fmt(x.values.reduce((a, b) => a + b, 0))} in all`).join(", "));
    return s;
  }
  const legend = (series) => el("p", { class: "legend" }, ...series.map((x) => { const i = el("i"); i.style.background = x.colour; return el("span", {}, i, x.label); }));
  const panel = (title, sub, ...kids) => el("section", { class: "panel" }, el("h2", {}, title), el("p", { class: "sub" }, sub), ...kids);
  function table(head, rows) {
    const t = el("table", {}, el("thead", {}, el("tr", {}, ...head.map((h, i) => el("th", i ? { class: "n" } : {}, h)))));
    const body = el("tbody");
    for (const r of rows) body.append(el("tr", {}, ...r.map((c, i) => el("td", i ? { class: "n" } : {}, String(c)))));
    if (!rows.length) body.append(el("tr", {}, el("td", { colspan: String(head.length) }, "Nothing yet.")));
    t.append(body);
    return t;
  }

  function render(s, root) {
    root.textContent = "";
    const css = (v) => `var(--${v})`;
    const card = (n, label) => el("div", { class: "card" }, el("b", {}, typeof n === "string" ? n : fmt(n)), el("span", {}, label));
    const stick = s.totals.mau ? Math.round((s.totals.dau / s.totals.mau) * 100) : 0;
    root.append(el("div", { class: "cards" },
      card(s.funnel.downloads, "Downloads, last 30 days"),
      card(s.funnel.installs, "New installs, last 30 days"),
      card(s.totals.dau, "Active today"),
      card(s.totals.wau, "Active this week"),
      card(s.totals.mau, "Active this month"),
      card(`${stick}%`, "Active today of this month"),
    ));

    const f = s.funnel;
    const widest = Math.max(1, f.downloads, f.installs, f.active);
    const step = (label, n, colour) => { const bar = el("i"); bar.style.width = `${(n / widest) * 100}%`; bar.style.background = css(colour); return el("div", {}, el("span", {}, label), bar, el("b", {}, fmt(n))); };
    root.append(panel("Downloads → installs → active", `Last 30 days. ${pct(f.installs, f.downloads)} of downloads became installs (first open); ${fmt(f.active)} installs were open at least once.`,
      el("div", { class: "funnel" }, step("Website downloads", f.downloads, "win"), step("New installs", f.installs, "new"), step("Active installs", f.active, "active"))));

    const dl = [{ label: "Windows", values: s.downloads.windows, colour: css("win") }, { label: "macOS", values: s.downloads.macos, colour: css("mac") }];
    const act = [{ label: "Active", values: s.active, colour: css("active") }];
    const inst = [{ label: "New installs", values: s.installs, colour: css("new") }];
    root.append(el("div", { class: "grid2" },
      panel("Downloads per day", "Website Download clicks by people (crawlers and previews are not counted).", chart(s.days, dl), legend(dl)),
      panel("Active per day", "Installs that were open that day.", chart(s.days, act), legend(act)),
    ));
    root.append(el("div", { class: "grid2" },
      panel("New installs per day", "First time Pluto opened on a computer.", chart(s.days, inst), legend(inst)),
      panel("Still using it", "By the week Pluto was installed: opened again 7 and 30 days later.",
        table(["Install week", "Installs", "After 7 days", "After 30 days"], s.retention.slice().reverse().map((r) => [r.week, fmt(r.installs), `${fmt(r.week1)} (${pct(r.week1, r.installs)})`, `${fmt(r.month1)} (${pct(r.month1, r.installs)})`]))),
    ));
    root.append(el("div", { class: "grid2" },
      panel("Versions in use", "Installs active in the last 30 days.", table(["Version", "Installs"], s.versions.map((v) => [v.version, fmt(v.installs)]))),
      panel("Systems", "Installs active in the last 30 days.", table(["System", "Installs"], s.os.map((o) => [o.os === "macos" ? "macOS" : o.os === "windows" ? "Windows" : o.os, fmt(o.installs)]))),
    ));
    const hours = s.unusual.newPerHour;
    const usual = hours.length ? hours.reduce((t, h) => t + h.installs, 0) / hours.length : 0;
    const spikes = hours.filter((h) => h.installs >= 20 && h.installs > usual * 5);
    root.append(panel("Unusual activity", "New installs per hour over the last 48 hours, and installs that opened only once. A sudden spike can be fake installs from a script.",
      el("p", {}, spikes.length ? el("span", { class: "warn" }, `Spike: ${spikes.map((h) => `${h.installs} at ${h.hour}:00 UTC`).join(", ")}`) : "No spikes in new installs."),
      el("p", {}, `Opened once and never again: ${fmt(s.unusual.openedOnce)} of ${fmt(s.totals.installs)} installs (${pct(s.unusual.openedOnce, s.totals.installs)}).`),
    ));
    root.append(el("p", { class: "sub" }, `${s.from} to ${s.to} (UTC). All-time: ${fmt(s.totals.downloads)} downloads, ${fmt(s.totals.installs)} installs.`));
  }

  /** Made-up numbers, only for ?demo: to check the layout before there is real data. */
  function demo(days) {
    const to = new Date();
    const list = Array.from({ length: days }, (_, i) => new Date(to.getTime() - (days - 1 - i) * 864e5).toISOString().slice(0, 10));
    const wave = (base, i, k) => Math.max(0, Math.round(base * (1 + i / days) + Math.sin(i / k) * base * 0.3));
    const windows = list.map((_, i) => wave(30, i, 3)), macos = list.map((_, i) => wave(12, i, 4));
    const installs = list.map((_, i) => Math.round((windows[i] + macos[i]) * 0.6));
    const active = list.map((_, i) => wave(180, i, 6));
    const sum = (a) => a.slice(-30).reduce((t, n) => t + n, 0);
    return {
      from: list[0], to: list[list.length - 1], days: list, downloads: { windows, macos }, installs, active,
      totals: { downloads: sum(windows) * 4, installs: sum(installs) * 3, dau: active[active.length - 1], wau: 420, mau: 900 },
      funnel: { downloads: sum(windows) + sum(macos), installs: sum(installs), active: 900 },
      versions: [{ version: "0.6.1", installs: 610 }, { version: "0.6.0", installs: 290 }],
      os: [{ os: "windows", installs: 640 }, { os: "macos", installs: 260 }],
      retention: [0, 1, 2, 3].map((w) => ({ week: list[Math.max(0, list.length - 7 * (w + 1))], installs: 220 - w * 10, week1: 120 - w * 5, month1: w > 2 ? 70 : 0 })),
      unusual: { newPerHour: [{ hour: list[list.length - 1] + "T09", installs: 4 }], openedOnce: 180 },
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
      load();
    });
  }
})();
