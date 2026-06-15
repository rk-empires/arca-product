/* ============================================================
   Tester Pro — scroll-driven canvas experience
   Implements VIDEO TO WEBSITE.md §6a–6i
   ============================================================ */
gsap.registerPlugin(ScrollTrigger);

const FRAME_COUNT = 121;
const FRAME_SPEED = 2.0;     // product animation completes by ~50% scroll
const IMAGE_SCALE = 0.86;    // padded cover sweet spot
const framePath = (i) => `frames/frame_${String(i + 1).padStart(4, '0')}.webp`;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const canvasWrap = document.querySelector('.canvas-wrap');
const heroSection = document.querySelector('.hero-standalone');
const scrollContainer = document.getElementById('scroll-container');

const frames = new Array(FRAME_COUNT);
let currentFrame = 0;
let bgColor = '#000000';

/* ---------- 6a. Lenis smooth scroll ---------- */
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
});
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

/* ---------- canvas sizing (devicePixelRatio) ---------- */
function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  drawFrame(currentFrame);
}

/* ---------- 6c. canvas renderer — padded cover mode ---------- */
function sampleBgColor(img) {
  try {
    const s = document.createElement('canvas');
    s.width = s.height = 8;
    const sctx = s.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0, 8, 8);
    const d = sctx.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0, n = 0;
    // sample corners
    for (const idx of [0, 7, 56, 63]) {
      r += d[idx * 4]; g += d[idx * 4 + 1]; b += d[idx * 4 + 2]; n++;
    }
    bgColor = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  } catch (e) { /* keep last */ }
}

function drawFrame(index) {
  const img = frames[index];
  if (!img) return;
  const cw = canvas.width, ch = canvas.height;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const scale = Math.max(cw / iw, ch / ih) * IMAGE_SCALE;
  const dw = iw * scale, dh = ih * scale;
  const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
  if (index % 20 === 0) sampleBgColor(img);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, dx, dy, dw, dh);
}

/* ---------- 6b. frame preloader (two-phase) ---------- */
function loadImage(i) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { frames[i] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = framePath(i);
  });
}

const loaderEl = document.getElementById('loader');
const barEl = document.getElementById('loader-bar');
const pctEl = document.getElementById('loader-percent');

async function preload() {
  let loaded = 0;
  const bump = () => {
    loaded++;
    const p = Math.round((loaded / FRAME_COUNT) * 100);
    barEl.style.width = p + '%';
    pctEl.textContent = p + '%';
  };
  // phase 1 — first 10 for fast first paint
  const first = Math.min(10, FRAME_COUNT);
  for (let i = 0; i < first; i++) { await loadImage(i); bump(); }
  drawFrame(0);
  // phase 2 — remaining in background
  await Promise.all(
    Array.from({ length: FRAME_COUNT - first }, (_, k) => loadImage(first + k).then(bump))
  );
}

/* ---------- 6d. frame-to-scroll binding ---------- */
function initFrameBinding() {
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => {
      const accelerated = Math.min(self.progress * FRAME_SPEED, 1);
      const index = Math.min(Math.floor(accelerated * FRAME_COUNT), FRAME_COUNT - 1);
      if (index !== currentFrame) {
        currentFrame = index;
        requestAnimationFrame(() => drawFrame(currentFrame));
      }
    },
  });
}

/* ---------- 6i. circle-wipe hero reveal ---------- */
function initHeroTransition() {
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      heroSection.style.opacity = Math.max(0, 1 - p * 16);
      heroSection.style.pointerEvents = p > 0.05 ? 'none' : 'auto';
      const wipe = Math.min(1, Math.max(0, (p - 0.01) / 0.06));
      canvasWrap.style.clipPath = `circle(${wipe * 75}% at 50% 50%)`;
    },
  });
}

/* ---------- 6e. section animation system ---------- */
function buildTimeline(section) {
  const type = section.dataset.animation;
  const children = section.querySelectorAll(
    '.section-label, .section-heading, .section-body, .section-note, .cta-heading, .cta-sub, .cta-button, .stat'
  );
  const tl = gsap.timeline({ paused: true });
  switch (type) {
    case 'fade-up':
      tl.from(children, { y: 50, opacity: 0, stagger: 0.12, duration: 0.9, ease: 'power3.out' }); break;
    case 'slide-left':
      tl.from(children, { x: -80, opacity: 0, stagger: 0.14, duration: 0.9, ease: 'power3.out' }); break;
    case 'slide-right':
      tl.from(children, { x: 80, opacity: 0, stagger: 0.14, duration: 0.9, ease: 'power3.out' }); break;
    case 'scale-up':
      tl.from(children, { scale: 0.85, opacity: 0, stagger: 0.12, duration: 1.0, ease: 'power2.out' }); break;
    case 'rotate-in':
      tl.from(children, { y: 40, rotation: 3, opacity: 0, stagger: 0.1, duration: 0.9, ease: 'power3.out' }); break;
    case 'stagger-up':
      tl.from(children, { y: 60, opacity: 0, stagger: 0.15, duration: 0.8, ease: 'power3.out' }); break;
    case 'clip-reveal':
      tl.from(children, { clipPath: 'inset(100% 0 0 0)', opacity: 0, stagger: 0.15, duration: 1.2, ease: 'power4.inOut' }); break;
    default:
      tl.from(children, { y: 40, opacity: 0, stagger: 0.12, duration: 0.9, ease: 'power3.out' });
  }
  return tl;
}

