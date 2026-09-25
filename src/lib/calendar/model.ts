export interface CalendarItem {
  id: string;
  source: "google" | "project" | "experiment" | "sprint";
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  href?: string;
  calendarId?: string;
  calendarName?: string;
  location?: string;
  description?: string;
}
export function eventWhen(item: CalendarItem, timeZone: string) {
  if (item.allDay) {
    const { start, end } = datesOf(item, timeZone),
      format = new Intl.DateTimeFormat("lt-LT", {
        dateStyle: "medium",
        timeZone: "UTC",
      });
    return (
      format.formatRange(
        new Date(start + "T12:00:00Z"),
        new Date(end + "T12:00:00Z"),
      ) + " · All day"
    );
  }
  return (
    new Intl.DateTimeFormat("lt-LT", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).formatRange(new Date(item.start), new Date(item.end)) +
    " · " +
    timeZone
  );
}
export function googleEventHref(value?: string) {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" &&
      ["calendar.google.com", "www.google.com"].includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function todayIn(timeZone = "Europe/Zurich", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function monday(day: string) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function addDay(day: string, n: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monthsFrom(start: string, count: number) {
  const [year, month] = start.split("-").map(Number);
  return Array.from(
    { length: count },
    (_, i) => new Date(year, month - 1 + i, 1, 12),
  );
}
export function monthCells(month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1, 12),
    offset = (start.getDay() + 6) % 7;
  start.setDate(1 - offset);
  return Array.from(
    {
      length:
        Math.ceil(
          (offset +
            new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) /
            7,
        ) * 7,
    },
    (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    },
  );
}
export function datesOf(item: CalendarItem, timeZone: string) {
  if (item.allDay)
    return {
      start: item.start.slice(0, 10),
      end: addDay(item.end.slice(0, 10), -1),
    };
  return {
    start: todayIn(timeZone, new Date(item.start)),
    end: todayIn(timeZone, new Date(new Date(item.end).getTime() - 1)),
  };
}
export function occurs(item: CalendarItem, day: string, timeZone: string) {
  const d = datesOf(item, timeZone);
  return d.start <= day && d.end >= day;
}
// Projects and experiments own date ranges, never ordinary scheduled events.
export function operationalItems(
  data: { projects: any[]; experiments: any[]; sprints?: any[] },
  timezone = "Europe/Zurich",
): CalendarItem[] {
  return (["projects", "experiments"] as const).flatMap((kind) =>
    data[kind].flatMap((r) => {
      if (["idea", "abandoned", "cancelled"].includes(r.status)) return [];
      const day = (value: string) =>
        value.includes("T")
          ? todayIn(timezone, new Date(value))
          : value.slice(0, 10);
      const start = r.start_date
        ? day(r.start_date)
        : r.end_date
          ? day(r.end_date)
          : "";
      if (!start) return [];
      const end = r.end_date ? day(r.end_date) : start;
      return [
        {
          id: r.id,
          source:
            kind === "projects"
              ? ("project" as const)
              : ("experiment" as const),
          title: r.title,
          start,
          end: addDay(end, 1),
          allDay: true,
          href:
            (kind === "projects" ? "/projektai/" : "/eksperimentai/") +
            "#item=" +
            encodeURIComponent(r.id),
        },
      ];
    }),
  );
}
export function progress(record: any, today: string) {
  if (record.status === "completed") return "Baigta";
  if (!record.start_date) return "";
  const start = record.start_date.slice(0, 10);
  if (!record.end_date)
    return "Pradėta " + start.split("-").reverse().join(".");
  const duration =
      Math.floor(
        (Date.parse(record.end_date.slice(0, 10)) - Date.parse(start)) /
          86400000,
      ) + 1,
    elapsed =
      Math.floor((Date.parse(today) - Date.parse(start)) / 86400000) + 1;
  return duration > 0
    ? `${Math.min(duration, Math.max(0, elapsed))} / ${duration} diena`
    : "";
}

export function isoWeek(day: string) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const year = date.getUTCFullYear(),
    first = new Date(Date.UTC(year, 0, 4, 12));
  first.setUTCDate(first.getUTCDate() + 3 - ((first.getUTCDay() + 6) % 7));
  return {
    year,
    week: 1 + Math.round((date.valueOf() - first.valueOf()) / 604800000),
  };
}
export function pursuitProgress(
  record: any,
  kind: "projects" | "experiments",
  today = todayIn(),
) {
  if (kind === "projects")
    return record.progress == null ? "" : record.progress + "%";
  if (!record.show_progress || !record.start_date || !record.end_date)
    return "";
  const total =
    Math.floor(
      (Date.parse(record.end_date.slice(0, 10)) -
        Date.parse(record.start_date.slice(0, 10))) /
        86400000,
    ) + 1;
  const elapsed =
    Math.floor(
      (Date.parse(today) - Date.parse(record.start_date.slice(0, 10))) /
        86400000,
    ) + 1;
  return total > 0
    ? `Day ${Math.max(0, Math.min(total, elapsed))} / ${total}`
    : "";
}
