import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountsFromGrossCents,
  amountsFromNetCents,
  isValidVatRate,
} from "@/lib/jobs/budget/vat";

describe("VAT calculations", () => {
  it("validates VAT rates", () => {
    assert.equal(isValidVatRate("23%"), true);
    assert.equal(isValidVatRate("12.5%"), true);
    assert.equal(isValidVatRate("zw."), true);
    assert.equal(isValidVatRate("invalid"), false);
  });

  it("computes net and tax from gross at 23%", () => {
    const result = amountsFromGrossCents(12_300, "23%");
    assert.equal(result.grossCents, 12_300);
    assert.equal(result.netCents, 10_000);
    assert.equal(result.taxCents, 2_300);
  });

  it("computes gross from net at 8%", () => {
    const result = amountsFromNetCents(10_000, "8%");
    assert.equal(result.netCents, 10_000);
    assert.equal(result.taxCents, 800);
    assert.equal(result.grossCents, 10_800);
  });

  it("handles non-calculable VAT", () => {
    const result = amountsFromGrossCents(10_000, "nie dotyczy");
    assert.equal(result.netCents, 10_000);
    assert.equal(result.taxCents, 0);
    assert.equal(result.grossCents, 10_000);
  });
});