function initSections() {
  const sections = [...document.querySelectorAll('.scroll-section')];
  const states = sections.map((section) => {
    const enter = parseFloat(section.dataset.enter);
    const leave = parseFloat(section.dataset.leave);
    const persist = section.dataset.persist === 'true';
    // position section at midpoint of its scroll range
    section.style.top = ((enter + leave) / 2) + '%';
    return { section, enter, leave, persist, tl: buildTimeline(section), played: false };
  });

  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress * 100;
      states.forEach((s) => {
        const inRange = p >= s.enter && p <= s.leave;
        const past = p > s.leave;
        if (inRange) {
          if (!s.played) { s.tl.play(); s.played = true; runCounters(s.section); }
        } else if (past) {
          if (!s.persist) { s.tl.reverse(); s.played = false; }
        } else { // before enter
          s.tl.reverse(); s.played = false;
        }
      });
    },
  });
}

/* ---------- 6f. counter animations (fired once when stats enter) ---------- */
function runCounters(section) {
  section.querySelectorAll('.stat-number').forEach((el) => {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    const target = parseFloat(el.dataset.value);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target, duration: 2, ease: 'power1.out',
      onUpdate: () => {
        el.textContent = obj.v.toLocaleString(undefined, {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        });
      },
    });
  });
}

/* ---------- 6g. horizontal marquee ---------- */
function initMarquee() {
  document.querySelectorAll('.marquee-wrap').forEach((el) => {
    const speed = parseFloat(el.dataset.scrollSpeed) || -28;
    const enter = parseFloat(el.dataset.enter) / 100;
    const leave = parseFloat(el.dataset.leave) / 100;
    gsap.to(el.querySelector('.marquee-text'), {
      xPercent: speed, ease: 'none',
      scrollTrigger: { trigger: scrollContainer, start: 'top top', end: 'bottom bottom', scrub: true },
    });
    const fade = 0.05;
    ScrollTrigger.create({
      trigger: scrollContainer, start: 'top top', end: 'bottom bottom', scrub: true,
      onUpdate: (self) => {
        const p = self.progress;
        let o = 0;
        if (p >= enter - fade && p < enter) o = (p - (enter - fade)) / fade;
        else if (p >= enter && p <= leave) o = 1;
        else if (p > leave && p <= leave + fade) o = 1 - (p - leave) / fade;
        el.style.opacity = o;
      },
    });
  });
}

/* ---------- 6h. dark overlay (counters / stats) ---------- */
function initDarkOverlay(enter, leave) {
  const overlay = document.getElementById('dark-overlay');
  const fadeRange = 0.04;
  ScrollTrigger.create({
    trigger: scrollContainer, start: 'top top', end: 'bottom bottom', scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      let opacity = 0;
      if (p >= enter - fadeRange && p <= enter) opacity = ((p - (enter - fadeRange)) / fadeRange) * 0.9;
      else if (p > enter && p < leave) opacity = 0.9;
      else if (p >= leave && p <= leave + fadeRange) opacity = 0.9 * (1 - (p - leave) / fadeRange);
      overlay.style.opacity = opacity;
    },
  });
}

/* ---------- hero intro (staggered word rise) ---------- */
function playHeroIntro() {
  const words = document.querySelectorAll('.hero-heading .word > span');
  gsap.to(words, { y: 0, duration: 1.0, stagger: 0.1, ease: 'power4.out', delay: 0.1 });
  gsap.to('.hero-tagline', { opacity: 1, duration: 1, delay: 0.6, ease: 'power2.out' });
}

/* ---------- boot ---------- */
async function boot() {
  sizeCanvas();
  await preload();
  loaderEl.classList.add('done');

  initFrameBinding();
  initHeroTransition();
  initSections();
  initMarquee();
  // stats section occupies ~58–72% of scroll → dark overlay there
  initDarkOverlay(0.57, 0.73);

  playHeroIntro();
  ScrollTrigger.refresh();
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { sizeCanvas(); ScrollTrigger.refresh(); }, 150);
});

boot();
