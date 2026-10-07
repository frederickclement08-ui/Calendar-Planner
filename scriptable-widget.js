// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: calendar-check;

/*
  Calendar Planner widget for Scriptable (iPhone and iPad).
  Shows today's classes and study sessions, and what's due next,
  in the same style as the Calendar Planner app.

  Setup: in Calendar Planner, open Settings › Synced with GitHub › Copy widget for Scriptable.
  In Scriptable, tap +, paste, name it "Calendar Planner", then add a Scriptable widget
  to your Home Screen or Lock Screen and pick this script.
*/

// Filled in automatically when you copy the widget from Calendar Planner.
const DATA_URL = "";
const APP_URL = "";

// ---------- Look ----------
const C = {
  ink: Color.dynamic(new Color("#000000"), new Color("#FFFFFF")),
  muted: Color.dynamic(new Color("#6E6E73"), new Color("#98989F")),
  accent: Color.dynamic(new Color("#5B3FE8"), new Color("#A898FF")),
  red: Color.dynamic(new Color("#FF3B30"), new Color("#FF453A")),
  orange: Color.dynamic(new Color("#FF9500"), new Color("#FF9F0A")),
  chip: Color.dynamic(new Color("#787880", 0.14), new Color("#787880", 0.32)),
  top: Color.dynamic(new Color("#EFE9FF"), new Color("#221838")),
  bottom: Color.dynamic(new Color("#FFFFFF"), new Color("#000000")),
  noClass: new Color("#9AA3B5")
};
const F = {
  title: n => Font.heavyRoundedSystemFont(n),
  bold: n => Font.boldSystemFont(n),
  semi: n => Font.semiboldSystemFont(n),
  reg: n => Font.systemFont(n)
};

// ---------- Dates ----------
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isoDay = d => (d.getDay() + 6) % 7 + 1; // Monday = 1 … Sunday = 7
const withTime = (d, t) => { const [h, m] = String(t || "23:59").split(":").map(Number); const x = new Date(d); x.setHours(h || 0, m || 0, 0, 0); return x; };
const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 864e5);
const timeFmt = new DateFormatter(); timeFmt.useNoDateStyle(); timeFmt.useShortTimeStyle();
const fmtTime = d => timeFmt.string(d);
const dayName = new DateFormatter(); dayName.dateFormat = "EEEE";
const monthName = new DateFormatter(); monthName.dateFormat = "MMMM";

// ---------- Data ----------
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "calendar-planner-widget.json");

async function loadPlanner() {
  if (!DATA_URL) return { error: "setup" };
  try {
    const r = new Request(DATA_URL + (DATA_URL.includes("?") ? "&" : "?") + "t=" + Date.now());
    r.timeoutInterval = 15;
    const text = await r.loadString();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.items)) throw new Error("bad data");
    fm.writeString(cachePath, text);
    return { data };
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      try { return { data: JSON.parse(fm.readString(cachePath)), stale: true }; } catch (x) {}
    }
    return { error: "offline" };
  }
}

