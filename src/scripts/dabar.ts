import { author } from "./author";
import { focusSurface } from "./focus";
import { operationSurface, setOperationalTimezone } from "./operations";
import { api, el, node, message } from "./client";
import {
  isoDay,
  todayIn,
  monday,
  addDay,
  monthsFrom,
  monthCells,
  operationalItems,
  occurs,
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
  if (!agenda.children.length) agenda.append(node("li", "No events."));
  el<HTMLDialogElement>("day-dialog").showModal();
}
function openItem(item: CalendarItem) {
  if (item.source !== "google") {
    el<HTMLDialogElement>("day-dialog").close();
    const id = new URL(item.href!, location.origin).hash.slice(6);
    const row = [
      ...document.querySelectorAll<HTMLDetailsElement>("[data-operation]"),
    ].find((row) => row.dataset.id === decodeURIComponent(id));
    if (row) {
      row.open = true;
      row.scrollIntoView({ block: "start" });
    } else location.href = item.href!;
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
            pretty(day) + (list.length ? ", " + list.length + " events" : ""),
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
    const auth = await author();
    if (!auth.authenticated) {
      location.replace("/editor/?returnTo=%2Fdabar%2F");
      return;
    }
    try {
      const s = await api("calendar/preferences");
      timezone = s.timezone;
    } catch {}
    today = todayIn(timezone);
    el("today-label").textContent = pretty(today);
    snapshot = await api("ops/notebook?week=" + monday(today));
    local = operationalItems(snapshot, timezone);
    setOperationalTimezone(timezone);
    for (const root of document.querySelectorAll<HTMLElement>(
      "[data-dabar-operations]",
    )) {
      const kind = root.dataset.operations as "projects" | "experiments";
      operationSurface(root, snapshot[kind], kind);
    }
    void focusSurface(
      document.querySelector("[data-weekly-focus]")!,
      snapshot.focus,
    );
    await loadCalendar();
  } catch (e) {
    message((e as Error).message, true);
    render();
  }
}
document.addEventListener("operations:changed", () => {
  void api("ops/notebook?week=" + monday(today))
    .then((data) => {
      snapshot = data;
      local = operationalItems(snapshot, timezone);
      render();
    })
    .catch((e) => message(e.message, true));
});
void boot();
