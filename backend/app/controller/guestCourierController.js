import handleResponse from "../utils/helper.js";
import {
  getGuestTaskView,
  updateGuestLocation,
  guestArrivedAtStore,
  guestConfirmPickup,
  guestAdvance,
  guestRequestDeliveryOtp,
  guestVerifyDeliveryOtp,
  guestSaveReturnProof,
  guestRequestReturnPickupOtp,
  guestVerifyReturnPickupOtp,
  guestRequestReturnDropOtp,
  guestVerifyReturnDropOtp,
} from "../services/guestCourierWorkflowService.js";
import { initiateGuestCodOnlinePayment, verifyGuestCodOnlinePayment } from "../services/guestCourierFinanceService.js";

const run = (fn, message) => async (req, res) => {
  try {
    const { assignment, order } = req.guestCourier;
    const result = await fn(assignment, order, req.body || {});
    return handleResponse(res, 200, message, result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getGuestTask = run((a, o) => getGuestTaskView(a, o), "Guest delivery task fetched");
export const postGuestLocation = run((a, o, body) => updateGuestLocation(a, o, body), "Location updated");
export const postGuestArrived = run((a, o, body) => guestArrivedAtStore(a, o, body), "Arrival recorded");
export const postGuestPickup = run((a, o, body) => guestConfirmPickup(a, o, body), "Pickup confirmed");
export const postGuestAdvance = run((a, o) => guestAdvance(a, o), "Delivery progress updated");
export const postGuestDeliveryOtpRequest = run((a, o, body) => guestRequestDeliveryOtp(a, o, body), "OTP sent to customer");
export const postGuestDeliveryOtpVerify = run((a, o, body) => guestVerifyDeliveryOtp(a, o, body.code || body.otp), "Delivery completed");
export const postGuestReturnProof = run((a, o, body) => guestSaveReturnProof(a, o, body), "Return proof saved");
export const postGuestReturnPickupOtpRequest = run((a, o) => guestRequestReturnPickupOtp(a, o), "Return pickup OTP sent");
export const postGuestReturnPickupOtpVerify = run((a, o, body) => guestVerifyReturnPickupOtp(a, o, body.code || body.otp), "Return pickup verified");
export const postGuestReturnDropOtpRequest = run((a, o) => guestRequestReturnDropOtp(a, o), "Seller drop-off OTP sent");
export const postGuestReturnDropOtpVerify = run((a, o, body) => guestVerifyReturnDropOtp(a, o, body.code || body.otp), "Return completed");
export const postGuestCodInitiate = run((a, _o, body) => initiateGuestCodOnlinePayment(a, body.amount), "COD remittance initiated");
export const postGuestCodVerify = run((a, _o, body) => verifyGuestCodOnlinePayment(a, body), "COD remittance recorded");
