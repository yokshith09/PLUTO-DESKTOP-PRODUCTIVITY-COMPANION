// Pluto website: the live pet in the hero, the feature tabs and the character shelf.
// Sprites come from scripts/site-pets.py (rows: idle, running-right, running-left, waving, jumping).
(() => {
  "use strict";

  const ROW = { idle: 0, right: 1, left: 2, wave: 3, jump: 4 };
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const $ = (s) => document.querySelector(s);

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
  document.querySelector("#colours")?.addEventListener("change", (e) => {
    setColour(e.target.value);
    try { localStorage.setItem(KEY, e.target.value); } catch { /* not remembered, still applied */ }
  });

  /* ---------- Scroll motion (off when the visitor asks for less motion) ---------- */
  // [data-scroll] gets --p from 0 (just entering) to 1 (well in view); [data-reveal] eases in once.
  if (!still.matches) document.documentElement.classList.add("motion");
  const scrolled = [...document.querySelectorAll("[data-scroll]")];
  let ticking = false;
  function onScroll() {
    ticking = false;
    const vh = innerHeight;
    for (const el of scrolled) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const p = still.matches ? 1 : Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.65)));
      el.style.setProperty("--p", p.toFixed(3));
    }
  }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  onScroll();
  const reveals = [...document.querySelectorAll("[data-reveal]")];
  if ("IntersectionObserver" in window && !still.matches) {
    const ro = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); }
    }, { rootMargin: "0px 0px -12% 0px" });
    reveals.forEach((el, i) => { el.style.setProperty("--i", String(i % 3)); ro.observe(el); });
  } else reveals.forEach((el) => el.classList.add("in"));

  /* ---------- Download buttons: the visitor's own system first ---------- */
  if (/Mac/i.test(navigator.platform || navigator.userAgent)) {
    const win = document.querySelector('[data-os="windows"]');
    const mac = document.querySelector('[data-os="mac"]');
    if (win && mac) {
      win.classList.add("btn-quiet");
      mac.classList.remove("btn-quiet");
      mac.parentNode.insertBefore(mac, win);
    }
  }

  /* ---------- Feature tabs ---------- */
  const PARTS = {
    focus: ["Today, in one view", "The task you're on, what comes next, and a focus timer that the pet keeps beside you. Missed things wait for you here instead of disappearing.", "today", "Pluto's Today overview: the current task, today's tasks and reminders, and total time by app and website."],
    track: ["See where the day went", "Time by app and by website, without starting a timer. A month calendar shows each day at a glance, and tracking pauses when you step away.", "time", "Pluto's Time page: total time, the most used app, and a month calendar of tracked hours."],
    notes: ["Notes that stay close", "Write a quick note or open the full editor. Pin the important ones, add labels, and find anything with search.", "notes", "Pluto's Notes page with pinned notes, labels and search."],
    projects: ["Tasks, grouped by project", "Due dates, priorities, reminders and repeats. The next seven days, the whole month, or just what you missed.", "tasks", "Pluto's Tasks page with a list of tasks and the next seven days."],
    companion: ["A friend at the edge of the screen", "Pick a character, its size and how see-through it is. It steps aside by itself when a game, film or presentation fills the screen.", "character", "Pluto's Character page: the bear, with settings for size, opacity and hiding in full screen."],
  };
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panel = $("#p-world");
  const img = $("#panel-img");
  function choose(tab, focus) {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    }
    if (focus) tab.focus();
    const [h, p, shot, alt] = PARTS[tab.dataset.tab];
    panel.setAttribute("aria-labelledby", tab.id);
    $("#panel-h").textContent = h;
    $("#panel-p").textContent = p;
    const src = `shots/${shot}.webp`;
    if (img.getAttribute("src") === src) return;
    if (still.matches) { img.src = src; img.alt = alt; return; }
    img.classList.add("swap");
    const next = new Image();
    next.src = src;
    next.decode().catch(() => {}).finally(() => { img.src = src; img.alt = alt; img.classList.remove("swap"); });
  }
  tabs.forEach((t, i) => {
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
  function paint(el, pet, row, frame, w, h) {
    el.style.backgroundImage = `url("pets/${pet.id}.webp")`;
    el.style.backgroundSize = `${w * 8}px ${h * DATA.rows.length}px`;
    el.style.backgroundPosition = `${-frame * w}px ${-row * h}px`;
  }

  /* ---------- The hero pet ---------- */
  const stage = $("#stage");
  const petEl = $("#pet");
  const bubble = $("#bubble");
  const W = 120, H = 130;
  const hero = { pet: null, x: 0, target: 0, row: ROW.idle, frame: 0, once: null, until: 0, nextWalk: 0, clock: 0 };
  let bubbleTimer = 0;

  function say(text) {
    bubble.textContent = text;
    bubble.classList.add("on");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove("on"), 2600);
  }
  function place() {
    petEl.style.transform = `translateX(${Math.round(hero.x)}px)`;
    const max = Math.max(0, stage.clientWidth - bubble.offsetWidth);
    bubble.style.transform = "";
    bubble.style.left = `${Math.min(max, Math.max(0, hero.x - 10))}px`;
  }
  function frames(row) { return hero.pet.frames[row]; }
  function react(row, text, times = 2) {
    hero.row = row; hero.frame = 0;
    hero.once = frames(row) * times;
    hero.target = hero.x;
    if (text) say(text);
  }
  function width() { return Math.max(0, stage.clientWidth - W); }
  function planWalk(now) { hero.nextWalk = now + 2500 + Math.random() * 4500; }

  let last = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (!hero.pet || document.hidden) { last = now; return; }
    const dt = Math.min(100, now - (last || now));
    last = now;
    const moving = hero.row === ROW.right || hero.row === ROW.left;
    hero.clock += dt;
    const fps = moving || hero.once ? 10 : 6;
    if (hero.clock >= 1000 / fps) {
      hero.clock = 0;
      if (still.matches && !moving) {
        hero.frame = 0;                       // a held pose, no flip-book
        if (hero.once) { hero.once -= frames(hero.row); if (hero.once <= 0) { hero.once = null; hero.row = ROW.idle; } }
      } else {
        hero.frame = (hero.frame + 1) % frames(hero.row);
        if (hero.once != null && --hero.once <= 0) { hero.once = null; hero.row = ROW.idle; hero.frame = 0; planWalk(now); }
      }
    }
    if (moving) {
      const dir = Math.sign(hero.target - hero.x);
      hero.x += dir * dt * 0.075;
      if (dir === 0 || Math.sign(hero.target - hero.x) !== dir) {
        hero.x = hero.target; hero.row = ROW.idle; hero.frame = 0; planWalk(now);
      }
    } else if (!hero.once && !still.matches && now > hero.nextWalk && width() > 60) {
      hero.target = Math.round(Math.random() * width());
      if (Math.abs(hero.target - hero.x) > 40) { hero.row = hero.target > hero.x ? ROW.right : ROW.left; hero.frame = 0; }
      else planWalk(now);
    }
    hero.x = Math.min(hero.x, width());
    paint(petEl, hero.pet, hero.row, hero.frame, W, H);
    place();
  }

  function usePet(pet, greet) {
    hero.pet = pet;
    petEl.setAttribute("aria-label", `${pet.name} ${pet.kind}. Click to say hello.`);
    paint(petEl, pet, ROW.idle, 0, W, H);
    if (greet) react(ROW.wave, `Hi, I'm ${pet.name}.`);
  }

  petEl.addEventListener("click", () => react(ROW.wave, `Hi, I'm ${hero.pet.name}.`));

  const CHEERS = ["Nice one.", "One less thing.", "Look at you go.", "Done and done."];
  let cheer = 0;
  const list = $("#tasks");
  list.addEventListener("change", (e) => {
    if (!e.target.matches('input[type="checkbox"]') || !e.target.checked || !hero.pet) return;
    const all = [...list.querySelectorAll('input[type="checkbox"]')].every((c) => c.checked);
    react(ROW.jump, all ? "All done for today!" : CHEERS[cheer++ % CHEERS.length], all ? 3 : 2);
  });
  $("#add").addEventListener("submit", (e) => {
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

  /* ---------- The shelf ---------- */
  function buildShelf() {
    const shelf = $("#shelf");
    for (const pet of DATA.pets) {
      const li = document.createElement("li");
      li.innerHTML = '<button type="button"><span class="sprite" aria-hidden="true"></span><b></b><small></small><q></q></button>';
      const btn = li.querySelector("button");
      btn.dataset.id = pet.id;
      btn.setAttribute("aria-pressed", String(pet.id === hero.pet.id));
      btn.setAttribute("aria-label", `${pet.name}, ${pet.kind}`);
      li.querySelector("b").textContent = pet.name;
      li.querySelector("small").textContent = pet.kind;
      li.querySelector("q").textContent = pet.special;
      btn.addEventListener("click", () => {
        for (const b of shelf.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === btn));
        usePet(pet, true);
        wave(li.querySelector(".sprite"), pet);
      });
      shelf.append(li);
    }
    const soon = document.createElement("li");
    soon.className = "soon";
    soon.innerHTML = '<div><span class="sprite" aria-hidden="true"></span><b>More soon</b><small>new friends are on the way</small></div>';
    shelf.append(soon);
    const show = () => DATA.pets.forEach((p, i) => {
      const el = shelf.children[i].querySelector(".sprite");
      paint(el, p, ROW.idle, 0, 96, 104);
      // Each pet hops onto the shelf in turn (Jamm-style: the characters are the motion).
      if (!still.matches) setTimeout(() => { el.classList.add("hop"); play(el, p, ROW.jump, 1); }, 150 + i * 140);
    });
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { show(); io.disconnect(); } }, { rootMargin: "400px" });
      io.observe(shelf);
    } else show();
  }
  function play(el, pet, row, times) {
    if (still.matches) return;
    let f = 0;
    const n = pet.frames[row] * times;
    const t = setInterval(() => {
      paint(el, pet, f + 1 >= n ? ROW.idle : row, f + 1 >= n ? 0 : f % pet.frames[row], 96, 104);
      if (++f >= n) clearInterval(t);
    }, 100);
  }
  const wave = (el, pet) => play(el, pet, ROW.wave, 2);

  fetch("pets/pets.json")
    .then((r) => r.json())
    .then((d) => {
      DATA = d;
      usePet(d.pets[0], false);
      hero.x = Math.round(width() * 0.62);
      planWalk(performance.now());
      requestAnimationFrame(tick);
      buildShelf();
      const moon = document.querySelector(".moon-sprite");
      if (moon) paint(moon, d.pets[0], ROW.wave, 1, 72, 78);
      const mini = document.querySelector(".mini-pet");
      if (mini) paint(mini, d.pets[0], ROW.wave, 1, 72, 78);
    })
    .catch(() => { stage.hidden = true; });
})();
