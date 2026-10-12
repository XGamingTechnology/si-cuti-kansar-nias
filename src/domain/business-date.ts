export const BUSINESS_TIME_ZONE = "Asia/Jakarta";

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Returns the YYYY-MM-DD calendar date observed by SI CUTI in Asia/Jakarta. */
export function toBusinessDate(value: Date): string {
  const parts = Object.fromEntries(
    businessDateFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
