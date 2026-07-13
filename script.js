const timerEl = document.getElementById("timer");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const skipBtn = document.getElementById("skipBtn");
const countEl = document.getElementById("count");
const statusEl = document.getElementById("status");
const autoStartEl = document.getElementById("autoStart");
const notifyBtn = document.getElementById("notifyBtn");
const resetCountBtn = document.getElementById("resetCountBtn");
const taskInput = document.getElementById("taskInput");
const statTodayEl = document.getElementById("statToday");
const statWeekEl = document.getElementById("statWeek");
const doneTasksEl = document.getElementById("doneTasks");
const doneListEl = document.getElementById("doneList");
const langSwitch = document.getElementById("langSwitch");
const modeButtons = document.querySelectorAll(".mode");
const durationInputs = {
  focus: document.getElementById("focusMin"),
  short: document.getElementById("shortMin"),
  long: document.getElementById("longMin"),
};

// nakon koliko fokusa ide duga pauza
const LONG_BREAK_EVERY = 4;
const STORAGE_KEY = "pomodoro-state";

// trajanja u minutama po modu (default; prepisuje se iz localStorage)
const DURATIONS = { focus: 25, short: 5, long: 15 };

let totalSeconds = DURATIONS.focus * 60;
let remaining = totalSeconds;
let intervalId = null;
let running = false;
let currentMode = "focus";
let completed = 0;
let autoTimeoutId = null;
let history = {}; // { "2026-07-13": fokus-minute }
let log = []; // [{ date, task, min }]
let lang = "sr";
let statusState = { key: "ready", mode: "focus", secs: null };

/* ---------- Prevodi ---------- */

const I18N = {
  sr: {
    mode_focus: "Fokus",
    mode_short: "Kratka pauza",
    mode_long: "Duga pauza",
    label_focus: "fokus",
    label_short: "kratka pauza",
    label_long: "duga pauza",
    set_focus: "Fokus",
    set_short: "Kratka",
    set_long: "Duga",
    task_placeholder: "Na čemu radiš?",
    btn_start: "Start",
    btn_pause: "Pauza",
    btn_reset: "Reset",
    btn_skip: "Preskoči ⏭",
    auto_label: "Automatski nastavi cikluse",
    stat_today: "min danas",
    stat_week: "min ove nedelje",
    stat_total: "ciklusa ukupno",
    reset_count: "↺ Resetuj brojač",
    hint: "Prečice: <kbd>Space</kbd> start/pauza · <kbd>R</kbd> reset · <kbd>S</kbd> preskoči",
    done_title: "Odrađeno danas",
    no_name: "(bez naziva)",
    status_running: "Traje: {mode}.",
    status_ready: "Spremno: {mode}.",
    status_done_secs: "Gotovo! Sledeće: {mode} za {secs} s…",
    status_done_manual: "Gotovo! Na redu je {mode}. Klikni Start.",
    status_skipped: "Preskočeno. Sada: {mode}. Klikni Start.",
    notify_title: "🍅 Gotovo!",
    notify_body: "Završeno: {done}. Na redu: {next}.",
    notify_enable: "🔔 Uključi obaveštenja",
    notify_enabled: "🔔 Obaveštenja uključena",
    notify_blocked: "🔕 Obaveštenja blokirana",
    notify_unsupported: "🔔 Obaveštenja nisu podržana",
    confirm_reset: "Resetovati brojač završenih ciklusa?",
  },
  en: {
    mode_focus: "Focus",
    mode_short: "Short break",
    mode_long: "Long break",
    label_focus: "focus",
    label_short: "short break",
    label_long: "long break",
    set_focus: "Focus",
    set_short: "Short",
    set_long: "Long",
    task_placeholder: "What are you working on?",
    btn_start: "Start",
    btn_pause: "Pause",
    btn_reset: "Reset",
    btn_skip: "Skip ⏭",
    auto_label: "Auto-continue cycles",
    stat_today: "min today",
    stat_week: "min this week",
    stat_total: "cycles total",
    reset_count: "↺ Reset counter",
    hint: "Shortcuts: <kbd>Space</kbd> start/pause · <kbd>R</kbd> reset · <kbd>S</kbd> skip",
    done_title: "Done today",
    no_name: "(no name)",
    status_running: "Running: {mode}.",
    status_ready: "Ready: {mode}.",
    status_done_secs: "Done! Next: {mode} in {secs}s…",
    status_done_manual: "Done! Next up: {mode}. Click Start.",
    status_skipped: "Skipped. Now: {mode}. Click Start.",
    notify_title: "🍅 Done!",
    notify_body: "Completed: {done}. Next: {next}.",
    notify_enable: "🔔 Enable notifications",
    notify_enabled: "🔔 Notifications on",
    notify_blocked: "🔕 Notifications blocked",
    notify_unsupported: "🔔 Notifications unsupported",
    confirm_reset: "Reset the completed cycles counter?",
  },
};

