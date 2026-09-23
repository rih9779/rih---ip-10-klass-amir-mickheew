import { Coach } from "./coach.js";

/* ============ Офлайн-режим страницы ============ */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

/* ============ Дыхательное упражнение ============ */
(function () {
  const orb = document.getElementById("orb");
  const label = document.getElementById("breathLabel");
  const btn = document.getElementById("breathBtn");
  if (!orb || !label ||!btn ) return;

  const frame = (scale, glow) => ({
    transform: "scale(" + scale + ")",
    boxShadow: glow
      ? "0 0 110px 30px rgba(120, 100, 190, .5)"
      : "0 20px 60px rgba(120, 100, 190, .28)",
  });

  const phases = [
    { text: "Вдох",  sec: 4, frames: [frame(0.72, false), frame(1.32, true)] },
    { text: "Пауза", sec: 4, frames: [frame(1.32, true), frame(1.38, true), frame(1.32, true)] },
    { text: "Выдох", sec: 6, frames: [frame(1.32, true), frame(0.72, false)] },
  ];

  let running = false, anim = null, timer = null, i = 0;

  function runPhase() {
    if (!running) return;
    const p = phases[i % phases.length];
    i++;
    label.textContent = p.text;
    const prev = anim;
    anim = orb.animate(p.frames, { duration: p.sec * 1000, easing: "ease-in-out", fill: "forwards" });
    if (prev) prev.cancel();
    timer = setTimeout(runPhase, p.sec * 1000);
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    if (anim) { anim.cancel(); anim = null; }
    label.textContent = "Минута тишины";
    btn.textContent = "Подышать вместе";
    i = 0;
  }

  btn.addEventListener("click", () => {
    if (running) { stop(); return; }
    if (!orb.animate) { label.textContent = "Ваш браузер не поддерживает анимацию"; return; }
    running = true;
    btn.textContent = "Остановить";
    runPhase();
  });
})();

/* ============ Чат с коучем ============ */
const $ = (id) => document.getElementById(id);
const els = {
  start: $("startBtn"), bar: $("bar"), fill: $("fill"), status: $("status"),
  setup: $("setup"), chatBox: $("chatBox"), log: $("log"), form: $("form"),
  input: $("input"), send: $("send"), stop: $("stop"), starters: $("starters"),
};

const coach = new Coach();
let busy = false, controller = null;

function setStatus(t, err = false) {
  els.status.textContent = t;
  els.status.classList.toggle("err", err);
}
const scrollDown = () => { els.log.scrollTop = els.log.scrollHeight; };

function addMsg(kind, text) {
  const el = document.createElement("div");
  el.className = "msg " + kind;
  el.textContent = text;
  els.log.appendChild(el);
  scrollDown();
  return el;
}

function setBusy(b) {
  busy = b;
  els.send.hidden = b;
  els.stop.hidden = !b;
  els.input.disabled = b;
  if (!b) els.input.focus();
}

/* Заметка об интернете до запуска коуча */
function netNote() {
  if (coach.mode || els.start.disabled) return;
  setStatus(navigator.onLine
    ? ""
    : "Вы без интернета. Если коуч уже загружался раньше, он запустится из кэша браузера.");
}
addEventListener("online", netNote);
addEventListener("offline", netNote);
netNote();

/* Запуск коуча */
els.start.addEventListener("click", async () => {
  els.start.disabled = true;
  setStatus("Подготовка…");

  const res = await coach.start((pct) => {
    els.bar.style.display = "block";
    els.fill.style.width = pct + "%";
    setStatus("Загружаю коуча: " + pct + "%. Это делается один раз, потом он работает и без интернета.");
  });

  els.bar.style.display = "none";
  els.setup.style.display = "none";
  els.chatBox.classList.add("on");

  if (res.mode === "ai") {
    addMsg("bot", coach.greeting());
  } else {
    addMsg("bot",
      res.reason +
      "\n\n Поэтому сейчас работает простой режим: это не нейросеть, а набор заготовленных вопросов. " +
      "Он тоже помогает разложить мысли, но отвечает проще.\n\n" + coach.greeting());
  }
  els.input.focus();
});

/* Отправка сообщения */
async function ask(text) {
  if (!coach.mode || busy) return;
  els.starters.hidden = true;
  addMsg("user", text);

  setBusy(true);
  const botEl = addMsg("bot", "…");
  controller = new AbortController();

  try {
    const r = await coach.reply(
      text,
      (t) => { botEl.textContent = t || "…"; scrollDown(); },
      controller.signal
    );
    botEl.textContent = r.text;
    if (r.kind === "safe") botEl.className = "msg safe";
    if (r.note) addMsg("safe", r.note);
  } catch (e) {
    botEl.className = "msg bot errmsg";
    botEl.textContent = "Не удалось получить ответ: " + (e && e.message ? e.message : e) +
      ". Если диалог стал слишком длинным, обновите страницу и начните заново.";
  } finally {
    controller = null;
    setBusy(false);
    scrollDown();
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.input.value.trim();
  if (!text) return;
  els.input.value = "";
  els.input.style.height = "auto";
  ask(text);
});
els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    els.form.requestSubmit();
  }
});
els.input.addEventListener("input", () => {
  els.input.style.height = "auto";
  els.input.style.height = Math.min(els.input.scrollHeight, 140) + "px";
});
els.stop.addEventListener("click", () => { if (controller) controller.abort(); });
els.starters.querySelectorAll("button").forEach((b) =>
  b.addEventListener("click", () => ask(b.textContent))
);