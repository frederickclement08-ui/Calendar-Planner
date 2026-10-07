//
// Calendar Planner widget for ScriptWidget (Mac, also iPhone and iPad)
// Shows today's classes and study sessions, and what's due next,
// in the same style as the Calendar Planner app.
//
// Setup: in Calendar Planner, open Settings › Synced with GitHub › Copy Mac widget.
// In ScriptWidget: New Widget › Blank Widget, replace everything in main.jsx with it,
// then in the Config tab turn on Network and add gist.githubusercontent.com.
//

// Filled in automatically when you copy the widget from Calendar Planner.
const DATA_URL = "";
const APP_URL = "";

// ---------- Look ----------
const dark = typeof $device !== "undefined" && $device.isdarkmode && $device.isdarkmode();
const P = dark
  ? { ink: "#FFFFFF", muted: "#98989F", accent: "#A898FF", red: "#FF453A", chip: "#787880,0.32", top: "#2A1D45", bottom: "#000000" }
  : { ink: "#000000", muted: "#6E6E73", accent: "#5B3FE8", red: "#FF3B30", chip: "#787880,0.14", top: "#EDE6FF", bottom: "#FFFFFF" };
const NOCLASS = "#9AA3B5";
const grad = g => "gradient:" + JSON.stringify(g);
const BG = grad({ type: "linear", colors: [P.top, P.bottom, P.bottom], startPoint: "topLeading", endPoint: "bottomTrailing" });
const BRAND = grad({ type: "linear", colors: ["#6A4DFF", "#E9407A", "#FF8A3D"], startPoint: "topLeading", endPoint: "bottomTrailing" });

// ---------- Dates ----------
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const isoDay = d => (d.getDay() + 6) % 7 + 1; // Monday = 1 … Sunday = 7
const withTime = (d, t) => { const [h, m] = String(t || "23:59").split(":").map(Number); const x = new Date(d); x.setHours(h || 0, m || 0, 0, 0); return x; };
const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 864e5);
const fmtTime = d => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const weekday = d => d.toLocaleDateString([], { weekday: "long" });
const short = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// ---------- Data ----------
async function loadPlanner() {
  if (!DATA_URL) return { error: "setup" };
  try {
    const text = await fetch(DATA_URL + "?t=" + Date.now());
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.items)) throw new Error("bad data");
    try { $storage.setString("calendarPlanner.cache", text); } catch (e) {}
    return { data };
  } catch (e) {
    try {
      const cached = $storage.getString("calendarPlanner.cache");
      if (cached) return { data: JSON.parse(cached) };
    } catch (x) {}
    return { error: "offline" };
  }
}

function plannerFor(data, now) {
  const classes = data.classes || [], items = data.items || [], specials = data.specialDays || [];
  const blocks = (data.plan && data.plan.blocks) || [], settings = data.settings || {};
  const classById = id => classes.find(c => c.id === id);
  const colorOf = it => { const c = classById(it.classId); return c ? c.color : NOCLASS; };
  const inTerm = d => !(settings.termStart && d < parseYmd(settings.termStart)) && !(settings.termEnd && d > parseYmd(settings.termEnd));
  const specialFor = d => { const k = ymd(d); const list = specials.filter(x => k >= x.start && k <= (x.end || x.start)); return list.find(x => +x.follows) || list[0] || null; };
  const today = startOfDay(now), key = ymd(today);

  const entries = [];
  const sp = specialFor(today);
  if (inTerm(today) && !(sp && !+sp.follows)) {
    const day = sp ? +sp.follows : isoDay(today);
    for (const c of classes) for (const s of (c.sessions || [])) if (+s.day === day) {
      entries.push({ start: withTime(today, s.start), end: withTime(today, s.end), title: c.name, sub: s.room || "Class", color: c.color, isClass: true });
    }
  }
  for (const it of items) {
    if (it.done || it.due !== key || !it.time || !(it.kind === "exam" || it.kind === "event")) continue;
    const start = withTime(today, it.time);
    entries.push({ start, end: new Date(start.getTime() + (+it.duration || 120) * 6e4), title: it.title, sub: it.kind === "exam" ? "Exam" : "Event", color: colorOf(it), itemId: it.id });
  }
  for (const b of blocks) {
    if (b.date !== key || b.done) continue;
    const it = items.find(i => i.id === b.itemId);
    if (it && it.done) continue;
    entries.push({ start: withTime(today, b.start), end: withTime(today, b.end), title: b.title || "Study", sub: b.focus || "Study session", color: it ? colorOf(it) : P.accent });
  }
  entries.sort((a, b) => a.start - b.start);

  const due = items.filter(it => !it.done && it.kind !== "event" && it.due && dayDiff(parseYmd(it.due), today) <= 14)
    .map(it => ({ it, at: withTime(parseYmd(it.due), it.time || "23:59"), diff: dayDiff(parseYmd(it.due), today), color: colorOf(it), cls: classById(it.classId) }))
    .sort((a, b) => a.at - b.at);
  return {
    entries,
    remaining: entries.filter(e => e.end > now),
    classesToday: entries.filter(e => e.isClass).length,
    due,
    week: due.filter(d => d.diff >= 0 && d.diff <= 7).length,
    late: due.filter(d => d.diff < 0).length,
    special: sp ? (sp.label || (+sp.follows ? "Schedule change" : "Day off")) : ""
  };
}

