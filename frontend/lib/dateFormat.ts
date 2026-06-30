export type DateFormatId = "iso" | "us" | "us_long" | "eu" | "uk" | "locale";

export const DEFAULT_DATE_FORMAT: DateFormatId = "iso";

export const DATE_FORMAT_OPTIONS: Array<{
  id: DateFormatId;
  label: string;
  description: string;
}> = [
  {
    id: "iso",
    label: "ISO (2026-06-30)",
    description: "Year-month-day — matches analysis dates and exports",
  },
  {
    id: "us",
    label: "US (06/30/2026)",
    description: "Month/day/year with slashes",
  },
  {
    id: "us_long",
    label: "US long (Jun 30, 2026)",
    description: "Abbreviated month — used for portfolio snapshots",
  },
  {
    id: "eu",
    label: "European (30.06.2026)",
    description: "Day.month.year with dots",
  },
  {
    id: "uk",
    label: "UK (30 Jun 2026)",
    description: "Day before abbreviated month",
  },
  {
    id: "locale",
    label: "Browser locale",
    description: "Follows your system or browser language settings",
  },
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const SUPPORTED = new Set<DateFormatId>(DATE_FORMAT_OPTIONS.map((option) => option.id));

export function normalizeDateFormat(value: string | null | undefined): DateFormatId {
  const normalized = (value ?? DEFAULT_DATE_FORMAT).trim().toLowerCase() as DateFormatId;
  return SUPPORTED.has(normalized) ? normalized : DEFAULT_DATE_FORMAT;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Parse API date-only strings as local calendar dates to avoid UTC day shifts. */
export function parseDateInput(value: string | Date): Date {
  if (value instanceof Date) return value;
  const dateOnly = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) && value.length <= 10) {
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

function isDateOnlyString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) && value.length <= 10;
}

function dateParts(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
  };
}

function formatTime24(hours: number, minutes: number): string {
  return `${pad2(hours)}:${pad2(minutes)}`;
}

function formatTime12(hours: number, minutes: number): string {
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${pad2(minutes)} ${period}`;
}

export function formatDateValue(format: DateFormatId, value: string | Date): string {
  const date = typeof value === "string" && isDateOnlyString(value)
    ? parseDateInput(value)
    : parseDateInput(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const { year, month, day } = dateParts(date);
  const monthPadded = pad2(month);
  const dayPadded = pad2(day);
  const monthShort = MONTHS_SHORT[date.getMonth()];

  switch (format) {
    case "iso":
      return `${year}-${monthPadded}-${dayPadded}`;
    case "us":
      return `${monthPadded}/${dayPadded}/${year}`;
    case "us_long":
      return `${monthShort} ${day}, ${year}`;
    case "eu":
      return `${dayPadded}.${monthPadded}.${year}`;
    case "uk":
      return `${day} ${monthShort} ${year}`;
    case "locale":
      return date.toLocaleDateString();
  }
}

export function formatDateTimeValue(format: DateFormatId, value: string | Date): string {
  const date = parseDateInput(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const datePart = formatDateValue(format, date);
  const { hours, minutes } = dateParts(date);

  switch (format) {
    case "iso":
      return `${datePart} ${formatTime24(hours, minutes)}`;
    case "us":
    case "us_long":
      return `${datePart}, ${formatTime12(hours, minutes)}`;
    case "eu":
    case "uk":
      return `${datePart} ${formatTime24(hours, minutes)}`;
    case "locale":
      return date.toLocaleString();
  }
}

export function formatFilenameDateValue(format: DateFormatId, value: Date = new Date()): string {
  return formatDateValue(format, value).replace(/[/,:\s]+/g, "-");
}

export function createDateFormatter(format: DateFormatId) {
  const normalized = normalizeDateFormat(format);
  return {
    dateFormat: normalized,
    formatDate: (value: string | Date) => formatDateValue(normalized, value),
    formatDateTime: (value: string | Date) => formatDateTimeValue(normalized, value),
    formatFilenameDate: (value?: Date) => formatFilenameDateValue(normalized, value),
  };
}
