/** Presentation only; never used for working-day or entitlement decisions. */
export function isCalendarWeekend(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}
export function shortCalendarName(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).join(" ");
}
