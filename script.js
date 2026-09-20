/* ============ Дыхательное упражнение ============ */
(function () {
  const orb = document.getElementById("orb");
  const label = document.getElementById("breathLabel");
  const btn = document.getElementById("breathBtn");

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
    anim = orb.animate(p.frames, {
      duration: p.sec * 1000,
      easing: "ease-in-out",
      fill: "forwards",
    });
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
    if (!orb.animate) {
      label.textContent = "Ваш браузер не поддерживает анимацию";
      return;
    }
    running = true;
    btn.textContent = "Остановить";
    runPhase();
  });
})();

/* ============ ИИ-коуч ============ */
const $ = (id) => document.getElementById(id);
const els = {
  start: $("startBtn"), bar: $("bar"), fill: $("fill"), status: $("status"),
  setup: $("setup"), chatBox: $("chatBox"), log: $("log"), form: $("form"),
  input: $("input"), send: $("send"), stop: $("stop"), starters: $("starters"),
};

/* Какие модели искать в списке библиотеки (берётся самая лёгкая из найденных) */
const MODEL_FILTER = /deepseek/i;

const SYSTEM_PROMPT =
  "Ты — ИИ-коуч: тёплый, внимательный собеседник для лёгкой эмоциональной поддержки. " +
  "Отвечай по-русски, спокойно и просто, 3–6 предложений. Сначала покажи, что услышал человека, " +
  "потом задай один уточняющий вопрос или предложи один маленький шаг. " +
  "Не ставь диагнозов, не назначай лекарства, не давай категоричных указаний. " +
  "Если человек говорит о серьёзной беде, мягко посоветуй обратиться к близким или к специалисту.";

const CRISIS = /суицид|самоубийств|покончить с собой|убить себя|не хочу жить|хочу умереть|причинить себе вред|навредить себе|порезать себя/i;
const CRISIS_TEXT =
  "Мне важно, что вы об этом написали. Вы не одни, и ваша жизнь имеет значение.\n\n" +
  "Пожалуйста, прямо сейчас свяжитесь с близким человеком или с экстренной службой вашей страны " +
  "(во многих странах это 112). Если вы в непосредственной опасности, не оставайтесь одни.\n\n" +
  "Когда станет чуть спокойнее, я готов продолжить разговор.";

let webllm = null, engine = null, busy = false, controller = null;
const history = [];

function setStatus(t, err = false) {
  els.status.textContent = t;
  els.status.classList.toggle("err", err);
}
const scrollDown = () => { els.log.scrollTop = els.log.scrollHeight; };

/* ---------- Запуск коуча ---------- */
els.start.addEventListener("click", async () => {
  els.start.disabled = true;

  if (!("gpu" in navigator)) {
    setStatus("Ваш браузер не поддерживает нужные технологии. Откройте сайт в свежем Chrome или Edge на компьютере. Остальные разделы сайта работают как обычно.", true);
    return;
  }

  setStatus("Подготовка…");
  try {
    webllm = await import("https://esm.run/@mlc-ai/web-llm");
  } catch (e) {
    setStatus("Не удалось загрузить нужные файлы. Проверьте интернет и откройте сайт по адресу https://, а не как файл.", true);
    els.start.disabled = false;
    return;
  }

  const models = webllm.prebuiltAppConfig.model_list
    .filter((m) => MODEL_FILTER.test(m.model_id))
    .sort((a, b) => (a.vram_required_MB || 0) - (b.vram_required_MB || 0));
  if (!models.length) {
    setStatus("Не удалось найти подходящую модель. Попробуйте позже.", true);
    els.start.disabled = false;
    return;
  }

  els.bar.style.display = "block";
  els.fill.style.width = "0%";
  try {
    engine = await webllm.CreateMLCEngine(models[0].model_id, {
      initProgressCallback: (p) => {
        const pct = Math.round((p.progress || 0) * 100);
        els.fill.style.width = pct + "%";
        setStatus("Загружаю коуча: " + pct + "%. Это делается один раз.");
      },
    });
    els.setup.style.display = "none";
    els.chatBox.classList.add("on");
    addMsg("bot", "Здравствуйте. Я рад, что вы зашли. Что сейчас занимает ваши мысли?");
    els.input.focus();
  } catch (e) {
    engine = null;
    els.bar.style.display = "none";
    els.start.disabled = false;
    setStatus("Не удалось запустить коуча: " + (e && e.message ? e.message : e), true);
  }
});

/* ================================================================
   ОТВЕТ НЕЙРОСЕТИ. Чтобы подключить другую модель или сервер,
   меняйте только эту функцию.
   messages — история [{role, content}]
   onToken(текст) — показать ответ по мере появления (весь текст целиком)
   signal — сигнал кнопки «Стоп»
   Верните готовый текст ответа.
   ================================================================ */
const clean = (t) => t.replace(/^<think>[\s\S]*?(<\/think>|$)/, "").replace(/^[\s\S]*?<\/think>/, "").trim();

async function getReply(messages, onToken, signal) {
  const stream = await engine.chat.completions.create({
    messages, stream: true, temperature: 0.6, max_tokens: 1800,
  });
  let full = "";
  for await (const chunk of stream) {
    if (signal.aborted) { engine.interruptGenerate(); break; }
    full += chunk.choices[0]?.delta?.content || "";
    onToken(clean(full));
  }
  return clean(full);
}

/* ---------- Интерфейс чата ---------- */
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

async function ask(text) {
  if (!engine || busy) return;
  els.starters.hidden = true;
  addMsg("user", text);

  if (CRISIS.test(text)) {
    addMsg("safe", CRISIS_TEXT);
    return;
  }

  setBusy(true);
  history.push({ role: "user", content: text });
  const botEl = addMsg("bot", "…");
  controller = new AbortController();

  try {
    const reply = await getReply(
      [{ role: "system", content: SYSTEM_PROMPT }, ...history.slice(-6)],
      (t) => { botEl.textContent = t || "…"; scrollDown(); },
      controller.signal
    );
    if (!reply.trim()) throw new Error("пустой ответ");
    botEl.textContent = reply;
    history.push({ role: "assistant", content: reply });
  } catch (e) {
    history.pop();
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