// Pluto, drawn live in WebGL, and the orbit scene it sits in.
// No library: one fragment shader ray-traces two spheres (Pluto and Charon) and paints them from
// noise. The surface is a sketch of the real one (New Horizons, 2015): tan plains, the bright heart
// (Tombaugh Regio), the dark reddish-brown belt along the equator, a blue haze ring around the limb,
// and Charon's red north pole. As you scroll through the scene, Pluto turns, the Sun comes round
// from behind it, and the five parts of the app orbit it as moons.
const still = matchMedia("(prefers-reduced-motion: reduce)");
const small = matchMedia("(max-width: 720px)");
const section = document.querySelector("#orbit");
const canvas = section?.querySelector("canvas");

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uSpin;
uniform vec3 uLight;
uniform float uCharon;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

vec3 plutoSurface(vec3 q) {
  float n = fbm(q * 3.2);
  float fine = fbm(q * 11.0 + 7.0);
  vec3 tan = vec3(0.80, 0.64, 0.50);
  vec3 tholin = vec3(0.36, 0.18, 0.13);
  vec3 ice = vec3(0.93, 0.89, 0.85);
  vec3 col = mix(tan * 0.82, tan * 1.08, n);
  float lat = asin(clamp(q.y, -1.0, 1.0));
  float belt = smoothstep(0.62, 0.12, abs(lat + 0.08)) * smoothstep(0.42, 0.6, n + 0.18 * fine);
  col = mix(col, tholin, belt * 0.92);
  // The heart: the classic curve (x^2 + y^2 - 1)^3 - x^2 y^3 < 0 laid on the surface, edges roughened.
  vec3 c = normalize(vec3(0.0, 0.28, 1.0));
  vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), c));
  vec3 e2 = cross(c, e1);
  float x = dot(q, e1) / 0.44 + 0.12 * (n - 0.5);
  float y = dot(q, e2) / 0.44 + 0.12 * (fine - 0.5);
  float k = x * x + y * y - 1.0;            // cubed by hand: pow() is undefined for k < 0
  float h = k * k * k - x * x * y * y * y;
  float heart = (1.0 - smoothstep(-0.03, 0.04, h)) * step(0.2, dot(q, c));
  col = mix(col, ice * (0.93 + 0.07 * fine), heart);
  col = mix(col, ice * 0.88, smoothstep(0.78, 1.0, q.y) * 0.55);
  return col * (0.9 + 0.18 * fine);
}

vec3 charonSurface(vec3 q) {
  float n = fbm(q * 5.0 + 3.0);
  vec3 col = mix(vec3(0.52, 0.52, 0.54), vec3(0.72, 0.71, 0.70), n);
  return mix(col, vec3(0.45, 0.24, 0.17), smoothstep(0.6, 0.9, q.y) * 0.85); // Mordor Macula
}

vec3 lit(vec3 albedo, vec3 n) {
  float d = dot(n, normalize(uLight));
  float day = smoothstep(-0.12, 0.55, d);
  return albedo * (0.05 + 0.97 * day) + vec3(0.015, 0.02, 0.035);
}

