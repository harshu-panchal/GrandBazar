import handleResponse from "../utils/helper.js";
import { authenticateGuestToken } from "../services/guestCourierAssignmentService.js";

export async function verifyGuestCourier(req, res, next) {
  try {
    const token = String(req.headers["x-guest-token"] || "").trim();
    const context = await authenticateGuestToken(token);
    req.guestCourier = context;
    next();
  } catch (error) {
    return handleResponse(res, error.statusCode || 401, error.message);
  }
}