// ---------- Pieces ----------
function logo(size) {
  return <zstack frame={`${size},${size}`} background={BRAND} corner={Math.round(size * 0.25)}>
    <icon systemName="checkmark" size={Math.round(size * 0.5)} color="#FFFFFF" />
  </zstack>;
}
function badge(d) {
  if (d.diff < 0) return <badge text={d.diff === -1 ? "1 d late" : `${-d.diff} d late`} color="#FFFFFF" background={P.red} radius="8" />;
  if (d.diff === 0) return <badge text={d.it.time ? fmtTime(d.at) : "Today"} color="#FFFFFF" background={P.red} radius="8" />;
  if (d.diff === 1) return <badge text="Tomorrow" color={P.ink} background="#FF9500,0.24" radius="8" />;
  return <badge text={`in ${d.diff} d`} color={P.ink} background={P.chip} radius="8" />;
}
// Compact rows so every size fits without being cut off.
function row(color, title, sub, right, faded) {
  return <hstack spacing="6" opacity={faded ? 0.5 : 1}>
    <rect frame="3,22" corner="1.5" color={color} />
    <vstack alignment="leading" spacing="0">
      <text font="12,semibold" color={P.ink}>{short(title, 28)}</text>
      {sub ? <text font="10" color={P.muted}>{short(sub, 32)}</text> : null}
    </vstack>
    <spacer />
    {right}
  </hstack>;
}
const timeLabel = (e, now) => <text font="11,semibold" color={e.end <= now ? P.muted : P.accent}>{e.start <= now && e.end > now ? "Now" : fmtTime(e.start)}</text>;
/** Deadlines, minus anything already on today's schedule (an exam shouldn't show twice). */
const dueWithout = (p, shown) => { const ids = new Set(shown.map(e => e.itemId).filter(Boolean)); return p.due.filter(d => !ids.has(d.it.id)); };

function small(p, now) {
  const next = p.remaining[0];
  return <vstack frame="max,topLeading" alignment="leading" spacing="3" padding="14" background={BG}>
    <hstack spacing="6">{logo(18)}<text font="13,semibold" color={P.accent}>{weekday(now)}</text></hstack>
    <spacer frame="1,6" />
    {next ? [
      <text font="12,semibold" color={P.accent}>{next.start <= now ? "Now" : fmtTime(next.start)}</text>,
      <text font="17,bold" color={P.ink}>{short(next.title, 30)}</text>,
      <text font="11" color={P.muted}>{short(next.sub, 30)}</text>
    ] : [
      <text font="17,bold" color={P.ink}>{p.special || "All done today"}</text>,
      <text font="11" color={P.muted}>{p.special ? "No classes" : "Nothing left on the schedule"}</text>
    ]}
    <spacer />
    {p.late
      ? <text font="11,bold" color={P.red}>{p.late} late</text>
      : <text font="11,semibold" color={P.muted}>{p.week === 1 ? "1 due this week" : `${p.week} due this week`}</text>}
  </vstack>;
}

