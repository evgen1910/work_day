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
    setHUD("Чтобы выпить кофе, пни Андропова в жопу. Подойди к нему и нажми «Действие».", "");
    actBtn.textContent = "🦵 Пнуть";
  }

  if (scene === SCENE.CROWD) {
    charged = false;
    canShoot = false;
    black = 0;
    setHUD("Чтобы пережить этот день — заряжай писькомёт. Нажимай «Действие».", "Заряд: 0/6");
    actBtn.textContent = "⚡ Зарядить";
  }

  if (scene === SCENE.WIN) {
    setHUD("Поздравляю! Ты победил этот рабочий день! 🎉", "ФИНАЛ");
    actBtn.textContent = "🔁 Сначала";
  }
}

function goIntro() {
  scene = SCENE.INTRO;
  setHUD("Помоги Диме пережить рабочий день. Жми «Действие».", "");
  document.getElementById("act").textContent = "▶️ Начать";
  player.x = 120;
  player.y = groundY(player.x) - player.h;
  player.vx = 0;
  player.vy = 0;
  passedTea.clear();
}

goIntro();

// --- игровой цикл ---
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  update(dt);
  render(dt);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function update(dt) {
  if (flash > 0) flash--;
  if (black > 0) black = Math.max(0, black - 420 * dt);

  // INTRO
  if (scene === SCENE.INTRO && input.act) {
    input.act = false;
    goTo(SCENE.BUS);
    return;
  }

  // WIN
  if (scene === SCENE.WIN && input.act) {
    input.act = false;
    goIntro();
    return;
  }

  // камера
  camX = Math.max(0, player.x - W() * 0.35);

  // движение
  let ax = 0;
  if (input.left) ax -= MOVE;
  if (input.right) ax += MOVE;

  // авто-вперёд на 1-2 этапах
  if (scene === SCENE.BUS || scene === SCENE.SITE) ax += MOVE * 0.35;

  player.vx = (player.vx + ax * dt) * FRICTION;
  player.vx = clamp(player.vx, -MOVE, MOVE);

  // прыжок (вверх + вперёд/в сторону)
  if (input.jump && player.onGround) {
    input.jump = false;
    player.vy = -JUMP;

    const forward = input.right || (!input.left && !input.right); // по умолчанию вперёд
    if (forward) player.vx = Math.max(player.vx, MOVE * 0.75);
    if (input.left) player.vx = Math.min(player.vx, -MOVE * 0.55);

    player.onGround = false;
  }

  // гравитация
  player.vy += GRAV * dt;

  // интеграция
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // пол
  const gy = groundY(player.x) - player.h;
  if (player.y >= gy) {
    player.y = gy;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  // границы
  player.x = Math.max(0, player.x);

  const obs = obstacles();

  for (const o of obs) {
    // финиши
    if (o.type === "finish" && aabb(player, o)) {
      if (scene === SCENE.BUS) {
        if (teaSips >= teaNeed) {
          goTo(SCENE.SITE);
          return;
        } else {
          setHUD("Автобус ещё не готов. Допей чай: перепрыгни все стаканы!", `Глотков: ${teaSips}/${teaNeed}`);
          resetToCheckpoint();
          return;
        }
      }
      if (scene === SCENE.SITE) {
        if (workersCleared >= workersNeed) {
          goTo(SCENE.COFFEE);
          return;
        } else {
          resetToCheckpoint();
          return;
        }
      }
    }

    // стаканы чая
    if (o.type === "tea") {
      if (aabb(player, o)) {
        setHUD("Опа! Чай разлит 😤 Перепрыгни стакан аккуратнее.", `Глотков: ${teaSips}/${teaNeed}`);
        resetToCheckpoint();
        return;
      }

      // засчитываем как “пройден”, когда игрок оказался правее стакана
      const passed = player.x > o.x + o.w + 18;
      if (passed && !passedTea.has(o.id)) {
        passedTea.add(o.id);
        teaSips = Math.min(teaNeed, teaSips + 1);
        setHUD(
          "Автобус опаздывает. Перепрыгни стаканы с чаем: 1 прыжок = 1 глоток ☕",
          `Глотков: ${teaSips}/${teaNeed}`
        );
      }
    }

    // работяги
    if (o.type === "workers") {
      if (aabb(player, o)) {
        setHUD("Таран работяг запрещён. Только прыжок 🏗️", `Толп: ${workersCleared}/${workersNeed}`);
        resetToCheckpoint();
        return;
      }

      const passed = player.x > o.x + o.w + 22;
      if (passed && workersCleared < workersNeed) {
        const expectedId = workersCleared;
        if (o.id === expectedId) {
          workersCleared++;
          setHUD("Перепрыгни работяг, чтобы попасть на АККУЮ 🏗️", `Толп: ${workersCleared}/${workersNeed}`);
        }
      }
    }

    // Андропов
    if (o.type === "npc") {
      if (!kicked && aabb(player, o)) {
        player.x -= 40;
        if (input.act) {
          input.act = false;
          kicked = true;
          flash = 22;
          setHUD("Отлично. Андропов покинул очередь. Кофе твой ☕", "");
          document.getElementById("act").textContent = "➡️ Дальше";
        }
      } else if (kicked && input.act) {
        input.act = false;
        goTo(SCENE.CROWD);
        return;
      }
    }

    // толпа
    if (o.type === "crowd") {
      if (scene === SCENE.CROWD && aabb(player, o) && !canShoot) {
        setHUD("День победил. Но ты можешь переиграть: заряжай писькомёт быстрее 😡", "");
        goTo(SCENE.CROWD);
        return;
      }
    }
  }

  // CROWD: зарядка и выстрел
  if (scene === SCENE.CROWD && input.act && !canShoot) {
    input.act = false;
    charged = (charged || 0) + 1;
    setHUD("Чтобы пережить этот день — заряжай писькомёт.", `Заряд: ${charged}/6`);
    if (charged >= 6) {
      canShoot = true;
      black = 255;
      setHUD("Экран темнеет. Теперь жми «ПЛИ!»", "");
      document.getElementById("act").textContent = "💥 ПЛИ!";
    }
  } else if (scene === SCENE.CROWD && input.act && canShoot) {
    input.act = false;
    makeConfetti();
    flash = 26;
    setTimeout(() => goTo(SCENE.WIN), 650);
  }

  // чекпоинт
  checkpointX = Math.max(checkpointX, player.x - 80);
}

function render(dt) {
  ctx.clearRect(0, 0, W(), H());

  drawBackground();

  // “земля”
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, groundY(0), W(), H());

  // объекты
  const obs = obstacles();
  for (const o of obs) drawObject(o);

  // герой
  drawDima();

  // эффекты
  if (confetti.length) drawConfetti(dt);

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flash / 30})`;
    ctx.fillRect(0, 0, W(), H());
  }

  if (scene === SCENE.CROWD && black > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.9, black / 255)})`;
    ctx.fillRect(0, 0, W(), H());
  }
}