function plannerFor(data, now) {
  const classes = data.classes || [], items = data.items || [], specials = data.specialDays || [];
  const blocks = (data.plan && data.plan.blocks) || [], settings = data.settings || {};
  const classById = id => classes.find(c => c.id === id);
  const colorOf = it => { const c = classById(it.classId); return c ? new Color(c.color) : C.noClass; };
  const inTerm = d => !(settings.termStart && d < parseYmd(settings.termStart)) && !(settings.termEnd && d > parseYmd(settings.termEnd));
  const specialFor = d => { const k = ymd(d); const list = specials.filter(x => k >= x.start && k <= (x.end || x.start)); return list.find(x => +x.follows) || list[0] || null; };
  const today = startOfDay(now), key = ymd(today);

  // Today's schedule: classes, exams and events with a time, and study sessions.
  const entries = [];
  const sp = specialFor(today);
  if (inTerm(today) && !(sp && !+sp.follows)) {
    const day = sp ? +sp.follows : isoDay(today);
    for (const c of classes) for (const s of (c.sessions || [])) if (+s.day === day) {
      entries.push({ start: withTime(today, s.start), end: withTime(today, s.end), title: c.name, sub: s.room || "Class", color: new Color(c.color) });
    }
  }
  for (const it of items) {
    if (it.done || it.due !== key || !it.time || !(it.kind === "exam" || it.kind === "event")) continue;
    const start = withTime(today, it.time);
    entries.push({ start, end: new Date(start.getTime() + (+it.duration || 120) * 6e4), title: it.title, sub: it.kind === "exam" ? "Exam" : "Event", color: colorOf(it), strong: it.kind === "exam" });
  }
  for (const b of blocks) {
    if (b.date !== key || b.done) continue;
    const it = items.find(i => i.id === b.itemId);
    if (it && it.done) continue;
    entries.push({ start: withTime(today, b.start), end: withTime(today, b.end), title: b.title || "Study", sub: b.focus || "Study session", color: it ? colorOf(it) : C.accent, study: true });
  }
  entries.sort((a, b) => a.start - b.start);

  // What's due: late, then the next 14 days (events are on the schedule, not due).
  const due = items.filter(it => !it.done && it.kind !== "event" && it.due && dayDiff(parseYmd(it.due), today) <= 14)
    .map(it => ({ it, at: withTime(parseYmd(it.due), it.time || "23:59"), diff: dayDiff(parseYmd(it.due), today), color: colorOf(it), cls: classById(it.classId) }))
    .sort((a, b) => a.at - b.at);
  const week = due.filter(d => d.diff >= 0 && d.diff <= 7).length;
  const late = due.filter(d => d.diff < 0).length;
  const special = sp ? (sp.label || (+sp.follows ? "Schedule change" : "Day off")) : "";
  return { entries, remaining: entries.filter(e => e.end > now), due, week, late, special };
}

// ---------- Drawing ----------
function base() {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [C.top, C.bottom];
  g.locations = [0, 0.85];
  g.startPoint = new Point(0, 0);
  g.endPoint = new Point(0.4, 1);
  w.backgroundGradient = g;
  if (APP_URL) w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}
function mark(stack, size) {
  const s = stack.addStack();
  s.size = new Size(size, size);
  s.cornerRadius = size * 0.25;
  const g = new LinearGradient();
  g.colors = [new Color("#6A4DFF"), new Color("#E9407A"), new Color("#FF8A3D")];
  g.locations = [0, 0.55, 1];
  g.startPoint = new Point(0, 0); g.endPoint = new Point(1, 1);
  s.backgroundGradient = g;
  s.centerAlignContent();
  const sym = SFSymbol.named("checkmark");
  sym.applyFont(Font.boldSystemFont(size * 0.55));
  const img = s.addImage(sym.image);
  img.tintColor = Color.white();
  img.imageSize = new Size(size * 0.55, size * 0.55);
}
function text(stack, str, font, color, lines) {
  const t = stack.addText(String(str));
  t.font = font; t.textColor = color || C.ink;
  if (lines) t.lineLimit = lines;
  return t;
}
function badge(stack, d) {
  let label, bg = C.chip, fg = C.ink;
  if (d.diff < 0) { label = d.diff === -1 ? "1 d late" : `${-d.diff} d late`; bg = C.red; fg = Color.white(); }
  else if (d.diff === 0) { label = d.it.time ? fmtTime(d.at) : "Today"; bg = C.red; fg = Color.white(); }
  else if (d.diff === 1) { label = "Tomorrow"; bg = new Color("#FF9500", 0.24); }
  else label = `in ${d.diff} d`;
  const b = stack.addStack();
  b.backgroundColor = bg; b.cornerRadius = 8; b.setPadding(2, 6, 2, 6);
  text(b, label, F.bold(10), fg, 1);
}
function row(stack, color, title, sub, right, opts) {
  opts = opts || {};
  const r = stack.addStack();
  r.layoutHorizontally(); r.centerAlignContent(); r.spacing = 7;
  const bar = r.addStack();
  bar.size = new Size(4, opts.compact ? 22 : 28);
  bar.cornerRadius = 2;
  bar.backgroundColor = color;
  const col = r.addStack();
  col.layoutVertically();
  const t = text(col, title, F.semi(opts.compact ? 12 : 13), C.ink, 1);
  if (opts.faded) t.textOpacity = 0.5;
  if (sub && !opts.compact) { const s = text(col, sub, F.reg(11), C.muted, 1); if (opts.faded) s.textOpacity = 0.5; }
  r.addSpacer();
  if (typeof right === "function") right(r);
  else if (right) text(r, right, F.semi(11), opts.faded ? C.muted : C.accent, 1);
}
function message(w, title, body) {
  const h = w.addStack(); h.centerAlignContent(); h.spacing = 6;
  mark(h, 18); text(h, "Calendar Planner", F.semi(12), C.ink, 1);
  w.addSpacer(8);
  text(w, title, F.bold(15), C.ink, 2);
  w.addSpacer(4);
  text(w, body, F.reg(12), C.muted, 4);
  w.addSpacer();
}

