// Мини-платформер “Дима: рабочий день”
// Под телефон: экранные кнопки + клавиши на ПК (A/D/Space/E)
// Этап 1: 3 стакана с чаем. Перепрыгнул стакан = +1 глоток. Нужно 3/3.
// Прыжок: вверх + импульс в сторону (вперёд/назад).

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const uiMsg = document.getElementById("msg");
const uiMeter = document.getElementById("meter");

function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize);
resize();

// --- управление ---
const input = { left: false, right: false, jump: false, act: false };

function bindHold(btnId, keyDown) {
  const el = document.getElementById(btnId);
  const down = (e) => {
    e.preventDefault();
    input[keyDown] = true;
  };
  const up = (e) => {
    e.preventDefault();
    input[keyDown] = false;
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", up);
}
bindHold("left", "left");
bindHold("right", "right");
bindHold("jump", "jump");
bindHold("act", "act");

addEventListener("keydown", (e) => {
  if (e.code === "KeyA" || e.code === "ArrowLeft") input.left = true;
  if (e.code === "KeyD" || e.code === "ArrowRight") input.right = true;
  if (e.code === "Space") input.jump = true;
  if (e.code === "KeyE") input.act = true;
});
addEventListener("keyup", (e) => {
  if (e.code === "KeyA" || e.code === "ArrowLeft") input.left = false;
  if (e.code === "KeyD" || e.code === "ArrowRight") input.right = false;
  if (e.code === "Space") input.jump = false;
  if (e.code === "KeyE") input.act = false;
});

// --- мир/физика ---
const W = () => innerWidth;
const H = () => innerHeight;

const GRAV = 1800; // px/s^2
const MOVE = 340; // px/s
const JUMP = 720; // impulse
const FRICTION = 0.86;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// --- сцены ---
const SCENE = {
  INTRO: 0,
  BUS: 1,
  SITE: 2,
  COFFEE: 3,
  CROWD: 4,
  WIN: 5,
};

let scene = SCENE.INTRO;

const player = {
  x: 120,
  y: 0,
  w: 44,
  h: 68,
  vx: 0,
  vy: 0,
  onGround: false,
  face: 1,
};

let camX = 0;
let checkpointX = 120;

let teaSips = 0;
const teaNeed = 3;

let workersCleared = 0;
const workersNeed = 3;

let kicked = false;
let charged = false;
let canShoot = false;

let flash = 0;
let black = 0;
let confetti = [];

function setHUD(msg, meter = "") {
  uiMsg.textContent = msg;
  uiMeter.textContent = meter;
}

function resetToCheckpoint() {
  player.x = checkpointX;
  player.y = groundY(player.x) - player.h;
  player.vx = 0;
  player.vy = 0;
  flash = 18;
}

function groundY(x) {
  const base = H() * 0.72;
  if (scene === SCENE.BUS) return base + Math.sin((x + 120) * 0.01) * 6;
  return base;
}

function makeConfetti() {
  confetti = [];
  for (let i = 0; i < 320; i++) {
    confetti.push({
      x: Math.random() * W(),
      y: -20 - Math.random() * H(),
      vx: -160 + Math.random() * 320,
      vy: 120 + Math.random() * 520,
      r: 3 + Math.random() * 5,
      a: Math.random() * Math.PI * 2,
      va: -6 + Math.random() * 12,
    });
  }
}

function drawConfetti(dt) {
  for (const p of confetti) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 220 * dt;
    p.a += p.va * dt;

    if (p.y > H() + 40) {
      p.y = -40;
      p.vy = 120 + Math.random() * 520;
    }
    if (p.x < -40) p.x = W() + 40;
    if (p.x > W() + 40) p.x = -40;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.fillStyle = `hsl(${(p.x + p.y) % 360}, 90%, 60%)`;
    ctx.fillRect(-p.r, -p.r, p.r * 2.2, p.r * 1.4);
    ctx.restore();
  }
}

// --- препятствия ---
function obstacles() {
  const obs = [];

  if (scene === SCENE.BUS) {
    // 3 стакана с чаем — перепрыгнул = +1 глоток
    for (let i = 0; i < 3; i++) {
      const x = 520 + i * 360;
      obs.push({ type: "tea", x, y: groundY(x) - 34, w: 44, h: 34, id: i });
    }
    // автобус “финиш”
    obs.push({
      type: "finish",
      x: 520 + 3 * 360 + 320,
      y: groundY(0) - 140,
      w: 220,
      h: 90,
    });
  }

  if (scene === SCENE.SITE) {
    // 3 толпы работяг
    for (let i = 0; i < 3; i++) {
      const x = 520 + i * 360;
      obs.push({ type: "workers", x, y: groundY(x) - 56, w: 140, h: 56, id: i });
    }
    // финиш “АККУЮ”
    obs.push({
      type: "finish",
      x: 520 + 3 * 360 + 260,
      y: groundY(0) - 160,
      w: 240,
      h: 110,
    });
  }

  if (scene === SCENE.COFFEE) {
    obs.push({ type: "npc", x: 520, y: groundY(520) - 76, w: 52, h: 76 });
    obs.push({ type: "coffee", x: 620, y: groundY(620) - 140, w: 150, h: 140 });
  }

  if (scene === SCENE.CROWD) {
    obs.push({ type: "crowd", x: camX + 40, y: groundY(camX + 40) - 120, w: 220, h: 120 });
  }

  return obs;
}

// начисление глотков один раз за каждый стакан
const passedTea = new Set();

function goTo(newScene) {
  scene = newScene;
  camX = 0;
  player.x = 120;
  player.y = groundY(player.x) - player.h;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  checkpointX = 120;
  flash = 24;

  const actBtn = document.getElementById("act");

  if (scene === SCENE.BUS) {
    teaSips = 0;
    passedTea.clear();
    setHUD("Автобус опаздывает. Перепрыгни стаканы с чаем: 1 прыжок = 1 глоток ☕", `Глотков: ${teaSips}/${teaNeed}`);
    actBtn.textContent = "Действие";
  }

  if (scene === SCENE.SITE) {
    workersCleared = 0;
    setHUD("Перепрыгни работяг, чтобы попасть на АККУЮ 🏗️", `Толп: ${workersCleared}/${workersNeed}`);
    actBtn.textContent = "Действие";
  }

  if (scene === SCENE.COFFEE) {
    kicked = false;
    setHUD("Чтобы выпить кофе, пни Андропова в жопу. Подойди к нему и нажми «Действие».",