function worldToScreenX(x) {
  return x - camX;
}

function drawBackground() {
  if (scene === SCENE.BUS) {
    // море + пляж
    ctx.fillStyle = "rgba(120, 210, 255, 0.18)";
    ctx.fillRect(0, 0, W(), H() * 0.55);

    ctx.fillStyle = "rgba(0, 130, 220, 0.25)";
    ctx.fillRect(0, H() * 0.52, W(), H() * 0.12);
    ctx.fillStyle = "rgba(0, 90, 170, 0.22)";
    ctx.fillRect(0, H() * 0.58, W(), H() * 0.1);

    ctx.fillStyle = "rgba(255, 230, 170, 0.22)";
    ctx.fillRect(0, groundY(0) - 28, W(), 28);

    // облака
    for (let i = 0; i < 6; i++) {
      const x = i * 220 - ((camX * 0.15) % 220);
      blob(x, 90 + (i % 2) * 30, 90, 22, "rgba(255,255,255,0.12)");
    }
  } else if (scene === SCENE.SITE) {
    ctx.fillStyle = "rgba(255, 210, 120, 0.10)";
    ctx.fillRect(0, 0, W(), H());
    // краны
    for (let i = 0; i < 4; i++) {
      const x = i * 320 - ((camX * 0.2) % 320) + 120;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, groundY(0));
      ctx.lineTo(x, H() * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, H() * 0.24);
      ctx.lineTo(x + 140, H() * 0.24);
      ctx.stroke();
    }
  } else {
    // офис/нейтральный
    ctx.fillStyle = "rgba(220, 240, 255, 0.10)";
    ctx.fillRect(0, 0, W(), H() * 0.7);
    for (let i = 0; i < 5; i++) {
      const x = 60 + i * (W() / 5);
      ctx.fillStyle = "rgba(120,180,255,0.10)";
      ctx.fillRect(x, 90, 110, 80);
    }
  }
}