function small(p, now) {
  const w = base(); w.setPadding(14, 14, 14, 14);
  const h = w.addStack(); h.centerAlignContent(); h.spacing = 6;
  mark(h, 18);
  text(h, dayName.string(now), F.semi(13), C.accent, 1);
  w.addSpacer(8);
  const next = p.remaining[0];
  if (next) {
    const now2 = next.start <= now;
    text(w, now2 ? "Now" : fmtTime(next.start), F.semi(12), C.accent, 1);
    const t = text(w, next.title, F.bold(17), C.ink, 2); t.minimumScaleFactor = 0.8;
    text(w, next.sub, F.reg(11), C.muted, 1);
  } else {
    text(w, p.special || "All done today", F.bold(17), C.ink, 2);
    text(w, p.special ? "No classes" : "Nothing left on the schedule", F.reg(11), C.muted, 2);
  }
  w.addSpacer();
  const f = w.addStack(); f.centerAlignContent();
  if (p.late) text(f, `${p.late} late`, F.bold(11), C.red, 1);
  else text(f, p.week === 1 ? "1 due this week" : `${p.week} due this week`, F.semi(11), C.muted, 1);
  return w;
}

function medium(p, now) {
  const w = base(); w.setPadding(14, 14, 14, 14);
  const outer = w.addStack(); outer.layoutHorizontally(); outer.spacing = 12;
  const left = outer.addStack(); left.layoutVertically(); left.size = new Size(84, 0);
  const lh = left.addStack(); lh.centerAlignContent(); lh.spacing = 5;
  mark(lh, 16);
  left.addSpacer(6);
  text(left, dayName.string(now), F.semi(13), C.accent, 1);
  text(left, String(now.getDate()), F.title(38), C.ink, 1);
  left.addSpacer();
  const classesToday = p.entries.filter(e => !e.study && e.sub !== "Exam" && e.sub !== "Event").length;
  text(left, p.special || (classesToday === 1 ? "1 class" : `${classesToday} classes`), F.reg(11), C.muted, 1);
  if (p.late) text(left, `${p.late} late`, F.bold(11), C.red, 1);
  else text(left, `${p.week} due this week`, F.reg(11), C.muted, 1);

  const right = outer.addStack(); right.layoutVertically(); right.spacing = 6;
  const rows = [];
  for (const e of p.remaining.slice(0, 2)) rows.push(r => row(r, e.color, e.title, e.sub, e.start <= now ? "Now" : fmtTime(e.start)));
  for (const d of p.due) { if (rows.length >= 4) break; rows.push(r => row(r, d.color, d.it.title, d.cls ? d.cls.name : "", s => badge(s, d))); }
  if (!rows.length) {
    right.addSpacer();
    text(right, "All clear", F.bold(15), C.ink, 1);
    text(right, "Nothing scheduled or due soon.", F.reg(12), C.muted, 2);
    right.addSpacer();
  } else rows.forEach(fn => fn(right));
  right.addSpacer();
  return w;
}

