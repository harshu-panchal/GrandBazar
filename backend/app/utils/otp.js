const DEFAULT_MOCK_OTP = "1234";

export function getMockOtp() {
  const configured = String(process.env.MOCK_OTP || DEFAULT_MOCK_OTP).trim();
  return configured || DEFAULT_MOCK_OTP;
}

export function useMockOtpEnabled() {
  if (process.env.USE_MOCK_OTP === "true" || process.env.USE_MOCK_OTP === "1") {
    return true;
  }
  if (process.env.USE_MOCK_OTP === "false" || process.env.USE_MOCK_OTP === "0") {
    return false;
  }
  // Explicit opt-out of real SMS => mock (including production when USE_REAL_SMS=false).
  if (process.env.USE_REAL_SMS === "false" || process.env.USE_REAL_SMS === "0") {
    return true;
  }
  if (process.env.USE_REAL_SMS === "true" || process.env.USE_REAL_SMS === "1") {
    return false;
  }
  return process.env.NODE_ENV !== "production";
}

export const useRealSMS = () => !useMockOtpEnabled();

const OTP_LENGTH = Math.max(4, parseInt(process.env.OTP_LENGTH || "4", 10));

function randomOtp(length) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

export const generateOTP = () => {
  return useRealSMS() ? randomOtp(OTP_LENGTH) : getMockOtp();
};

/** @deprecated use getMockOtp() */
export const MOCK_OTP = getMockOtp();

export { getMockOtp as MOCK_OTP_VALUE };