function blob(x, y, rx, ry, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundRect(x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  if (fill) ctx.fill();
  else ctx.stroke();
}

function drawObject(o) {
  const x = worldToScreenX(o.x);
  const y = o.y;

  if (o.type === "tea") {
    // стакан чая
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    roundRect(x, y, o.w, o.h, 10, true);

    ctx.fillStyle = "rgba(210,140,60,0.35)";
    roundRect(x + 6, y + 10, o.w - 12, o.h - 14, 8, true);

    ctx.fillStyle = "rgba(255,255,255,0.18)";
    roundRect(x + 8, y + 6, 10, o.h - 12, 6, true);

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 12, y - 4, 7, Math.PI * 0.2, Math.PI * 0.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 28, y - 6, 8, Math.PI * 0.2, Math.PI * 0.95);
    ctx.stroke();

    ctx.restore();
    return;
  }

  if (o.type === "workers") {
    blob(x + o.w / 2, y + o.h / 2, o.w / 2, o.h / 2, "rgba(10,10,10,0.35)");
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "900 22px system-ui";
    ctx.fillText("👷‍♂️👷‍♂️👷‍♂️", x + 18, y + 36);
    return;
  }

  if (o.type === "finish") {
    if (scene === SCENE.BUS) {
      ctx.fillStyle = "rgba(20,20,20,0.55)";
      roundRect(x, y + 30, o.w, o.h - 10, 16, true);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      for (let i = 0; i < 5; i++) roundRect(x + 18 + i * 40, y + 44, 30, 18, 6, true);

      blob(x + 48, y + o.h + 18, 14, 14, "rgba(0,0,0,0.55)");
      blob(x + o.w - 48, y + o.h + 18, 14, 14, "rgba(0,0,0,0.55)");

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "900 14px system-ui";
      ctx.fillText(teaSips >= teaNeed ? "ПОЕХАЛИ" : "ЖДЁМ", x + 20, y + 26);
      return;
    }
    if (scene === SCENE.SITE) {
      ctx.fillStyle = "rgba(20,20,20,0.55)";
      roundRect(x, y, o.w, o.h, 16, true);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "900 28px system-ui";
      ctx.fillText("АККУЮ", x + 58, y + 58);
      return;
    }
  }

  if (o.type === "npc") {
    if (!kicked) {
      ctx.fillStyle = "rgba(30,30,30,0.55)";
      roundRect(x, y + 18, o.w, o.h - 18, 14, true);
      blob(x + o.w / 2, y + 12, 16, 16, "rgba(255,220,190,0.65)");
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.font = "800 12px system-ui";
      ctx.fillText("Андропов", x - 8, y - 8);
    }
    return;
  }

  if (o.type === "coffee") {
    ctx.fillStyle = "rgba(20,20,20,0.55)";
    roundRect(x, y, o.w, o.h, 18, true);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    roundRect(x + 18, y + 18, o.w - 36, 44, 12, true);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "900 26px system-ui";
    ctx.fillText("☕", x + o.w / 2 - 12, y + 100);
    return;
  }

  if (o.type === "crowd") {
    ctx.save();
    ctx.globalAlpha = 0.9;
    blob(120, groundY(0) - 70, 170, 60, "rgba(0,0,0,0.35)");
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "900 34px system-ui";
    ctx.fillText("😡📧😡📧😡", 26, groundY(0) - 58);
    ctx.restore();
    return;
  }
}

function drawDima() {
  const x = worldToScreenX(player.x);
  const y = player.y;

  // тело
  ctx.fillStyle = "rgba(20,20,20,0.62)";
  roundRect(x, y + 18, player.w, player.h - 18, 14, true);

  // голова
  blob(x + player.w / 2, y + 10, 18, 18, "rgba(255,220,190,0.70)");
  blob(x + player.w / 2, y + 6, 20, 14, "rgba(40,25,20,0.55)");

  // лицо
  blob(x + player.w / 2 - 6, y + 10, 2.8, 2.8, "rgba(0,0,0,0.45)");
  blob(x + player.w / 2 + 6, y + 10, 2.8, 2.8, "rgba(0,0,0,0.45)");
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + player.w / 2, y + 18, 7, 0, Math.PI);
  ctx.stroke();

  if (scene === SCENE.WIN) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "900 16px system-ui";
    ctx.fillText("Дима: 😁", x - 8, y - 10);
  }
}
