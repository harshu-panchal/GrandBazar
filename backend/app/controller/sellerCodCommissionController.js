import { handleResponse } from "../utils/helper.js";
import {
  getSellerCodCommissionSummary,
  createSellerCodCommissionCheckout,
  verifySellerCodCommissionPayment,
  adminReconcileSellerCommission,
} from "../services/sellerCodCommissionService.js";

export const getSellerCodCommissionSummaryController = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?._id;
    if (!sellerId) return handleResponse(res, 401, "Unauthorized");

    const summary = await getSellerCodCommissionSummary(sellerId);
    return handleResponse(res, 200, "COD commission summary fetched successfully", summary);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const initiateSellerCodCommissionCheckoutController = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?._id;
    if (!sellerId) return handleResponse(res, 401, "Unauthorized");

    const requestedAmount = req.body?.amount ? Number(req.body.amount) : null;
    const result = await createSellerCodCommissionCheckout({
      sellerId,
      amount: requestedAmount,
    });

    return handleResponse(res, 200, "Payment checkout initiated successfully", {
      redirectUrl: result.redirectUrl,
      paymentId: result.payment._id,
      duplicate: result.duplicate,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const verifySellerCodCommissionPaymentController = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?._id;
    const merchantOrderId = req.params.merchantOrderId;
    if (!merchantOrderId) return handleResponse(res, 400, "Missing merchantOrderId parameter");

    const result = await verifySellerCodCommissionPayment({
      merchantOrderId,
      sellerId,
    });

    return handleResponse(res, 200, "Payment verified", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const adminReconcileSellerCommissionController = async (req, res) => {
  try {
    const actorId = req.user?.id || req.user?._id;
    const { sellerId, amount, notes } = req.body;

    if (!sellerId || !amount) {
      return handleResponse(res, 400, "sellerId and amount are required");
    }

    const result = await adminReconcileSellerCommission({
      sellerId,
      amount,
      notes,
      actorId,
    });

    return handleResponse(res, 200, "Seller COD commission reconciled successfully", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
