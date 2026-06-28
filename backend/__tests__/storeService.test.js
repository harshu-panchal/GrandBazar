import { jest } from "@jest/globals";
import {
  isValidGstNumber,
  normalizeGstNumber,
  validateStoreKycPayload,
  getMissingKycTextFields,
} from "../app/services/storeService.js";

describe("storeService KYC", () => {
  it("validates GSTIN format", () => {
    expect(isValidGstNumber("22AAAAA0000A1Z5")).toBe(true);
    expect(isValidGstNumber("invalid")).toBe(false);
  });

  it("normalizes GSTIN to uppercase", () => {
    expect(normalizeGstNumber("22aaaaa0000a1z5")).toBe("22AAAAA0000A1Z5");
  });

  it("requires gst fields when not exempt", () => {
    const missing = getMissingKycTextFields({
      shopName: "Shop",
      aadharNumber: "1",
      panNumber: "2",
      accountHolder: "A",
      accountNumber: "123",
      ifsc: "IFSC",
      bankName: "Bank",
    });
    expect(missing).toContain("gstNumber");
  });

  it("throws when gst certificate missing", () => {
    expect(() => validateStoreKycPayload(
      {
        shopName: "Shop",
        aadharNumber: "1",
        panNumber: "2",
        gstNumber: "22AAAAA0000A1Z5",
        accountHolder: "A",
        accountNumber: "123",
        ifsc: "IFSC",
        bankName: "Bank",
      },
      { aadhar: "https://x/a.pdf", pan: "https://x/p.pdf", bankProof: "https://x/b.pdf" },
    )).toThrow(/GST Certificate/);
  });
});
