import { api, session, el, node, message } from "./client";
import {
  isoDay,
  todayIn,
  monday,
  addDay,
  monthsFrom,
  monthCells,
  operationalItems,
  occurs,
  progress,
  eventWhen,
  googleEventHref,
  type CalendarItem,
} from "../lib/calendar/model";
let timezone = "Europe/Zurich",
  today = todayIn(),
  start = today.slice(0, 7) + "-01",
  count = 1,
  snapshot: any = {
    projects: [],
    experiments: [],
    sprints: [],
    habits: [],
    entries: [],
    focus: { version: 0, items: [] },
  },
  google: CalendarItem[] = [],
  local: CalendarItem[] = [],
  generation = 0;
try {
  const saved = Number(localStorage.getItem("deepaltitude-months"));
  if ([1, 3, 6, 12].includes(saved)) count = saved;
} catch {}
el<HTMLSelectElement>("month-count").value = String(count);
const sources = () =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>(
      ".calendar-filters input:checked",
    ),
  ).map((i) => i.value);
const items = () =>
  [...local, ...google].filter((i) => sources().includes(i.source));
function pretty(day: string) {
  return new Intl.DateTimeFormat("lt-LT", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
}
function openDay(day: string) {
  el("day-title").textContent = pretty(day);
  const agenda = el("day-agenda");
  agenda.replaceChildren();
  for (const item of items().filter((i) => occurs(i, day, timezone))) {
    const li = node("li"),
      button = node("button", item.title, { type: "button" });
    li.append(
      node(
        "span",
        item.source === "google"
          ? item.calendarName || "Google Calendar"
          : item.source,
        { class: "agenda-source" },
      ),
      button,
    );
    button.addEventListener("click", () => openItem(item));
    agenda.append(li);
  }
  if (!agenda.children.length) agenda.append(node("li", "Įvykių nėra."));
  el<HTMLDialogElement>("day-dialog").showModal();
}
function openItem(item: CalendarItem) {
  if (item.source !== "google") {
    location.href = item.href!;
    return;
  }
  el<HTMLDialogElement>("day-dialog").close();
  openEvent(item);
}
function render() {
  const root = el("months");
  root.replaceChildren();
  for (const month of monthsFrom(start, count)) {
    const section = node("section", undefined, {
        class: "calendar-month",
        id: "month-" + isoDay(month).slice(0, 7),
      }),
      heading = node(
        "h3",
        new Intl.DateTimeFormat("lt-LT", {
          year: "numeric",
          month: "long",
        }).format(month),
      );
    section.append(heading);
    const grid = node("div", undefined, {
      class: "calendar-grid",
      role: "group",
      "aria-label": heading.textContent!,
    });
    for (const d of ["P", "A", "T", "K", "Pn", "Š", "S"])
      grid.append(node("div", d, { class: "weekday" }));
    for (const date of monthCells(month)) {
      const day = isoDay(date),
        list = items().filter((i) => occurs(i, day, timezone)),
        cell = node("div", undefined, {
          class:
            "day-cell" +
            (date.getMonth() !== month.getMonth() ? " outside" : "") +
            (day === today ? " today" : ""),
        }),
        button = node("button", undefined, {
          type: "button",
          class: "day-open",
          "aria-label":
            pretty(day) + (list.length ? ", " + list.length + " įvykiai" : ""),
        });
      button.append(
        node("span", String(date.getDate())),
        node("span", list.length ? "+" + list.length : "", {
          class: "day-count",
        }),
      );
      button.addEventListener("click", () => openDay(day));
      cell.append(button);
      for (const item of list.slice(0, 3)) {
        const b = node("button", item.title, {
          type: "button",
          class: "calendar-event",
          "data-source": item.source,
          title: item.title,
        });
        b.addEventListener("click", () => openItem(item));
        cell.append(b);
      }
      grid.append(cell);
    }
    section.append(grid);
    root.append(section);
  }
  root.setAttribute("aria-busy", "false");
}
async function loadCalendar() {
  const run = ++generation;
  render();
  el("calendar-status").textContent = "Loading Google Calendar…";
  const last = monthsFrom(start, count).at(-1)!,
    end = new Date(last.getFullYear(), last.getMonth() + 1, 1, 12);
  try {
    const result = await api(
      "calendar/events?start=" +
        addDay(start, -2) +
        "&end=" +
        addDay(isoDay(end), 2),
    );
    if (run !== generation) return;
    google = result.items;
    timezone = result.timezone || timezone;
    today = todayIn(timezone);
    el("calendar-status").textContent = result.warning || "";
  } catch (e) {
    if (run !== generation) return;
    google = [];
    el("calendar-status").textContent =
      (e as Error).message + " DeepAltitude dates are still shown.";
  }
  render();
}
el("month-count").addEventListener("change", () => {
  count = Number(el<HTMLSelectElement>("month-count").value);
  try {
    localStorage.setItem("deepaltitude-months", String(count));
  } catch {}
  void loadCalendar();
});
function move(delta: number) {
  const date = monthsFrom(start, 1)[0];
  date.setMonth(date.getMonth() + delta);
  start = isoDay(date);
  void loadCalendar();
}
el("previous-month").addEventListener("click", () => move(-1));
el("next-month").addEventListener("click", () => move(1));
el("today-month").addEventListener("click", async () => {
  today = todayIn(timezone);
  let month = el("month-" + today.slice(0, 7));
  if (!month) {
    start = today.slice(0, 7) + "-01";
    await loadCalendar();
    month = el("month-" + today.slice(0, 7));
  }
  month?.scrollIntoView({ block: "start" });
});
el("retry-calendar").addEventListener("click", () => void loadCalendar());
document
  .querySelectorAll(".calendar-filters input")
  .forEach((input) => input.addEventListener("change", render));
function renderLists() {
  for (const k of ["projects", "experiments", "sprints"]) {
    const list = el(k + "-list");
    list.replaceChildren(
      ...snapshot[k]
        .filter((r: any) => r.status === "active")
        .map((r: any) => {
          const row = node("li");
          row.append(
            node("a", r.title + " →", {
              href: "/editor/?kind=" + k + "&id=" + r.id,
            }),
          );
          if (r.start_date)
            row.append(node("p", progress(r, today), { class: "entry-tags" }));
          return row;
        }),
    );
    if (!list.children.length)
      list.append(
        node("li", "Aktyvių įrašų kol kas nėra.", { class: "muted" }),
      );
  }
}
function renderHabits() {
  const root = el("habits"),
    week = monday(today);
  root.replaceChildren();
  const head = node("div", undefined, { class: "habit-row habit-head" });
  head.append(node("span", "", { class: "habit-name" }));
  for (const d of ["P", "A", "T", "K", "Pn", "Š", "S"])
    head.append(node("span", d));
  root.append(head);
  for (const habit of snapshot.habits.filter((h: any) => h.active)) {
    const row = node("div", undefined, { class: "habit-row" });
    row.append(
      node(
        "p",
        habit.title +
          (habit.quantity ? " · " + habit.quantity : "") +
          (habit.recurrence === "weekly"
            ? " · " + habit.weekly_target + " / sav."
            : ""),
      ),
    );
    for (let n = 0; n < 7; n++) {
      const date = addDay(week, n),
        done = snapshot.entries.some(
          (e: any) => e.habit === habit.id && e.date === date,
        ),
        scheduled =
          habit.recurrence === "daily" ||
          habit.recurrence === "weekly" ||
          (habit.recurrence === "weekdays" && n < 5) ||
          (habit.recurrence === "days" && habit.weekdays.includes(n));
      const b = node("button", done ? "✓" : scheduled ? "○" : "·", {
        type: "button",
        class: "habit-check" + (!scheduled ? " off-schedule" : ""),
        "aria-pressed": String(done),
        "aria-label": habit.title + " · " + pretty(date),
      });
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          await api("ops/habit", {
            habit: habit.id,
            date,
            done: !done,
            quantity: habit.quantity,
          });
          snapshot.entries = snapshot.entries.filter(
            (e: any) => e.habit !== habit.id || e.date !== date,
          );
          if (!done) snapshot.entries.push({ habit: habit.id, date });
          renderHabits();
        } catch (e) {
          message((e as Error).message, true);
          b.disabled = false;
        }
      });
      row.append(b);
    }
    root.append(row);
  }
  if (!snapshot.habits.length)
    root.append(node("p", "Įpročių kol kas nėra.", { class: "muted" }));
}
el("focus-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = el("focus-form").querySelector("button")!;
  button.disabled = true;
  try {
    snapshot.focus = await api("ops/focus", {
      week: monday(today),
      version: snapshot.focus.version,
      items: el<HTMLTextAreaElement>("focus-items")
        .value.split("\n")
        .filter((s) => s.trim()),
    });
    message("Focus saved.");
  } catch (e) {
    message((e as Error).message, true);
  } finally {
    button.disabled = false;
  }
});
document
  .querySelectorAll("[data-close]")
  .forEach((b) =>
    b.addEventListener("click", () => b.closest("dialog")!.close()),
  );
