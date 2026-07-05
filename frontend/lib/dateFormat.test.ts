import { describe, expect, it } from "vitest";
import {
  DEFAULT_DATE_FORMAT,
  formatDateTimeValue,
  formatDateValue,
  formatFilenameDateValue,
  normalizeDateFormat,
  parseDateInput,
} from "./dateFormat";

describe("normalizeDateFormat", () => {
  it("falls back to iso for unknown values", () => {
    expect(normalizeDateFormat("invalid")).toBe(DEFAULT_DATE_FORMAT);
    expect(normalizeDateFormat(null)).toBe(DEFAULT_DATE_FORMAT);
  });

  it("accepts supported formats", () => {
    expect(normalizeDateFormat("us_long")).toBe("us_long");
  });
});

describe("parseDateInput", () => {
  it("parses date-only strings in local time", () => {
    const date = parseDateInput("2026-06-30");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(30);
  });

  it("treats missing values as invalid dates", () => {
    expect(Number.isNaN(parseDateInput(null).getTime())).toBe(true);
    expect(Number.isNaN(parseDateInput(undefined).getTime())).toBe(true);
  });
});

describe("formatDateValue", () => {
  const sample = parseDateInput("2026-06-30");

  it("formats iso", () => {
    expect(formatDateValue("iso", sample)).toBe("2026-06-30");
  });

  it("formats us", () => {
    expect(formatDateValue("us", sample)).toBe("06/30/2026");
  });

  it("formats us_long", () => {
    expect(formatDateValue("us_long", sample)).toBe("Jun 30, 2026");
  });

  it("formats eu", () => {
    expect(formatDateValue("eu", sample)).toBe("30.06.2026");
  });

  it("returns em dash for empty or invalid input", () => {
    expect(formatDateValue("iso", "")).toBe("—");
    expect(formatDateValue("iso", null)).toBe("—");
    expect(formatDateValue("iso", undefined)).toBe("—");
    expect(formatDateValue("iso", "not-a-date")).toBe("—");
    expect(formatDateTimeValue("iso", "")).toBe("—");
    expect(formatDateTimeValue("iso", null)).toBe("—");
    expect(formatDateTimeValue("iso", undefined)).toBe("—");
  });

  it("formats uk", () => {
    expect(formatDateValue("uk", sample)).toBe("30 Jun 2026");
  });
});

describe("formatDateTimeValue", () => {
  const sample = new Date(2026, 5, 30, 14, 5);

  it("formats iso datetime", () => {
    expect(formatDateTimeValue("iso", sample)).toBe("2026-06-30 14:05");
  });

  it("formats us datetime", () => {
    expect(formatDateTimeValue("us", sample)).toBe("06/30/2026, 2:05 PM");
  });
});

describe("formatFilenameDateValue", () => {
  it("sanitizes separators", () => {
    expect(formatFilenameDateValue("us", new Date(2026, 5, 30))).toBe("06-30-2026");
  });
});