function t(key, params) {
  let s = (I18N[lang] && I18N[lang][key]) || key;
  if (params) {
    for (const p in params) s = s.replace(`{${p}}`, params[p]);
  }
  return s;
}

function modeLabel(mode) {
  return t("label_" + mode);
}

/* ---------- Datumi ---------- */

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayKey() {
  return dateKey(new Date());
}

function lastNKeys(n) {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(dateKey(d));
  }
  return keys;
}

/* ---------- Spremanje / učitavanje ---------- */

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        durations: DURATIONS,
        completed,
        autoStart: autoStartEl.checked,
        history,
        log,
        lang,
      })
    );
  } catch (e) {
    /* localStorage nedostupan */
  }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    if (saved.durations) {
      for (const mode of ["focus", "short", "long"]) {
        const v = Number(saved.durations[mode]);
        if (Number.isFinite(v) && v > 0) DURATIONS[mode] = v;
      }
    }
    if (Number.isFinite(saved.completed)) completed = saved.completed;
    if (typeof saved.autoStart === "boolean") autoStartEl.checked = saved.autoStart;
    if (saved.history && typeof saved.history === "object") history = saved.history;
    if (Array.isArray(saved.log)) log = saved.log;
    if (saved.lang === "sr" || saved.lang === "en") lang = saved.lang;
  } catch (e) {
    /* neispravan zapis */
  }
}

/* ---------- Prikaz ---------- */

function format(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function render() {
  timerEl.textContent = format(remaining);
  document.title = `${format(remaining)} — Pomodoro`;
}

function setStatus(key, mode, secs) {
  statusState = { key, mode: mode || null, secs: secs == null ? null : secs };
  renderStatus();
}

function renderStatus() {
  const params = {};
  if (statusState.mode) params.mode = modeLabel(statusState.mode);
  if (statusState.secs != null) params.secs = statusState.secs;
  statusEl.textContent = t(statusState.key, params);
}

function renderStartBtn() {
  startBtn.textContent = running ? t("btn_pause") : t("btn_start");
}

function renderStats() {
  const today = todayKey();
  statTodayEl.textContent = history[today] || 0;
  const week = lastNKeys(7).reduce((sum, k) => sum + (history[k] || 0), 0);
  statWeekEl.textContent = week;
  countEl.textContent = completed;
}

function renderDoneList() {
  const today = todayKey();
  const todays = log.filter((e) => e.date === today);
  doneListEl.innerHTML = "";
  if (todays.length === 0) {
    doneTasksEl.hidden = true;
    return;
  }
  doneTasksEl.hidden = false;
  for (const e of todays) {
    const li = document.createElement("li");
    const name = e.task === "__noname__" ? t("no_name") : e.task;
    li.textContent = `${name} — ${e.min} min`;
    doneListEl.appendChild(li);
  }
}

/* ---------- Jezik ---------- */

function applyLanguage() {
  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });

  langSwitch.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });

  renderStartBtn();
  renderStatus();
  updateNotifyBtn();
  renderStats();
  renderDoneList();
}

function setLanguage(newLang) {
  if (newLang !== "sr" && newLang !== "en") return;
  lang = newLang;
  applyLanguage();
  saveState();
}

/* ---------- Tajmer ---------- */

function tick() {
  if (remaining > 0) {
    remaining--;
    render();
  } else {
    finish();
  }
}

function start() {
  if (running) {
    pause();
    return;
  }
  clearInterval(autoTimeoutId);
  running = true;
  renderStartBtn();
  setStatus("status_running", currentMode);
  intervalId = setInterval(tick, 1000);
}

function pause() {
  running = false;
  renderStartBtn();
  clearInterval(intervalId);
}

function reset() {
  clearInterval(autoTimeoutId);
  pause();
  remaining = totalSeconds;
  setStatus("status_ready", currentMode);
  render();
}

function skip() {
  clearInterval(autoTimeoutId);
  const upcoming = nextMode();
  setMode(upcoming);
  setStatus("status_skipped", currentMode);
}

/* ---------- Obaveštenja (zvuk + browser notifikacija) ---------- */

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    osc.start();
    osc.stop(ctx.currentTime + 1);
  } catch (e) {
    /* audio nije dostupan */
  }
}

