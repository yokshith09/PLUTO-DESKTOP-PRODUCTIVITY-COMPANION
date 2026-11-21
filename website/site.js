// Pluto website: colours, scroll motion, the pets (hero, demo, day story, shelf, gallery), the
// "your day is everywhere" scene and the feature tabs. One script for every page: each part runs
// only if its element is on the page. Sprites come from scripts/site-pets.py
// (rows: idle, running-right, running-left, waving, jumping, running = typing).
(() => {
  "use strict";

  const ROW = { idle: 0, right: 1, left: 2, wave: 3, jump: 4, type: 5 };
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

  /* ---------- Try it: the demo pet walks on the Today window ---------- */
  function demo() {
    const stage = $("#stage");
    const petEl = $("#pet");
    const bubble = $("#bubble");
    const list = $("#tasks");
    if (!stage || !petEl || !bubble || !list) return null;
    const W = 120, H = 130;
    const hero = { pet: null, x: 0, target: 0, row: ROW.idle, frame: 0, once: null, nextWalk: 0, clock: 0 };
    let bubbleTimer = 0;
    const say = (text) => {
      bubble.textContent = text;
      bubble.classList.add("on");
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble.classList.remove("on"), 2600);
    };
    const place = () => {
      petEl.style.transform = `translateX(${Math.round(hero.x)}px)`;
      const max = Math.max(0, stage.clientWidth - bubble.offsetWidth);
      bubble.style.left = `${Math.min(max, Math.max(0, hero.x - 10))}px`;
    };
    const frames = (row) => hero.pet.frames[row];
    const react = (row, text, times = 2) => { hero.row = row; hero.frame = 0; hero.once = frames(row) * times; hero.target = hero.x; if (text) say(text); };
    const width = () => Math.max(0, stage.clientWidth - W);
    const planWalk = (now) => { hero.nextWalk = now + 2500 + Math.random() * 4500; };
    let visible = true;
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }).observe(stage);
    let last = 0;
    function tick(now) {
      requestAnimationFrame(tick);
      if (!hero.pet || document.hidden || !visible) { last = now; return; }
      const dt = Math.min(100, now - (last || now));
      last = now;
      const moving = hero.row === ROW.right || hero.row === ROW.left;
      hero.clock += dt;
      if (hero.clock >= 1000 / (moving || hero.once ? 10 : 6)) {
        hero.clock = 0;
        if (still.matches && !moving) {
          hero.frame = 0;
          if (hero.once) { hero.once -= frames(hero.row); if (hero.once <= 0) { hero.once = null; hero.row = ROW.idle; } }
        } else {
          hero.frame = (hero.frame + 1) % frames(hero.row);
          if (hero.once != null && --hero.once <= 0) { hero.once = null; hero.row = ROW.idle; hero.frame = 0; planWalk(now); }
        }
      }
      if (moving) {
        const dir = Math.sign(hero.target - hero.x);
        hero.x += dir * dt * 0.075;
        if (dir === 0 || Math.sign(hero.target - hero.x) !== dir) { hero.x = hero.target; hero.row = ROW.idle; hero.frame = 0; planWalk(now); }
      } else if (!hero.once && !still.matches && now > hero.nextWalk && width() > 60) {
        hero.target = Math.round(Math.random() * width());
        if (Math.abs(hero.target - hero.x) > 40) { hero.row = hero.target > hero.x ? ROW.right : ROW.left; hero.frame = 0; } else planWalk(now);
      }
      hero.x = Math.min(hero.x, width());
      paint(petEl, hero.pet, hero.row, hero.frame, W, H);
      place();
    }
    const use = (pet, greet) => {
      hero.pet = pet;
      petEl.setAttribute("aria-label", `${pet.name} ${pet.kind}. Click to say hello.`);
      paint(petEl, pet, ROW.idle, 0, W, H);
      if (greet) react(ROW.wave, `Hi, I'm ${pet.name}.`);
    };
    petEl.addEventListener("click", () => react(ROW.wave, `Hi, I'm ${hero.pet.name}.`));
    const CHEERS = ["Nice one.", "One less thing.", "Look at you go.", "Done and done."];
    let cheer = 0;
    list.addEventListener("change", (e) => {
      if (!e.target.matches('input[type="checkbox"]') || !e.target.checked || !hero.pet) return;
      const all = [...list.querySelectorAll('input[type="checkbox"]')].every((c) => c.checked);
      react(ROW.jump, all ? "All done for today!" : CHEERS[cheer++ % CHEERS.length], all ? 3 : 2);
    });
    $("#add")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#new-task");
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      const li = document.createElement("li");
      li.className = "new";
      li.innerHTML = '<label><input type="checkbox"><span></span></label>';
      li.querySelector("span").textContent = text;
      list.append(li);
      if (list.children.length > 6) list.firstElementChild.remove();
      input.value = "";
      if (hero.pet) react(ROW.wave, "Got it. Added to today.");
    });
    use(DATA.pets[0], false);
    hero.x = Math.round(width() * 0.62);
    planWalk(performance.now());
    requestAnimationFrame(tick);
    return use;
  }

  /* ---------- Shelf (home) and gallery (characters page) ---------- */
  function shelf(usePet) {
    const el = $("#shelf");
    if (!el) return;
    for (const pet of DATA.pets) {
      const li = document.createElement("li");
      li.innerHTML = '<button type="button"><span class="sprite" aria-hidden="true"></span><b></b><small></small><q></q></button>';
      const btn = li.querySelector("button");
      btn.setAttribute("aria-pressed", String(pet.id === DATA.pets[0].id));
      btn.setAttribute("aria-label", `${pet.name}, ${pet.kind}`);
      li.querySelector("b").textContent = pet.name;
      li.querySelector("small").textContent = pet.kind;
      li.querySelector("q").textContent = pet.special;
      el.append(li);
    }
    const soon = document.createElement("li");
    soon.className = "soon";
    soon.innerHTML = '<div><span class="sprite" aria-hidden="true"></span><b>More soon</b><small>new friends are on the way</small></div>';
    el.append(soon);
    let ready = false;
    const show = () => {
      if (ready) return;
      ready = true;
      DATA.pets.forEach((p, i) => {
        const li = el.children[i];
        const s = sprite(li.querySelector(".sprite"), p, 96, 104);
        li.querySelector("button").addEventListener("click", () => {
          for (const b of el.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === li.querySelector("button")));
          usePet?.(p, true);
          s.play(ROW.wave);
        });
        // Each pet hops onto the shelf in turn.
        if (!still.matches) setTimeout(() => { li.querySelector(".sprite").classList.add("hop"); s.play(ROW.jump, 1); }, 150 + i * 140);
      });
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { show(); io.disconnect(); } }, { rootMargin: "200px" });
      io.observe(el);
    } else show();
  }

  const REACT = {
    "task-done": "finish a task", "task-added": "add a task", "task-started": "start a task", "task-deleted": "delete a task",
    "all-done": "finish everything", "focus-done": "finish a focus session", reminder: "a reminder rings",
  };
  const POSE = { jump: "jumps", wave: "waves", cheer: "cheers", party: "throws a party", type: "starts typing", ring: "rings a bell", toss: "does a toss", worried: "looks worried", sleep: "naps" };
  function gallery() {
    const el = $("#gallery");
    if (!el) return;
    for (const pet of DATA.pets) {
      const li = document.createElement("li");
      li.className = "pet-card";
      li.setAttribute("data-reveal", "");
      li.innerHTML = '<div class="pet-stage"><button type="button" class="sprite-xl"></button></div><div class="pet-text"><h2></h2><p class="kind"></p><ul class="reacts"></ul><p class="special"><b></b> <q></q></p></div>';
      li.querySelector("h2").textContent = pet.name;
      li.querySelector(".kind").textContent = pet.kind;
      const ul = li.querySelector(".reacts");
      for (const [when, pose] of Object.entries(pet.reactions || {})) {
        const r = document.createElement("li");
        r.textContent = `When you ${REACT[when] || when.replace("-", " ")}, it ${POSE[pose] || pose}.`;
        ul.append(r);
      }
      li.querySelector(".special b").textContent = pet.specialName ? `${pet.specialName}:` : "";
      li.querySelector(".special q").textContent = pet.special;
      const btn = li.querySelector("button");
      btn.setAttribute("aria-label", `${pet.name}, ${pet.kind}. Click to see it wave.`);
      el.append(li);
      const s = sprite(btn, pet, 144, 156);
      btn.addEventListener("click", () => s.play(ROW.wave));
      li.addEventListener("pointerenter", () => s.play(ROW.jump, 1));
      li.classList.add("in");
    }
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

  fetch("pets/pets.json")
    .then((r) => r.json())
    .then((d) => {
      DATA = d;
      heroBear();
      scatterScene();
      dayScene();
      const usePet = demo();
      shelf(usePet);
      gallery();
      extras();
      onScroll();
    })
    .catch(() => { document.documentElement.classList.add("no-pets"); });
  onScroll();
})();
