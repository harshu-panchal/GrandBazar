import axios from "axios";
import { toIndianNumber } from "../utils/smsHelpers.js";
import { useMockOtpEnabled } from "../utils/otp.js";

// Template names to register in the BhashSMS dashboard (override via env).
// Body text + variables are in backend/docs/WHATSAPP_TEMPLATES.md.
const templates = () => ({
  payLink: process.env.BHASHSMS_TPL_PAY_LINK || "zinto_order_pay_link",
  tracking: process.env.BHASHSMS_TPL_TRACKING || "zinto_order_tracking",
  riderTask: process.env.BHASHSMS_TPL_RIDER_TASK || "zinto_rider_task",
});

// UNVERIFIED: BhashSMS's request/response format was not available when this
// was written. This follows their legacy (V1) sendmsg script using the
// BHASHSMS_* env vars; confirm with one real send and adjust ONLY this
// function (request shape + failure detection) if it differs.
async function postToBhash({ phone, templateName, params }) {
  const url = `${process.env.BHASHSMS_V1_URL || "https://bhashsms.com/api"}/${
    process.env.BHASHSMS_UTILITY_SCRIPT || "sendmsgutil.php"
  }`;
  const { data } = await axios.get(url, {
    params: {
      user: process.env.BHASHSMS_USER,
      pass: process.env.BHASHSMS_PASS,
      sender: process.env.BHASHSMS_SENDER,
      phone,
      text: templateName,
      priority: "wa",
      stype: "normal",
      Params: params.join(","),
    },
    timeout: parseInt(process.env.BHASHSMS_TIMEOUT_MS || "10000", 10),
  });
  return typeof data === "string" ? data : JSON.stringify(data);
}

// Turns provider text into something an operator can act on.
export function mapWhatsappFailure(raw) {
  const text = String(raw || "");
  if (/not.{0,20}(whatsapp|registered|reachable)|invalid.{0,15}(number|phone|mobile)|opt.?out/i.test(text)) {
    return "This number doesn't seem to be reachable on WhatsApp. Please check it or try another number.";
  }
  if (/template/i.test(text)) return "The WhatsApp template isn't approved or doesn't match. Contact support.";
  if (/auth|credential|password|api.?key|balance|credit/i.test(text)) {
    return "WhatsApp service configuration/credit issue. Contact support.";
  }
  return `WhatsApp message could not be sent${text ? `: ${text.replace(/\s+/g, " ").trim().slice(0, 120)}` : ""}`;
}

/**
 * Never throws: returns { success, error?, mocked? } so callers can surface
 * the message without breaking order/assignment creation.
 */
export async function sendWhatsappTemplate({ phone, template, params }) {
  const to = toIndianNumber(phone);
  if (to.length !== 12) {
    return { success: false, error: "Enter a valid 10-digit mobile number for WhatsApp." };
  }
  const templateName = templates()[template];
  // Commas separate variables in the provider call, so drop them from values.
  const safeParams = params.map((p) => String(p ?? "").replace(/,/g, " "));

  if (useMockOtpEnabled()) {
    console.log(`[bhashWhatsapp] mock ${templateName} -> ${to}: ${safeParams.join(" | ")}`);
    return { success: true, mocked: true };
  }
  for (const key of ["BHASHSMS_USER", "BHASHSMS_PASS", "BHASHSMS_SENDER"]) {
    if (!process.env[key]) return { success: false, error: "WhatsApp service is not configured. Contact support." };
  }

  try {
    const raw = await postToBhash({ phone: to, templateName, params: safeParams });
    if (/error|fail|invalid|reject|not\s/i.test(raw)) return { success: false, error: mapWhatsappFailure(raw) };
    return { success: true };
  } catch (err) {
    return { success: false, error: mapWhatsappFailure(err.response?.data || err.message) };
  }
}

export const sendPayLinkWhatsapp = ({ phone, name, orderId, amount, payLinkUrl }) =>
  sendWhatsappTemplate({ phone, template: "payLink", params: [name || "Customer", orderId, amount ?? "", payLinkUrl] });

export const sendTrackingWhatsapp = ({ phone, name, orderId, trackUrl }) =>
  sendWhatsappTemplate({ phone, template: "tracking", params: [name || "Customer", orderId, trackUrl] });

export const sendRiderTaskWhatsapp = ({ phone, name, taskType, orderId, taskUrl }) =>
  sendWhatsappTemplate({
    phone,
    template: "riderTask",
    params: [name, taskType === "return_pickup" ? "return pickup" : "delivery", orderId, taskUrl],
  });
