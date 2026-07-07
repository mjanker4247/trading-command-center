import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
    assert.equal(normalizeDateFormat("invalid"), DEFAULT_DATE_FORMAT);
    assert.equal(normalizeDateFormat(null), DEFAULT_DATE_FORMAT);
  });

  it("accepts supported formats", () => {
    assert.equal(normalizeDateFormat("us_long"), "us_long");
  });
});

describe("parseDateInput", () => {
  it("parses date-only strings in local time", () => {
    const date = parseDateInput("2026-06-30");
    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 5);
    assert.equal(date.getDate(), 30);
  });

  it("treats missing values as invalid dates", () => {
    assert.equal(Number.isNaN(parseDateInput(null).getTime()), true);
    assert.equal(Number.isNaN(parseDateInput(undefined).getTime()), true);
  });
});

describe("formatDateValue", () => {
  const sample = parseDateInput("2026-06-30");

  it("formats iso", () => {
    assert.equal(formatDateValue("iso", sample), "2026-06-30");
  });

  it("formats us", () => {
    assert.equal(formatDateValue("us", sample), "06/30/2026");
  });

  it("formats us_long", () => {
    assert.equal(formatDateValue("us_long", sample), "Jun 30, 2026");
  });

  it("formats eu", () => {
    assert.equal(formatDateValue("eu", sample), "30.06.2026");
  });

  it("returns em dash for empty or invalid input", () => {
    assert.equal(formatDateValue("iso", ""), "—");
    assert.equal(formatDateValue("iso", null), "—");
    assert.equal(formatDateValue("iso", undefined), "—");
    assert.equal(formatDateValue("iso", "not-a-date"), "—");
    assert.equal(formatDateTimeValue("iso", ""), "—");
    assert.equal(formatDateTimeValue("iso", null), "—");
    assert.equal(formatDateTimeValue("iso", undefined), "—");
  });

  it("formats uk", () => {
    assert.equal(formatDateValue("uk", sample), "30 Jun 2026");
  });
});

describe("formatDateTimeValue", () => {
  const sample = new Date(2026, 5, 30, 14, 5);

  it("formats iso datetime", () => {
    assert.equal(formatDateTimeValue("iso", sample), "2026-06-30 14:05");
  });

  it("formats us datetime", () => {
    assert.equal(formatDateTimeValue("us", sample), "06/30/2026, 2:05 PM");
  });
});

describe("formatFilenameDateValue", () => {
  it("sanitizes separators", () => {
    assert.equal(formatFilenameDateValue("us", new Date(2026, 5, 30)), "06-30-2026");
  });
});