function large(p, now) {
  const w = base(); w.setPadding(16, 16, 16, 16);
  const h = w.addStack(); h.centerAlignContent(); h.spacing = 7;
  mark(h, 22);
  text(h, "Calendar Planner", F.semi(14), C.ink, 1);
  h.addSpacer();
  text(h, `${dayName.string(now)} ${now.getDate()}`, F.semi(13), C.accent, 1);
  w.addSpacer(10);
  text(w, p.special ? `Today · ${p.special}` : "Today", F.bold(15), C.ink, 1);
  w.addSpacer(6);
  const today = p.entries.slice(0, 5);
  if (!today.length) text(w, p.special ? "No classes today." : "Nothing scheduled today.", F.reg(12), C.muted, 1);
  for (const e of today) { row(w, e.color, e.title, e.sub, e.start <= now && e.end > now ? "Now" : fmtTime(e.start), { faded: e.end <= now }); w.addSpacer(5); }
  w.addSpacer(10);
  text(w, "Due soon", F.bold(15), p.late ? C.red : C.ink, 1);
  w.addSpacer(6);
  const due = p.due.slice(0, 5);
  if (!due.length) text(w, "Nothing due in the next two weeks.", F.reg(12), C.muted, 1);
  for (const d of due) { row(w, d.color, d.it.title, d.cls ? d.cls.name : "", s => badge(s, d)); w.addSpacer(5); }
  w.addSpacer();
  return w;
}

function lockRect(p, now) {
  const w = new ListWidget();
  if (APP_URL) w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const next = p.remaining[0];
  if (next) {
    text(w, `${next.start <= now ? "Now" : fmtTime(next.start)} · ${next.title}`, F.bold(14), Color.white(), 1);
    text(w, next.sub, F.reg(12), Color.white(), 1).textOpacity = 0.75;
  } else {
    text(w, p.special || "All done today", F.bold(14), Color.white(), 1);
  }
  const d = p.due[0];
  text(w, d ? `Due: ${d.it.title}` : "Nothing due soon", F.reg(12), Color.white(), 1).textOpacity = 0.75;
  return w;
}
function lockInline(p, now) {
  const w = new ListWidget();
  const next = p.remaining[0];
  text(w, next ? `${fmtTime(next.start)} ${next.title}` : `${p.week} due this week`, F.reg(12), Color.white(), 1);
  return w;
}
function lockCircle(p) {
  const w = new ListWidget();
  w.addSpacer();
  const t = text(w, String(p.week), Font.boldRoundedSystemFont(20), Color.white(), 1); t.centerAlignText();
  const l = text(w, "due", F.reg(10), Color.white(), 1); l.centerAlignText();
  w.addSpacer();
  return w;
}

// ---------- Run ----------
const res = await loadPlanner();
const now = new Date();
const family = config.widgetFamily || "medium";
let widget;
if (res.error === "setup") {
  widget = base(); widget.setPadding(14, 14, 14, 14);
  message(widget, "Almost there", "In Calendar Planner, open Settings and tap “Copy widget for Scriptable”, then paste it into this script.");
} else if (res.error) {
  widget = base(); widget.setPadding(14, 14, 14, 14);
  message(widget, "Can't load your planner", "Check your connection. The widget tries again soon.");
} else {
  const p = plannerFor(res.data, now);
  if (family === "small") widget = small(p, now);
  else if (family === "large" || family === "extraLarge") widget = large(p, now);
  else if (family === "accessoryRectangular") widget = lockRect(p, now);
  else if (family === "accessoryInline") widget = lockInline(p, now);
  else if (family === "accessoryCircular") widget = lockCircle(p);
  else widget = medium(p, now);
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  // Run inside Scriptable: show a preview.
  const a = new Alert();
  a.title = "Calendar Planner widget";
  a.message = "Preview a size. To use it, add a Scriptable widget to your Home Screen and choose this script.";
  a.addAction("Small"); a.addAction("Medium"); a.addAction("Large");
  a.addCancelAction("Done");
  const i = await a.presentSheet();
  if (i >= 0 && !res.error) {
    const p = plannerFor(res.data, now);
    if (i === 0) await small(p, now).presentSmall();
    if (i === 1) await medium(p, now).presentMedium();
    if (i === 2) await large(p, now).presentLarge();
  } else if (i >= 0) {
    await widget.presentMedium();
  }
}
Script.complete();
