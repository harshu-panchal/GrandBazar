import handleResponse from "../utils/helper.js";
import {
  createPaymentOrderForOrderRef,
  getPaymentRecordStatus,
  verifyRazorpayPaymentStatus,
  processRazorpayWebhook,
  resolvePhoneOrderPayLink,
  verifyPhoneOrderPayLinkToken,
} from "../services/paymentService.js";
import {
  createPaymentOrderSchema,
  verifyPaymentClientSchema,
  validateSchema,
} from "../validation/paymentValidation.js";

function resolvePaymentErrorMessage(error) {
  const directMessage = String(error?.message || "").trim();
  if (directMessage) return directMessage;

  const responseStatusText = String(error?.response?.statusText || "").trim();
  if (responseStatusText) return `Razorpay gateway error: ${responseStatusText}`;

  const causeCode = String(error?.cause?.code || error?.code || "").trim();
  if (causeCode) return `Razorpay gateway request failed (${causeCode})`;

  return "Unable to initiate payment with Razorpay right now";
}

export const createPaymentOrder = async (req, res) => {
  try {
    const payload = validateSchema(createPaymentOrderSchema, req.body || {});
    const result = await createPaymentOrderForOrderRef({
      orderRef: payload.orderRef || payload.orderId,
      userId: req.user?.id,
      idempotencyKey: req.headers["idempotency-key"] || null,
      correlationId: req.correlationId || null,
    });

    return handleResponse(
      res,
      result.duplicate ? 200 : 201,
      result.duplicate ? "Re-using existing payment" : "Payment initiated",
      {
        payment: result.payment,
        razorpayOrderId: result.razorpayOrderId,
        merchantOrderId: result.merchantOrderId,
        amount: result.amount,
        currency: result.currency,
        keyId: result.keyId,
      },
    );
  } catch (error) {
    console.error("[PaymentController] createPaymentOrder failed", {
      message: error?.message,
      statusCode: error?.statusCode || error?.status || 500,
      code: error?.code || error?.cause?.code || null,
      responseStatus: error?.response?.status || null,
      responseStatusText: error?.response?.statusText || null,
      orderRef: req.body?.orderRef || req.body?.orderId || null,
      userId: req.user?.id || null,
      correlationId: req.correlationId || null,
    });
    return handleResponse(
      res,
      error.statusCode || error.status || 500,
      resolvePaymentErrorMessage(error),
    );
  }
};

// Passive DB-read fallback (e.g. the status page polling to see if the
// webhook already resolved a payment). The real confirmation happens via
// verifyPaymentStatus below, called by the Checkout.js success handler.
// Route uses optionalVerifyToken (not verifyToken) so an anonymous
// phone-order customer can still reach this handler — a payLinkToken query
// param (threaded through by resolvePhoneOrderPayLink) stands in for the
// bearer identity.
export const getPaymentStatusById = async (req, res) => {
  try {
    const { id } = req.params;
    const razorpayOrderId = id || req.query.razorpayOrderId;

    if (!razorpayOrderId) {
      return handleResponse(res, 400, "razorpayOrderId is required");
    }

    let effectiveUserId = req.user?.id || null;
    let payLinkOrderRef = null;

    if (!effectiveUserId) {
      const payLinkToken = req.query.payLinkToken;
      if (!payLinkToken) {
        return handleResponse(res, 401, "Unauthorized, token missing");
      }
      const decoded = verifyPhoneOrderPayLinkToken(payLinkToken);
      effectiveUserId = decoded.customerId;
      payLinkOrderRef = decoded.orderRef;
    }

    const result = await getPaymentRecordStatus({ gatewayOrderId: razorpayOrderId, userId: effectiveUserId });

    if (payLinkOrderRef) {
      const paymentOrderRef = result.payment.checkoutGroupId || result.payment.publicOrderId;
      if (String(paymentOrderRef) !== String(payLinkOrderRef)) {
        return handleResponse(res, 403, "This payment link is not valid for this order");
      }
    }

    return handleResponse(res, 200, "Payment status retrieved", {
      status: result.status,
      payment: result.payment,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

// Called by the frontend's Razorpay Checkout.js success handler, right after
// the modal closes, with the razorpay_order_id/payment_id/signature it
// returned. Confirms the payment via HMAC signature and runs the order's
// side effects. See optionalVerifyToken note above — same anonymous
// pay-link support applies here.
export const verifyPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const razorpayOrderId = id || req.body.razorpayOrderId;
    const { razorpayPaymentId, razorpaySignature } = req.body || {};

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return handleResponse(res, 400, "razorpayOrderId, razorpayPaymentId and razorpaySignature are required");
    }

    let effectiveUserId = req.user?.id || null;
    let payLinkOrderRef = null;

    if (!effectiveUserId) {
      const payLinkToken = req.body.payLinkToken || req.query.payLinkToken;
      if (!payLinkToken) {
        return handleResponse(res, 401, "Unauthorized, token missing");
      }
      const decoded = verifyPhoneOrderPayLinkToken(payLinkToken);
      effectiveUserId = decoded.customerId;
      payLinkOrderRef = decoded.orderRef;
    }

    const verification = await verifyRazorpayPaymentStatus({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      userId: effectiveUserId,
      correlationId: req.correlationId || null,
    });

    // A pay-link token is scoped to the order it was issued for — without
    // this check, a customer with two separate phone orders could reuse
    // order A's link token to probe order B's status (both belong to the
    // same customer, so the plain ownership check above wouldn't catch it).
    if (payLinkOrderRef) {
      const paymentOrderRef =
        verification.payment.checkoutGroupId || verification.payment.publicOrderId;
      if (String(paymentOrderRef) !== String(payLinkOrderRef)) {
        return handleResponse(res, 403, "This payment link is not valid for this order");
      }
    }

    return handleResponse(res, 200, "Payment status verified", {
      status: verification.status,
      payment: verification.payment,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const handleRazorpayWebhook = async (req, res) => {
  try {
    const signatureHeader = req.headers["x-razorpay-signature"];
    const rawBody = req.body;

    if (!signatureHeader) {
        console.warn("[RazorpayWebhook] Missing signature header");
        return res.status(401).send("Unauthorized");
    }

    const result = await processRazorpayWebhook({
      rawBody,
      signatureHeader,
      correlationId: req.correlationId || null,
    });

    if (result.accepted) {
      return res.status(200).send("OK");
    }

    return res.status(400).send("Bad Request");
  } catch (error) {
    console.error("[RazorpayWebhook] Error processing webhook:", error.message);
    return res.status(500).send("Internal Server Error");
  }
};

// Public resolver for the admin-phone-order pay link (no verifyToken — the
// customer who receives this via SMS/email has no session on this device).
// The token itself carries and verifies the customer's identity.
export const resolvePhoneOrderPayLinkController = async (req, res) => {
  try {
    const { token } = req.params;
    const result = await resolvePhoneOrderPayLink(token);
    return handleResponse(
      res,
      result.duplicate ? 200 : 201,
      result.duplicate ? "Re-using existing payment" : "Payment initiated",
      {
        razorpayOrderId: result.razorpayOrderId,
        amount: result.amount,
        currency: result.currency,
        keyId: result.keyId,
      },
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getPaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await getPaymentRecordStatus({ gatewayOrderId: id, userId: req.user?.id });

        return handleResponse(res, 200, "Payment status retrieved", {
          status: result.status,
          razorpayOrderId: result.payment.gatewayOrderId,
          amount: result.payment.amount,
          currency: result.payment.currency,
        });
      } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
      }
};
