// Pluto website: colours, menu, scroll motion, the pets (hero, demo, day story, pet library,
// dressing rooms, the pointer guide), the "your day is everywhere" scene and the feature tabs. One script for every page: each part runs
// only if its element is on the page. Sprites come from scripts/site-pets.py
// (rows: idle, running-right, running-left, waving, jumping, running = typing).
(() => {
  "use strict";

  const ROW = { idle: 0, right: 1, left: 2, wave: 3, jump: 4, type: 5 };
  document.documentElement.classList.add("js");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const ease = (t) => t * t * (3 - 2 * t);

  /* ---------- Colour: the app's five colours; the choice stays in this browser only ---------- */
  const COLOURS = ["periwinkle", "indigo", "ultraviolet", "amethyst", "copper"];
  const KEY = "pluto-site-colour";
  function setColour(c) {
    if (!COLOURS.includes(c)) return;
    document.documentElement.dataset.colour = c;
    const input = document.querySelector(`#colours input[value="${c}"]`);
    if (input) input.checked = true;
  }
  try { setColour(localStorage.getItem(KEY)); } catch { /* storage blocked: keep the default */ }
  $("#colours")?.addEventListener("change", (e) => {
    setColour(e.target.value);
    try { localStorage.setItem(KEY, e.target.value); } catch { /* not remembered, still applied */ }
  });

  /* ---------- Scroll motion (off when the visitor asks for less motion) ---------- */
  // [data-scroll] gets --p from 0 (just entering) to 1 (well in view); [data-reveal] eases in once;
  // pinned scenes (.scatter, .day) get their own progress through the section.
  if (!still.matches) document.documentElement.classList.add("motion");
  const scrolled = $$("[data-scroll]");
  const pinned = [];
  const pinnedProgress = (el) => {
    const r = el.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, r.height - innerHeight));
  };
  let ticking = false;
  function onScroll() {
    ticking = false;
    const vh = innerHeight;
    for (const el of scrolled) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      el.style.setProperty("--p", (still.matches ? 1 : clamp((vh - r.top) / (vh * 0.65))).toFixed(3));
    }
    for (const s of pinned) s(still.matches ? 1 : null);
    document.body.classList.toggle("scrolled", scrollY > 40);
  }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener("resize", onScroll, { passive: true });

  const reveals = $$("[data-reveal]");
  if ("IntersectionObserver" in window && !still.matches) {
    const ro = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); }
    }, { rootMargin: "0px 0px -10% 0px" });
    reveals.forEach((el, i) => { el.style.setProperty("--i", String(i % 4)); ro.observe(el); });
  } else reveals.forEach((el) => el.classList.add("in"));

  /* ---------- Download buttons: the visitor's own system first ---------- */
  if (/Mac/i.test(navigator.platform || navigator.userAgent)) {
    for (const group of $$(".ctas, .get-row")) {
      const win = group.querySelector('[data-os="windows"]');
      const mac = group.querySelector('[data-os="mac"]');
      if (!win || !mac) continue;
      if (win.classList.contains("btn")) {
        const cls = [...win.classList].find((c) => c !== "btn");
        const other = [...mac.classList].find((c) => c !== "btn");
        if (cls && other) { win.classList.replace(cls, other); mac.classList.replace(other, cls); }
      }
      group.insertBefore(mac, win);
    }
  }

  /* ---------- Feature tabs (features page) ---------- */
  const PARTS = {
    focus: ["Today, in one view", "The task you're on, what comes next, and a focus timer that the pet keeps beside you. Missed things wait for you here instead of disappearing.", "today", "Pluto's Today overview: the current task, today's tasks and reminders, and total time by app and website."],
    track: ["See where the day went", "Time by app and by website, without starting a timer. A month calendar shows each day at a glance, and tracking pauses when you step away.", "time", "Pluto's Time page: total time, the most used app, and a month calendar of tracked hours."],
    notes: ["Notes that stay close", "Write a quick note or open the full editor. Pin the important ones, add labels, and find anything with search.", "notes", "Pluto's Notes page with pinned notes, labels and search."],
    projects: ["Tasks, grouped by project", "Due dates, priorities, reminders and repeats. The next seven days, the whole month, or just what you missed.", "tasks", "Pluto's Tasks page with a list of tasks and the next seven days."],
    companion: ["A friend at the edge of the screen", "Pick a character, its size and how see-through it is. It steps aside by itself when a game, film or presentation fills the screen.", "character", "Pluto's Character page: the bear, with settings for size, opacity and hiding in full screen."],
  };
  const tabs = $$('[role="tab"]');
  const img = $("#panel-img");
  function swapImage(el, src, alt) {
    if (el.getAttribute("src") === src) return;
    if (still.matches) { el.src = src; if (alt) el.alt = alt; return; }
    el.classList.add("swap");
    const next = new Image();
    next.src = src;
    next.decode().catch(() => {}).finally(() => { el.src = src; if (alt) el.alt = alt; el.classList.remove("swap"); });
  }
  function choose(tab, focus) {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    }
    if (focus) tab.focus();
    const [h, p, shot, alt] = PARTS[tab.dataset.tab];
    $("#p-world")?.setAttribute("aria-labelledby", tab.id);
    $("#panel-h").textContent = h;
    $("#panel-p").textContent = p;
    swapImage(img, `shots/${shot}.webp`, alt);
  }
  if (img) tabs.forEach((t, i) => {
    t.addEventListener("click", () => choose(t, false));
    t.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (step) { e.preventDefault(); choose(tabs[(i + step + tabs.length) % tabs.length], true); }
      if (e.key === "Home") { e.preventDefault(); choose(tabs[0], true); }
      if (e.key === "End") { e.preventDefault(); choose(tabs[tabs.length - 1], true); }
    });
  });

  /* ---------- Sprites ---------- */
  let DATA = null;
  const byId = (id) => DATA.pets.find((p) => p.id === id) || DATA.pets[0];
  function paint(el, pet, row, frame, w, h) {
    el.style.backgroundImage = `url("pets/${pet.id}.webp")`;
    el.style.backgroundSize = `${w * 8}px ${h * DATA.rows.length}px`;
    el.style.backgroundPosition = `${-frame * w}px ${-row * h}px`;
    placeGear(el, pet, row, frame, w);
  }
  // Looping sprites share one clock and only move while on screen.
  const loops = new Set();
  function sprite(el, pet, w, h) {
    const s = { el, pet, w, h, row: ROW.idle, frame: 0, once: 0, back: ROW.idle, on: true };
    s.play = (row, times = 2) => { if (still.matches) { paint(el, s.pet, row, 1, w, h); setTimeout(() => paint(el, s.pet, s.back, 0, w, h), 1200); return; } s.row = row; s.frame = 0; s.once = s.pet.frames[row] * times; };
    s.rest = (row) => { s.back = row; if (!s.once) { s.row = row; s.frame = 0; } paint(el, s.pet, row, 0, w, h); };
    s.use = (pet) => { s.pet = pet; paint(el, pet, s.row, 0, w, h); };
    paint(el, pet, ROW.idle, 0, w, h);
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { s.on = es.some((e) => e.isIntersecting); }).observe(el);
    loops.add(s);
    return s;
  }
  setInterval(() => {
    if (still.matches || document.hidden || !DATA) return;
    for (const s of loops) {
      if (!s.on) continue;
      s.frame = (s.frame + 1) % s.pet.frames[s.row];
      if (s.once && --s.once <= 0) { s.once = 0; s.row = s.back; s.frame = 0; }
      paint(s.el, s.pet, s.row, s.frame, s.w, s.h);
    }
  }, 110);

  /* ---------- Hero: the bear on Pluto's horizon ---------- */
  function heroBear() {
    const btn = $(".on-planet");
    if (!btn) return;
    const s = sprite(btn.querySelector(".sprite-lg"), DATA.pets[0], 144, 156);
    const hello = btn.querySelector(".hello");
    const LINES = ["Hi! I live on your desktop.", "Small me, big plans.", "Want to see my day?", "I cheer when you finish things."];
    let n = 0, timer = 0;
    btn.addEventListener("click", () => {
      s.play(ROW.wave);
      hello.textContent = LINES[n++ % LINES.length];
      hello.classList.add("on");
      clearTimeout(timer);
      timer = setTimeout(() => hello.classList.remove("on"), 2600);
    });
    if (!still.matches) setTimeout(() => s.play(ROW.wave), 1400);
  }

  /* ---------- "Your day is everywhere": scattered things gather into one Pluto window ---------- */
  function scatterScene() {
    const sec = $(".scatter");
    if (!sec) return;
    const pet = sec.querySelector(".gather-pet");
    const s = pet ? sprite(pet, DATA.pets[0], 96, 104) : null;
    let waved = false;
    pinned.push((forced) => {
      const p = forced ?? pinnedProgress(sec);
      const g = ease(clamp((p - 0.08) / 0.62));
      sec.style.setProperty("--g", g.toFixed(3));
      sec.classList.toggle("gathered", g > 0.82);
      if (s && g > 0.9 && !waved) { waved = true; s.play(ROW.jump); }
      if (g < 0.5) waved = false;
    });
  }

  /* ---------- A day with Pluto: dawn to night ---------- */
  const SKY = [[246, 222, 206], [233, 239, 247], [220, 232, 246], [214, 196, 228], [24, 32, 58]];
  function dayScene() {
    const sec = $(".day");
    if (!sec) return;
    const steps = [...sec.querySelectorAll(".day-steps li")];
    const shot = sec.querySelector(".day-img");
    const bubble = sec.querySelector(".day-bubble");
    const s = sprite(sec.querySelector(".day-pet"), DATA.pets[0], 96, 104);
    let current = -1;
    pinned.push((forced) => {
      const p = forced ?? pinnedProgress(sec);
      // The sky follows the day.
      const x = p * (SKY.length - 1);
      const i = Math.min(SKY.length - 2, Math.floor(x));
      const f = x - i;
      const c = SKY[i].map((v, k) => Math.round(v + (SKY[i + 1][k] - v) * f));
      sec.style.setProperty("--sky", `rgb(${c.join(" ")})`);
      sec.classList.toggle("night", p > 0.82);
      const step = forced != null ? 0 : Math.min(steps.length - 1, Math.floor(p * steps.length * 0.999));
      if (step === current) return;
      current = step;
      steps.forEach((li, k) => li.classList.toggle("on", k === step));
      const li = steps[step];
      swapImage(shot, `shots/${li.dataset.shot}.webp`);
      s.rest(ROW[li.dataset.row] ?? ROW.idle);
      if (li.dataset.row === "wave" || li.dataset.row === "jump") s.play(ROW[li.dataset.row]);
      bubble.textContent = li.dataset.say;
      bubble.classList.remove("on");
      void bubble.offsetWidth;
      bubble.classList.add("on");
    });
  }

  /* ---------- Try it: the pet sits by the Today window and answers what you do ---------- */
  function demo() {
    const petEl = $("#pet");
    const bubble = $("#bubble");
    const list = $("#tasks");
    if (!petEl || !bubble || !list) return null;
    const s = sprite(petEl, DATA.pets[0], 120, 130);
    let bubbleTimer = 0;
    const say = (text) => {
      bubble.textContent = text;
      bubble.classList.add("on");
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble.classList.remove("on"), 2600);
    };
    const boxes = () => [...list.querySelectorAll('input[type="checkbox"]')];
    const empty = $("#empty");
    const refresh = () => { if (empty) empty.hidden = list.children.length > 0; };
    petEl.addEventListener("click", () => { s.play(ROW.wave); say(`Hi, I'm ${s.pet.name}.`); });
    const CHEERS = ["Nice one.", "One less thing.", "Look at you go.", "Done and done."];
    let cheer = 0;
    list.addEventListener("change", (e) => {
      const box = e.target;
      if (!box.matches('input[type="checkbox"]')) return;
      box.closest("li")?.classList.toggle("done", box.checked);
      if (!box.checked) return;
      const all = boxes().every((c) => c.checked);
      s.play(ROW.jump, all ? 3 : 2);
      say(all ? "All done for today!" : CHEERS[cheer++ % CHEERS.length]);
    });
    list.addEventListener("click", (e) => {
      const x = e.target.closest("button.x");
      if (!x) return;
      const li = x.closest("li");
      const next = li.nextElementSibling || li.previousElementSibling;
      li.remove();
      refresh();
      (next?.querySelector("button.x") || $("#new-task"))?.focus();
      s.play(ROW.wave, 1);
      say("Gone. One thing less to think about.");
    });
    $("#add")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#new-task");
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      const li = document.createElement("li");
      li.className = "new";
      li.innerHTML = '<label><input type="checkbox"><span></span></label><button class="x" type="button" aria-label="Remove this task">×</button>';
      li.querySelector("span").textContent = text;
      list.append(li);
      if (list.children.length > 6) list.firstElementChild.remove();
      input.value = "";
      refresh();
      s.play(ROW.wave);
      say("Got it. Added to today.");
    });
    return (pet) => { s.use(pet); petEl.setAttribute("aria-label", `${pet.name} the ${pet.kind}. Click to say hello.`); };
  }

  /* ---------- The look: which pet, wearing what. Shared by the dressing rooms and the guide ---------- */
  // Remembered in this browser only. Accessory drawings are the app's own (website/wardrobe, kept
  // equal to the app by src/website.wardrobe.test.tsx); where they sit follows the app's rules
  // (anchors per frame in pets.json, placed like spriteAnchors.ts placement()).
  let WARD = null;
  const LOOK_KEY = "pluto-site-look";
  const look = { pet: "bear", worn: [] };
  try { Object.assign(look, JSON.parse(localStorage.getItem(LOOK_KEY) || "{}")); } catch { /* keep the default */ }
  const lookers = new Set();
  function setLook(change) {
    Object.assign(look, change);
    if (WARD) look.worn = normalize(look.worn);
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch { /* not remembered */ }
    for (const f of lookers) f();
  }
  const slotOf = (id) => WARD.items.find((i) => i.id === id)?.slot;
  function normalize(ids) {
    const by = {};
    for (const id of ids) { const slot = slotOf(id); if (slot) by[slot] = id; }
    return ["head", "face", "neck"].flatMap((s) => by[s] || []);
  }
  const outfitOf = (worn) => WARD.outfits.find((o) => o.items.length === worn.length && o.items.every((i) => worn.includes(i)));

  /* ---------- Gear on a sprite: one <img> per worn thing, moved with every frame ---------- */
  const wearing = new WeakMap();
  function wear(el, worn) {
    let g = wearing.get(el);
    if (!g) { g = { imgs: [] }; wearing.set(el, g); }
    for (const i of g.imgs) i.remove();
    g.imgs = worn.map((id) => {
      const i = document.createElement("img");
      i.className = "gear";
      i.alt = "";
      i.src = `wardrobe/${id}.svg`;
      i.dataset.slot = slotOf(id) || "head";
      el.append(i);
      return i;
    });
  }
  function placeGear(el, pet, row, frame, w) {
    const g = wearing.get(el);
    if (!g || !g.imgs.length || !pet.anchors) return;
    const a = pet.anchors[row]?.[frame] || pet.anchors[0]?.[0];
    if (!a) return;
    const [cx, top, headW, neckY] = a;
    const k = w / DATA.cell.width;
    const s = headW / 120;
    const x = (cx - 100 * s) * k;
    for (const i of g.imgs) {
      const y = (i.dataset.slot === "neck" ? neckY - 128 * s : top - 28 * s) * k;
      i.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      i.style.width = `${(200 * s * k).toFixed(1)}px`;
    }
  }

  /* ---------- Dressing room (home: pets and outfits; pet library: every accessory too) ---------- */
  function dressingRoom(root, usePet) {
    const full = root.hasAttribute("data-full");
    const stagePet = root.querySelector(".dress-pet");
    const name = root.querySelector(".dress-name");
    const s = sprite(stagePet, byId(look.pet), 144, 156);
    const petsBox = root.querySelector(".dress-pets");
    const outfitsBox = root.querySelector(".dress-outfits");
    const itemsBox = root.querySelector(".dress-items");
    const group = `dress-${Math.random().toString(36).slice(2, 7)}`;
    for (const pet of DATA.pets) {
      const l = document.createElement("label");
      l.className = "pick-pet";
      l.innerHTML = '<input type="radio"><span class="thumb" aria-hidden="true"></span><b></b>';
      const r = l.querySelector("input");
      r.name = group;
      r.value = pet.id;
      l.querySelector("b").textContent = pet.name;
      paint(l.querySelector(".thumb"), pet, ROW.idle, 0, 54, 58);
      r.addEventListener("change", () => { setLook({ pet: pet.id }); s.play(ROW.wave, 1); });
      l.dataset.guide = `Dress ${pet.name} instead`;
      petsBox.append(l);
    }
    const chip = (label, ids, act) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.innerHTML = '<span class="icons" aria-hidden="true"></span><b></b>';
      b.querySelector("b").textContent = label;
      for (const id of ids) {
        const i = document.createElement("img");
        i.src = `wardrobe/${id}-icon.svg`;
        i.alt = "";
        b.querySelector(".icons").append(i);
      }
      b.addEventListener("click", act);
      return b;
    };
    const outfitBtns = [chip("Nothing", [], () => setLook({ worn: [] }))];
    outfitBtns[0].dataset.guide = "Takes everything off";
    for (const o of WARD.outfits) {
      const b = chip(o.name, o.items, () => { setLook({ worn: [...o.items] }); s.play(ROW.jump, 1); });
      b.dataset.guide = `Try on ${o.items.map((id) => WARD.items.find((i) => i.id === id)?.name.toLowerCase()).join(" and ")}`;
      outfitBtns.push(b);
    }
    outfitBtns.forEach((b) => outfitsBox.append(b));
    const itemBtns = [];
    if (full && itemsBox) {
      const LABEL = { head: "On the head", face: "On the face", neck: "Around the neck" };
      for (const slot of ["head", "face", "neck"]) {
        const f = document.createElement("fieldset");
        f.innerHTML = "<legend></legend>";
        f.querySelector("legend").textContent = LABEL[slot];
        for (const item of WARD.items.filter((i) => i.slot === slot)) {
          const b = chip(item.name, [item.id], () => {
            const on = look.worn.includes(item.id);
            setLook({ worn: on ? look.worn.filter((x) => x !== item.id) : [...look.worn.filter((x) => slotOf(x) !== slot), item.id] });
            if (!on) s.play(ROW.wave, 1);
          });
          b.dataset.item = item.id;
          b.dataset.guide = `Put on or take off the ${item.name.toLowerCase()}`;
          itemBtns.push(b);
          f.append(b);
        }
        itemsBox.append(f);
      }
    }
    const show = () => {
      const pet = byId(look.pet);
      if (s.pet !== pet) { s.use(pet); usePet?.(pet); }
      wear(stagePet, look.worn);
      placeGear(stagePet, pet, s.row, s.frame, 144);
      for (const r of petsBox.querySelectorAll("input")) r.checked = r.value === pet.id;
      const o = outfitOf(look.worn);
      outfitBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(i === 0 ? look.worn.length === 0 : o === WARD.outfits[i - 1])));
      for (const b of itemBtns) b.setAttribute("aria-pressed", String(look.worn.includes(b.dataset.item)));
      const things = look.worn.map((id) => WARD.items.find((i) => i.id === id)?.name.toLowerCase());
      name.textContent = `${pet.name}${o ? ` in the ${o.name} outfit` : things.length ? ` wearing ${things.join(", ")}` : ""}`;
    };
    lookers.add(show);
    usePet?.(byId(look.pet));
    show();
  }

  /* ---------- Pet library: search, cards, and a sheet with every move ---------- */
  const REACT = {
    "task-done": "finish a task", "task-added": "add a task", "task-started": "start a task", "task-deleted": "delete a task",
    "all-done": "finish everything", "focus-done": "finish a focus session", reminder: "a reminder rings",
  };
  const POSE = { jump: "jumps", wave: "waves", cheer: "cheers", party: "throws a party", type: "starts typing", ring: "rings a bell", toss: "does a toss", worried: "looks worried", sleep: "naps" };
  const MOVES = ["Idle", "Walks right", "Walks left", "Waves", "Jumps", "Types along"];
  function library() {
    const grid = $("#pet-grid");
    if (!grid) return;
    const sheet = $("#pet-sheet");
    let open = null;
    for (const pet of DATA.pets) {
      const li = document.createElement("li");
      li.className = "pet-tile";
      li.dataset.search = `${pet.name} ${pet.kind}`.toLowerCase();
      li.innerHTML = '<button type="button"><span class="tile-stage"><span class="sprite-lg" aria-hidden="true"></span></span><b></b><small></small><q></q></button>';
      li.querySelector("b").textContent = pet.name;
      li.querySelector("small").textContent = pet.kind;
      li.querySelector("q").textContent = pet.special;
      const btn = li.querySelector("button");
      btn.setAttribute("aria-label", `${pet.name}, ${pet.kind}. Open to see every move.`);
      btn.dataset.guide = `Open ${pet.name}: every move and reaction`;
      const s = sprite(li.querySelector(".sprite-lg"), pet, 144, 156);
      li.addEventListener("pointerenter", () => s.play(ROW.wave, 1));
      btn.addEventListener("click", () => openSheet(pet));
      grid.append(li);
    }
    const soon = document.createElement("li");
    soon.className = "pet-tile soon";
    soon.innerHTML = '<div><span class="tile-stage"><span class="soon-mark" aria-hidden="true">+</span></span><b>More soon</b><small>new friends are on the way</small></div>';
    grid.append(soon);
    const count = $("#pet-count");
    const none = $("#pet-none");
    const filter = (q) => {
      let n = 0;
      for (const li of grid.querySelectorAll(".pet-tile:not(.soon)")) { const hit = li.dataset.search.includes(q); li.hidden = !hit; n += hit; }
      soon.hidden = Boolean(q);
      none.hidden = n > 0;
      count.textContent = q ? `${n} of ${DATA.pets.length} pets` : `${DATA.pets.length} pets`;
    };
    $("#pet-search")?.addEventListener("input", (e) => filter(e.target.value.trim().toLowerCase()));
    filter("");

    // The sheet: every move animated side by side, the reactions, and the special.
    const poses = $("#sheet-poses");
    const posers = MOVES.map((label, row) => {
      const li = document.createElement("li");
      li.innerHTML = '<span class="sprite-md" aria-hidden="true"></span><small></small>';
      li.querySelector("small").textContent = label;
      poses.append(li);
      const s = sprite(li.querySelector(".sprite-md"), DATA.pets[0], 96, 104);
      s.rest(row);
      return s;
    });
    const top = sprite(sheet.querySelector(".sheet-pet"), DATA.pets[0], 144, 156);
    function openSheet(pet) {
      open = pet;
      $("#sheet-h").textContent = pet.name;
      $("#sheet-kind").textContent = pet.kind;
      $("#sheet-special b").textContent = pet.specialName ? `${pet.specialName}:` : "";
      $("#sheet-special q").textContent = pet.special;
      const ul = $("#sheet-reacts");
      ul.textContent = "";
      for (const [when, pose] of Object.entries(pet.reactions || {})) {
        const r = document.createElement("li");
        r.textContent = `When you ${REACT[when] || when.replace("-", " ")}, it ${POSE[pose] || pose}.`;
        ul.append(r);
      }
      top.use(pet);
      posers.forEach((s, row) => { s.use(pet); s.rest(row); });
      if (sheet.showModal) sheet.showModal(); else sheet.setAttribute("open", "");
      top.play(ROW.wave);
    }
    const close = () => { if (sheet.close) sheet.close(); else sheet.removeAttribute("open"); };
    sheet.querySelector(".sheet-close").addEventListener("click", close);
    sheet.addEventListener("click", (e) => { if (e.target === sheet) close(); });
    $("#sheet-dress")?.addEventListener("click", () => {
      close();
      setLook({ pet: open.id });
      $("#dress")?.scrollIntoView({ behavior: still.matches ? "auto" : "smooth" });
    });
    $("#sheet-guide")?.addEventListener("click", () => { setLook({ pet: open.id }); guideOn(true); close(); });
  }

  /* ---------- The guide: a pet that follows your pointer and says what things do ---------- */
  // Only with a mouse or trackpad and when motion is allowed. It sits below and to the side of the
  // pointer and never takes clicks (pointer-events: none), so it can't cover what you click. It can
  // be switched off, and wears the look from the dressing room.
  const GUIDE_KEY = "pluto-site-guide";
  let guideOn = () => {};
  const PLACES = {
    "index.html": "Home: the whole story", "features.html": "Everything Pluto does", "characters.html": "The pet library and dressing room",
    "assistants.html": "Pluto with your coding assistant", "pricing.html": "Free today, AI coming soon", "privacy.html": "Exactly what Pluto stores",
    "download.html": "How to install Pluto",
  };
  function guideText(el) {
    if (el.dataset.guide) return el.dataset.guide;
    if (el.dataset.os) return `Downloads Pluto for ${el.dataset.os === "mac" ? "macOS" : "Windows"}`;
    if (el.closest("#colours")) return "Changes this page's colour, like in the app";
    const href = el.getAttribute?.("href");
    if (href) {
      const page = href.split("#")[0];
      if (PLACES[page]) return PLACES[page];
      if (href.startsWith("#")) return "Jumps down this page";
    }
    if (el.matches('input[type="checkbox"]') || el.closest("label")?.querySelector('input[type="checkbox"]')) return "Tick it. I'll jump.";
    if (el.matches("button.x")) return "Removes this task";
    if (el.matches("summary")) return "Opens the answer";
    // Otherwise only say a name the visitor can't already read (an icon button's label).
    const label = (el.getAttribute("aria-label") || "").trim();
    const seen = (el.textContent || "").trim();
    return label && !seen && label.length < 44 ? label : "";
  }
  function guide() {
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches || still.matches) return;
    const state = { on: true };
    try { Object.assign(state, JSON.parse(localStorage.getItem(GUIDE_KEY) || "{}")); } catch { /* default on */ }
    const save = () => { try { localStorage.setItem(GUIDE_KEY, JSON.stringify(state)); } catch { /* not remembered */ } };

    const g = document.createElement("div");
    g.className = "guide";
    g.setAttribute("aria-hidden", "true");
    g.innerHTML = '<p class="guide-say"></p><span class="guide-pet"></span>';
    document.body.append(g);
    const petEl = g.querySelector(".guide-pet");
    const sayEl = g.querySelector(".guide-say");
    const s = sprite(petEl, byId(look.pet), 72, 78);
    const dressUp = () => { s.use(byId(look.pet)); wear(petEl, look.worn); placeGear(petEl, s.pet, s.row, s.frame, 72); };
    lookers.add(dressUp);
    dressUp();

    // The dock: switch the guide off or on, and pick who it is.
    const dock = document.createElement("div");
    dock.className = "guide-dock";
    dock.innerHTML = '<button type="button" class="dock-btn" aria-expanded="false" aria-controls="guide-menu"><span class="dock-thumb" aria-hidden="true"></span><b>Guide</b></button><div class="dock-menu" id="guide-menu" hidden><p class="dock-title">Your guide</p><button type="button" class="dock-switch" role="switch"></button><p class="dock-sub">Who follows your pointer</p><div class="dock-pets"></div><p class="dock-note"><a href="characters.html#dress">Dress it up</a> in the dressing room.</p></div>';
    document.body.append(dock);
    const btn = dock.querySelector(".dock-btn");
    const menu = dock.querySelector(".dock-menu");
    const sw = dock.querySelector(".dock-switch");
    const thumb = dock.querySelector(".dock-thumb");
    const petBtns = DATA.pets.map((pet) => {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = '<span aria-hidden="true"></span>';
      b.setAttribute("aria-label", pet.name);
      b.title = pet.name;
      paint(b.querySelector("span"), pet, ROW.idle, 0, 48, 52);
      b.addEventListener("click", () => { setLook({ pet: pet.id }); guideOn(true); s.play(ROW.wave, 1); });
      dock.querySelector(".dock-pets").append(b);
      return b;
    });
    const sync = () => {
      document.documentElement.classList.toggle("guided", state.on);
      sw.setAttribute("aria-checked", String(state.on));
      sw.textContent = state.on ? "On: it follows your pointer" : "Off: it stays put";
      petBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(DATA.pets[i].id === look.pet)));
      paint(thumb, byId(look.pet), ROW.idle, 0, 32, 35);
    };
    lookers.add(sync);
    guideOn = (on) => { state.on = on; save(); sync(); if (!on) g.classList.remove("show"); };
    sw.addEventListener("click", () => guideOn(!state.on));
    const setMenu = (open) => { menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", () => setMenu(menu.hidden));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { setMenu(false); btn.focus(); } });
    document.addEventListener("pointerdown", (e) => { if (!dock.contains(e.target)) setMenu(false); });
    sync();

    // Follow the pointer with a soft lag, facing the way it walks.
    const pos = { x: -200, y: -200 }, aim = { x: -200, y: -200 };
    let inside = false, last = 0, saidFor = null, sayTimer = 0;
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      const left = e.clientX > innerWidth - 320;
      g.classList.toggle("flip", left);
      aim.x = e.clientX + (left ? -96 : 22);
      aim.y = Math.min(innerHeight - 84, e.clientY + 20);
      if (!inside) { pos.x = aim.x; pos.y = aim.y; inside = true; }
      if (state.on) g.classList.add("show");
    }, { passive: true });
    document.addEventListener("pointerleave", () => { inside = false; g.classList.remove("show"); });
    const TARGETS = 'a, button, summary, input, select, textarea, [role="tab"], [data-guide], label';
    document.addEventListener("pointerover", (e) => {
      if (!state.on) return;
      const el = e.target.closest?.(TARGETS);
      g.classList.toggle("over", Boolean(el) && !dock.contains(el));
      if (!el || el === saidFor || dock.contains(el)) return;
      saidFor = el;
      const text = guideText(el);
      if (!text) return;
      sayEl.textContent = text;
      g.classList.add("talk");
      clearTimeout(sayTimer);
      sayTimer = setTimeout(() => g.classList.remove("talk"), 2400);
      if (el.matches(".btn, [data-os]")) s.play(ROW.wave, 1);
    });
    document.addEventListener("pointerout", (e) => {
      if (saidFor && !saidFor.contains(e.relatedTarget)) { saidFor = null; g.classList.remove("talk"); }
    });
    document.addEventListener("click", (e) => { if (state.on && e.target.closest?.("a, button") && !dock.contains(e.target)) s.play(ROW.jump, 1); });
    let row = ROW.idle;
    function step(now) {
      requestAnimationFrame(step);
      const dt = Math.min(64, now - (last || now));
      last = now;
      if (!state.on || !inside) return;
      const f = 1 - Math.exp(-dt / 140);
      const dx = (aim.x - pos.x) * f;
      pos.x += dx;
      pos.y += (aim.y - pos.y) * f;
      const fast = Math.abs(dx) / Math.max(1, dt) > 0.12;
      const want = fast ? (dx > 0 ? ROW.right : ROW.left) : ROW.idle;
      if (want !== row) { row = want; s.rest(row); }
      g.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`;
    }
    requestAnimationFrame(step);
  }

  /* ---------- Menu (narrow windows) ---------- */
  const menuBtn = $(".menu-btn");
  if (menuBtn) {
    const top = $(".top");
    const setOpen = (open) => { top.classList.toggle("open", open); menuBtn.setAttribute("aria-expanded", String(open)); };
    menuBtn.addEventListener("click", () => setOpen(!top.classList.contains("open")));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && top.classList.contains("open")) { setOpen(false); menuBtn.focus(); } });
    $("#site-nav")?.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  }

  function extras() {
    const moon = $(".moon-sprite");
    if (moon) paint(moon, DATA.pets[0], ROW.wave, 1, 72, 78);
    const mini = $(".mini-pet");
    if (mini) paint(mini, DATA.pets[0], ROW.wave, 1, 72, 78);
    const fin = $(".finale-pet");
    if (fin) {
      const s = sprite(fin, DATA.pets[0], 144, 156);
      if (!still.matches) setInterval(() => { if (s.on) s.play(ROW.wave); }, 5200);
    }
    for (const el of $$("[data-pet]")) sprite(el, byId(el.dataset.pet), 144, 156);
  }

  Promise.all([fetch("pets/pets.json").then((r) => r.json()), fetch("wardrobe/wardrobe.json").then((r) => r.json())])
    .then(([d, w]) => {
      DATA = d;
      WARD = w;
      if (!DATA.pets.some((p) => p.id === look.pet)) look.pet = DATA.pets[0].id;
      look.worn = normalize(Array.isArray(look.worn) ? look.worn : []);
      heroBear();
      scatterScene();
      dayScene();
      const usePet = demo();
      for (const room of $$("[data-dress]")) dressingRoom(room, usePet);
      library();
      extras();
      guide();
      onScroll();
    })
    .catch(() => { document.documentElement.classList.add("no-pets"); });
  onScroll();
})();
