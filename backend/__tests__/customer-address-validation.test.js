import { jest } from "@jest/globals";

// TC-EXC-001 regression test: city and pincode were not mandatory anywhere
// (model, controller, or form) when a customer saved a delivery address.
// updateCustomerProfile now rejects any address in the payload that's
// missing city or pincode, before it ever reaches the database.

const mockCustomerFindById = jest.fn();

jest.unstable_mockModule("../app/models/customer.js", () => ({
  default: { findById: mockCustomerFindById, findOne: jest.fn() },
}));
jest.unstable_mockModule("../app/models/transaction.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/services/otpAuthService.js", () => ({
  issueCustomerOtp: jest.fn(),
  sanitizeCustomer: jest.fn((c) => c),
  verifyCustomerOtpCode: jest.fn(),
}));
jest.unstable_mockModule("../app/services/customerEmailOtpService.js", () => ({
  sendCustomerLoginOtp: jest.fn(),
  verifyCustomerLoginOtp: jest.fn(),
}));
jest.unstable_mockModule("../app/validation/customerAuthValidation.js", () => ({
  sendLoginOtpEmailSchema: {},
  sendLoginOtpSchema: {},
  sendSignupOtpSchema: {},
  validateSchema: jest.fn(),
  verifyLoginOtpEmailSchema: {},
  verifyOtpSchema: {},
}));
jest.unstable_mockModule("../app/services/emailService.js", () => ({
  sendBecomeSellerLinksEmail: jest.fn(),
}));
jest.unstable_mockModule("../app/services/loginActivityService.js", () => ({
  recordLogin: jest.fn(),
}));

const { updateCustomerProfile } = await import("../app/controller/customerAuthController.js");

function makeReqRes(body) {
  const req = { user: { id: "cust-1" }, body };
  const res = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  return { req, res };
}

describe("updateCustomerProfile TC-EXC-001 (mandatory city/pincode)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects an address missing city", async () => {
    mockCustomerFindById.mockResolvedValue({ save: jest.fn(), addresses: [] });
    const { req, res } = makeReqRes({
      addresses: [{ fullAddress: "12 MG Road", pincode: "560001" }],
    });

    await updateCustomerProfile(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.payload.message).toMatch(/city and pincode are required/i);
  });

  it("rejects an address missing pincode", async () => {
    mockCustomerFindById.mockResolvedValue({ save: jest.fn(), addresses: [] });
    const { req, res } = makeReqRes({
      addresses: [{ fullAddress: "12 MG Road", city: "Bengaluru" }],
    });

    await updateCustomerProfile(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.payload.message).toMatch(/city and pincode are required/i);
  });

  it("rejects when only one of several addresses is incomplete", async () => {
    mockCustomerFindById.mockResolvedValue({ save: jest.fn(), addresses: [] });
    const { req, res } = makeReqRes({
      addresses: [
        { fullAddress: "12 MG Road", city: "Bengaluru", pincode: "560001" },
        { fullAddress: "Whitefield", city: "", pincode: "560066" },
      ],
    });

    await updateCustomerProfile(req, res);

    expect(res.statusCode).toBe(400);
  });

  it("accepts and saves addresses that include both city and pincode", async () => {
    const customer = { save: jest.fn().mockResolvedValue(undefined), addresses: [] };
    mockCustomerFindById.mockResolvedValue(customer);
    const { req, res } = makeReqRes({
      addresses: [{ fullAddress: "12 MG Road", city: "Bengaluru", pincode: "560001" }],
    });

    await updateCustomerProfile(req, res);

    expect(customer.addresses).toEqual([
      { fullAddress: "12 MG Road", city: "Bengaluru", pincode: "560001" },
    ]);
    expect(customer.save).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});