function medium(p, now) {
  const rows = [];
  const today = p.remaining.slice(0, 2);
  for (const e of today) rows.push(row(e.color, e.title, e.sub, timeLabel(e, now)));
  for (const d of dueWithout(p, p.remaining)) { if (rows.length >= 3) break; rows.push(row(d.color, d.it.title, d.cls ? d.cls.name : "", badge(d))); }
  return <hstack frame="max,topLeading" alignment="top" spacing="12" padding="14" background={BG}>
    <vstack frame="80,max,topLeading" alignment="leading" spacing="1">
      {logo(16)}
      <spacer frame="1,4" />
      <text font="12,semibold" color={P.accent}>{weekday(now)}</text>
      <text font="32,heavy,rounded" color={P.ink}>{now.getDate()}</text>
      <spacer />
      <text font="11" color={P.muted}>{p.special || (p.classesToday === 1 ? "1 class" : `${p.classesToday} classes`)}</text>
      {p.late
        ? <text font="11,bold" color={P.red}>{p.late} late</text>
        : <text font="11" color={P.muted}>{p.week} due this week</text>}
    </vstack>
    <vstack frame="max,topLeading" alignment="leading" spacing="5">
      {rows.length ? rows : [
        <spacer />,
        <text font="15,bold" color={P.ink}>All clear</text>,
        <text font="12" color={P.muted}>Nothing scheduled or due soon.</text>
      ]}
      <spacer />
    </vstack>
  </hstack>;
}

function large(p, now) {
  const today = p.remaining.slice(0, 3);
  const more = p.remaining.length - today.length;
  const dueAll = dueWithout(p, p.remaining);
  const due = dueAll.slice(0, Math.max(2, 6 - today.length));
  const doneToday = p.entries.length && !p.remaining.length;
  return <vstack frame="max,topLeading" alignment="leading" spacing="4" padding="14" background={BG}>
    <hstack spacing="6">
      {logo(18)}
      <text font="13,semibold" color={P.ink}>Calendar Planner</text>
      <spacer />
      <text font="12,semibold" color={P.accent}>{weekday(now)} {now.getDate()}</text>
    </hstack>
    <spacer frame="1,4" />
    <hstack spacing="6">
      <text font="14,bold" color={P.ink}>{p.special ? `Today · ${short(p.special, 22)}` : "Today"}</text>
      <spacer />
      {more > 0 ? <text font="10,semibold" color={P.muted}>+{more} more</text> : null}
    </hstack>
    {today.length
      ? today.map(e => row(e.color, e.title, e.sub, timeLabel(e, now)))
      : <text font="11" color={P.muted}>{doneToday ? "All done for today." : p.special ? "No classes today." : "Nothing scheduled today."}</text>}
    <spacer frame="1,6" />
    <hstack spacing="6">
      <text font="14,bold" color={p.late ? P.red : P.ink}>Due soon</text>
      <spacer />
      {dueAll.length > due.length ? <text font="10,semibold" color={P.muted}>+{dueAll.length - due.length} more</text> : null}
    </hstack>
    {due.length
      ? due.map(d => row(d.color, d.it.title, d.cls ? d.cls.name : "", badge(d)))
      : <text font="11" color={P.muted}>Nothing due in the next two weeks.</text>}
    <spacer />
  </vstack>;
}

function message(title, body) {
  return <vstack frame="max,topLeading" alignment="leading" spacing="6" padding="14" background={BG}>
    <hstack spacing="6">{logo(18)}<text font="12,semibold" color={P.ink}>Calendar Planner</text></hstack>
    <spacer frame="1,4" />
    <text font="15,bold" color={P.ink}>{title}</text>
    <text font="12" color={P.muted}>{body}</text>
    <spacer />
  </vstack>;
}

// ---------- Run ----------
const res = await loadPlanner();
const now = new Date();
const size = $getenv("widget-size") || "medium";
if (res.error === "setup") {
  $render(message("Almost there", "In Calendar Planner, open Settings and tap “Copy Mac widget”, then paste it into this widget's main.jsx."));
} else if (res.error) {
  $render(message("Can't load your planner", "Check your connection, and that Network is on with gist.githubusercontent.com allowed in the Config tab."));
} else {
  const p = plannerFor(res.data, now);
  if (size === "small") $render(small(p, now));
  else if (size === "large" || size === "extraLarge" || size === "extraLargePortrait") $render(large(p, now));
  else $render(medium(p, now));
}