function openEvent(item: CalendarItem) {
  el("event-title").textContent = item.title;
  el("event-calendar").textContent = item.calendarName || "Google Calendar";
  el("event-when").textContent = eventWhen(item, timezone);
  for (const name of ["location", "description"] as const) {
    const field = el("event-" + name);
    field.textContent = item[name] || "";
    field.hidden = !item[name];
  }
  const link = el<HTMLAnchorElement>("event-google"),
    href = googleEventHref(item.href);
  link.hidden = !href;
  if (href) link.href = href;
  else link.removeAttribute("href");
  el<HTMLDialogElement>("event-dialog").showModal();
}
async function boot() {
  try {
    const auth = await session();
    if (!auth.authenticated) {
      location.replace("/editor/?returnTo=%2Fdabar%2F");
      return;
    }
    try {
      const s = await api("calendar/settings");
      timezone = s.preferences.timezone;
    } catch {}
    today = todayIn(timezone);
    el("today-label").textContent = pretty(today);
    snapshot = await api("ops/snapshot?week=" + monday(today));
    local = operationalItems(snapshot);
    el<HTMLTextAreaElement>("focus-items").value =
      snapshot.focus.items.join("\n");
    renderLists();
    renderHabits();
    await loadCalendar();
  } catch (e) {
    message((e as Error).message, true);
    render();
  }
}
void boot();
