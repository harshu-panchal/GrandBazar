import handleResponse from "../utils/helper.js";
import {
  createPaymentOrderForOrderRef,
  verifyPhonePePaymentStatus,
  processPhonePeWebhook,
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
  if (responseStatusText) return `PhonePe gateway error: ${responseStatusText}`;

  const causeCode = String(error?.cause?.code || error?.code || "").trim();
  if (causeCode) return `PhonePe gateway request failed (${causeCode})`;

  return "Unable to initiate payment with PhonePe right now";
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
        redirectUrl: result.redirectUrl,
        merchantOrderId: result.payment.gatewayOrderId,
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

// Route uses optionalVerifyToken (not verifyToken) so an anonymous
// phone-order customer redirected back from PhonePe can still reach this
// handler. For a logged-in customer, req.user is set exactly as before and
// behavior is unchanged. For an anonymous caller, a payLinkToken query
// param (threaded through the redirect URL by createPaymentOrderForOrderRef
// — see resolvePhoneOrderPayLink) stands in for the bearer identity.
export const verifyPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const merchantOrderId = id || req.query.merchantOrderId;

    if (!merchantOrderId) {
        return handleResponse(res, 400, "merchantOrderId is required");
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

    const verification = await verifyPhonePePaymentStatus({
      merchantOrderId,
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

export const handlePhonePeWebhook = async (req, res) => {
  try {
    const authorization = req.headers["x-verify"] || req.headers["authorization"];
    const rawBody = req.body;

    if (!authorization) {
        console.warn("[PhonePeWebhook] Missing verification header");
        return res.status(401).send("Unauthorized");
    }

    const result = await processPhonePeWebhook({
      rawBody,
      authorization,
      correlationId: req.correlationId || null,
    });

    if (result.accepted) {
      return res.status(200).send("OK");
    }
    
    return res.status(400).send("Bad Request");
  } catch (error) {
    console.error("[PhonePeWebhook] Error processing webhook:", error.message);
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
      { redirectUrl: result.redirectUrl },
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getPaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const merchantOrderId = id;
    
        const verification = await verifyPhonePePaymentStatus({
          merchantOrderId,
          userId: req.user?.id,
          correlationId: req.correlationId || null,
        });
    
        return handleResponse(res, 200, "Payment status retrieved", {
          status: verification.status,
          merchantOrderId: verification.payment.gatewayOrderId,
          amount: verification.payment.amount,
          currency: verification.payment.currency,
        });
      } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
      }
};
