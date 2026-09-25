// Interpret a date/time without an offset in the author's configured timezone.
// Date-only values remain calendar dates. Explicit offsets remain unambiguous.
export function canonicalDate(value: string, timeZone: string): string {
  if (!value.includes("T") || /[Zz]$|[+-]\d\d:\d\d$/.test(value)) return value;
  const parts = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!parts) throw Error("Invalid date/time.");
  const [year, month, day, hour, minute, second] = parts
    .slice(1)
    .map((v) => Number(v || 0));
  const wall = Date.UTC(year, month - 1, day, hour, minute, second),
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  const asWall = (instant: number) => {
    const p = Object.fromEntries(
      format.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
    );
    return Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
  };
  let guess = wall;
  for (let i = 0; i < 3; i++) guess += wall - asWall(guess);
  if (asWall(guess) !== wall)
    throw Error(
      "This local time does not exist because of a daylight-saving change. Choose another time.",
    );
  return new Date(guess).toISOString();
}