function notify(doneMode, nextModeName) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(t("notify_title"), {
      body: t("notify_body", { done: modeLabel(doneMode), next: modeLabel(nextModeName) }),
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🍅%3C/text%3E%3C/svg%3E",
    });
  } catch (e) {
    /* notifikacija nije dostupna */
  }
}

function updateNotifyBtn() {
  if (!("Notification" in window)) {
    notifyBtn.textContent = t("notify_unsupported");
    notifyBtn.disabled = true;
    return;
  }
  if (Notification.permission === "granted") {
    notifyBtn.textContent = t("notify_enabled");
    notifyBtn.disabled = true;
  } else if (Notification.permission === "denied") {
    notifyBtn.textContent = t("notify_blocked");
    notifyBtn.disabled = true;
  } else {
    notifyBtn.textContent = t("notify_enable");
    notifyBtn.disabled = false;
  }
}

/* ---------- Ciklusi ---------- */

// odabir sledećeg moda na osnovu trenutnog i broja odrađenih fokusa
function nextMode() {
  if (currentMode === "focus") {
    return completed % LONG_BREAK_EVERY === 0 ? "long" : "short";
  }
  return "focus";
}

function recordFocus() {
  const today = todayKey();
  const mins = DURATIONS.focus;
  history[today] = (history[today] || 0) + mins;
  const task = taskInput.value.trim() || "__noname__";
  log.push({ date: today, task, min: mins });
  renderStats();
  renderDoneList();
}

function finish() {
  pause();
  if (currentMode === "focus") {
    completed++;
    recordFocus();
    saveState();
  }
  playChime();

  const doneMode = currentMode;
  const upcoming = nextMode();
  notify(doneMode, upcoming);

  if (autoStartEl.checked) {
    setStatus("status_done_secs", upcoming, 3);
    let secs = 3;
    autoTimeoutId = setInterval(() => {
      secs--;
      if (secs <= 0) {
        clearInterval(autoTimeoutId);
        setMode(upcoming);
        start();
      } else {
        setStatus("status_done_secs", upcoming, secs);
      }
    }, 1000);
  } else {
    setMode(upcoming);
    setStatus("status_done_manual", upcoming);
  }
}

function setMode(mode) {
  clearInterval(autoTimeoutId);
  currentMode = mode;
  totalSeconds = DURATIONS[mode] * 60;
  remaining = totalSeconds;
  document.body.className = mode;
  modeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  pause();
  render();
}

/* ---------- Postavke trajanja ---------- */

function syncInputs() {
  for (const mode of ["focus", "short", "long"]) {
    durationInputs[mode].value = DURATIONS[mode];
  }
}

function handleDurationChange(mode) {
  const input = durationInputs[mode];
  let v = Math.round(Number(input.value));
  const min = Number(input.min) || 1;
  const max = Number(input.max) || 180;
  if (!Number.isFinite(v) || v < min) v = min;
  if (v > max) v = max;
  input.value = v;
  DURATIONS[mode] = v;
  saveState();
  // ako menjamo trenutni mod dok ne radi tajmer, osveži prikaz
  if (mode === currentMode && !running) {
    totalSeconds = v * 60;
    remaining = totalSeconds;
    render();
  }
}

/* ---------- Događaji ---------- */

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setMode(btn.dataset.mode);
    setStatus("status_ready", currentMode);
  });
});

for (const mode of ["focus", "short", "long"]) {
  durationInputs[mode].addEventListener("change", () => handleDurationChange(mode));
}

autoStartEl.addEventListener("change", saveState);

startBtn.addEventListener("click", start);
resetBtn.addEventListener("click", reset);
skipBtn.addEventListener("click", skip);

resetCountBtn.addEventListener("click", () => {
  if (!confirm(t("confirm_reset"))) return;
  completed = 0;
  renderStats();
  saveState();
});

notifyBtn.addEventListener("click", () => {
  if (!("Notification" in window)) return;
  Notification.requestPermission().then(() => updateNotifyBtn());
});

langSwitch.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => setLanguage(b.dataset.lang));
});

// prečice na tastaturi — ne hvataj dok korisnik kuca u polju
document.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea") return;
  if (e.code === "Space") {
    e.preventDefault();
    start();
  } else if (e.key === "r" || e.key === "R") {
    reset();
  } else if (e.key === "s" || e.key === "S") {
    skip();
  }
});

/* ---------- Početno stanje ---------- */

loadState();
syncInputs();
setMode("focus");
statusState = { key: "status_ready", mode: "focus", secs: null };
applyLanguage();