void main() {
  float hs = 0.5 * min(uRes.x, uRes.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / hs;
  float px = 1.5 / hs;
  vec3 L = normalize(uLight);
  vec3 haze = vec3(0.55, 0.70, 0.98);
  const float R = 0.66;

  vec4 col = vec4(0.0);

  // Charon on a tilted orbit; behind Pluto for half of it.
  vec2 cc = vec2(cos(uCharon) * 0.92, sin(uCharon) * 0.2 + 0.05);
  float cz = -sin(uCharon);
  float cr = 0.105;
  vec2 dc = (uv - cc) / cr;
  float rc = length(dc);
  vec4 charon = vec4(0.0);
  if (rc < 1.0 + px / cr) {
    vec3 nc = vec3(dc, sqrt(max(0.0, 1.0 - rc * rc)));
    vec3 a = charonSurface(rotY(uSpin * 0.6) * nc);
    charon = vec4(lit(a, nc), 1.0 - smoothstep(1.0 - px / cr, 1.0, rc));
  }

  // Pluto
  float r = length(uv) / R;
  vec4 pluto = vec4(0.0);
  float back = max(0.0, -L.z);
  float side = 0.5 + 0.5 * dot(normalize(uv + 1e-5), normalize(L.xy + 1e-5));
  if (r < 1.0 + px / R) {
    vec3 n = vec3(uv / R, sqrt(max(0.0, 1.0 - r * r)));
    vec3 q = rotY(uSpin) * rotX(-0.3) * n;
    vec3 c = lit(plutoSurface(q), n);
    float limb = pow(1.0 - n.z, 3.0);
    c += haze * limb * (0.25 + 0.9 * back) * side;
    pluto = vec4(c, 1.0 - smoothstep(1.0 - px / R, 1.0, r));
  }
  // The blue haze ring, brightest when the Sun is behind Pluto.
  float ring = 0.0;
  if (r > 0.98) ring = exp(-(r - 1.0) * 26.0) * (0.18 + 0.85 * back) * mix(0.35, 1.0, side);

  // Back to front: Charon behind, haze, Pluto, Charon in front.
  if (cz < 0.0) col = charon;
  col.rgb = col.rgb * (1.0 - ring) + haze * ring;
  col.a = max(col.a, ring);
  col = vec4(mix(col.rgb, pluto.rgb, pluto.a), max(col.a, pluto.a));
  if (cz >= 0.0) col = vec4(mix(col.rgb, charon.rgb, charon.a), max(col.a, charon.a));
  gl_FragColor = vec4(col.rgb * col.a, col.a);
}`;

function setup(c) {
  const gl = c.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n) => gl.getUniformLocation(prog, n);
  return { gl, res: u("uRes"), spin: u("uSpin"), light: u("uLight"), charon: u("uCharon") };
}

const clamp = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => t * t * (3 - 2 * t);

if (section && canvas) {
  let g = null;
  try { g = setup(canvas); } catch (e) { console.warn("Pluto planet: falling back to a still image.", e); g = null; }
  if (!g) section.classList.add("no-gl");

  const moons = [...section.querySelectorAll(".moon")];
  const intro = section.querySelector(".orbit-intro");
  let progress = still.matches ? 1 : 0;
  let visible = false;
  let start = performance.now();

  function size() {
    if (!g) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function measure() {
    if (still.matches) { progress = 1; return; }
    const r = section.getBoundingClientRect();
    progress = clamp(-r.top / Math.max(1, r.height - innerHeight));
  }

  function frame(now) {
    const p = progress;
    const t = still.matches ? 0 : (now - start) / 1000;
    // The scene: Pluto grows and turns, the Sun swings round from behind, Charon circles.
    const grow = ease(clamp(p / 0.6));
    section.style.setProperty("--grow", String(0.62 + 0.38 * grow));
    if (intro) intro.style.opacity = String(1 - clamp((p - 0.08) / 0.12));
    if (g) {
      size();
      const { gl } = g;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(g.res, canvas.width, canvas.height);
      gl.uniform1f(g.spin, -2.0 + 2.1 * ease(clamp(p / 0.85)) + t * 0.03);
      const th = Math.PI * (0.88 - 0.58 * ease(clamp(p / 0.7)));
      gl.uniform3f(g.light, -Math.sin(th) * 0.8, 0.35, Math.cos(th));
      gl.uniform1f(g.charon, 2.2 + p * 5.0 + t * 0.12);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // The five parts orbit as moons and arrive one by one; behind Pluto they dim.
    const narrow = small.matches;
    moons.forEach((m, i) => {
      const show = still.matches ? 1 : clamp((p - 0.18 - i * 0.09) / 0.08);
      if (narrow) { m.style.opacity = String(show); return; } // a list under Pluto on phones
      const a = (i / moons.length) * Math.PI * 2 + p * Math.PI * 1.15 - 0.9;
      const front = Math.sin(a);
      m.style.setProperty("--x", (Math.cos(a) * 0.37).toFixed(4));
      m.style.setProperty("--y", (front * 0.16).toFixed(4));
      m.style.setProperty("--depth", front.toFixed(3));
      m.style.opacity = String(show * (front < 0 ? 0.45 : 1));
      m.style.zIndex = front < 0 ? "1" : "3";
    });
  }

  let raf = 0;
  function loop(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    measure();
    frame(now);
    if (!still.matches) raf = requestAnimationFrame(loop);
  }
  function wake() { if (!raf) raf = requestAnimationFrame(loop); }

  new IntersectionObserver((es) => {
    visible = es.some((e) => e.isIntersecting);
    if (visible) { start = performance.now() - 2000; wake(); }
  }, { rootMargin: "200px" }).observe(section);
  addEventListener("resize", wake, { passive: true });
  document.addEventListener("visibilitychange", wake);
  still.addEventListener?.("change", () => { measure(); wake(); });
  // A still frame straight away, so the scene is never blank.
  measure();
  frame(performance.now());
}
