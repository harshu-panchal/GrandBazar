import handleResponse from "../utils/helper.js";
import {
  raiseComplaintOrFeedback,
  acknowledgeFeedback,
  logCall,
  assignCulprit,
  sellerDecision,
  refundCustomer,
  closeComplaint,
  getComplaintById,
  getComplaintByOrder,
  listComplaints,
} from "../services/complaintService.js";

// HTTP layer for the Complaint Window. Role gating is enforced in the routes
// (verifyToken + allowRoles + checkAdminPermission); handlers only translate
// request/response and never trust the browser for authorization.

function ctxOf(req) {
  return { device: req.headers?.["user-agent"] || "", ip: req.ip || req.headers?.["x-forwarded-for"] || "" };
}

// Customer: raise feedback or a complaint on a delivered order (within 24h).
export const raiseComplaintHandler = async (req, res) => {
  try {
    const result = await raiseComplaintOrFeedback({
      orderId: req.params.orderId,
      customerId: req.user.id,
      submitType: req.body?.submitType,
      items: req.body?.items,
      ctx: ctxOf(req),
    });
    return handleResponse(res, 201, "Submitted", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

// Strip the internal back-and-forth for the customer (BRD CMP-18): they see a
// simple status + their own items, never the call logs / admin↔seller events.
function customerView(result) {
  if (!result) return result;
  const c = result.complaint || {};
  return {
    complaint: {
      complaintId: c.complaintId,
      orderPublicId: c.orderPublicId,
      submitType: c.submitType,
      status: c.status,
      amount: c.amount,
      refundTxnNo: c.refundTxnNo,
      summary: c.status === "CLOSED" ? c.summary : "",
      openedAt: c.openedAt,
      dueAt: c.dueAt,
    },
    items: result.items,
  };
}

export const getOrderComplaintHandler = async (req, res) => {
  try {
    const result = await getComplaintByOrder(req.params.orderId);
    if (!result) return handleResponse(res, 200, "Complaint", null);

    const role = req.user?.role;
    const c = result.complaint;
    // Ownership: customers only their own; sellers only their store; admin all.
    if (role === "customer" || role === "user") {
      if (String(c.customer) !== String(req.user.id)) {
        return handleResponse(res, 403, "Not your order");
      }
      return handleResponse(res, 200, "Complaint", customerView(result));
    }
    if (role === "seller") {
      if (String(c.seller) !== String(req.user.activeStoreId || req.user.id)) {
        return handleResponse(res, 403, "Not against your store");
      }
    }
    return handleResponse(res, 200, "Complaint", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

// Admin-only full ticket (sellers use /complaints/seller/:id, customers use
// /complaints/order/:orderId). Route also gates to admin.
export const getComplaintHandler = async (req, res) => {
  try {
    const result = await getComplaintById(req.params.complaintId);
    return handleResponse(res, 200, "Complaint", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const listComplaintsHandler = async (req, res) => {
  try {
    const result = await listComplaints(req.query);
    return handleResponse(res, 200, "Complaints", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

// Seller: only ever sees complaints against their own store (forced server-side
// — never trust a sellerId from the query).
export const listSellerComplaintsHandler = async (req, res) => {
  try {
    const sellerId = req.user.activeStoreId || req.user.id;
    const result = await listComplaints({ ...req.query, sellerId });
    return handleResponse(res, 200, "Complaints", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getSellerComplaintHandler = async (req, res) => {
  try {
    const sellerId = String(req.user.activeStoreId || req.user.id);
    const result = await getComplaintById(req.params.complaintId);
    if (String(result?.complaint?.seller) !== sellerId) {
      return handleResponse(res, 403, "This complaint is not against your store");
    }
    return handleResponse(res, 200, "Complaint", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const acknowledgeFeedbackHandler = async (req, res) => {
  try {
    const result = await acknowledgeFeedback({
      complaintId: req.params.complaintId,
      adminId: req.user.id,
      ctx: ctxOf(req),
    });
    return handleResponse(res, 200, "Feedback acknowledged", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const logCallHandler = async (req, res) => {
  try {
    const result = await logCall({
      complaintId: req.params.complaintId,
      adminId: req.user.id,
      adminName: req.user.name || "",
      outcome: req.body?.outcome,
      facts: req.body?.facts,
      photosChecked: req.body?.photosChecked,
      nextStep: req.body?.nextStep,
      durationSeconds: req.body?.durationSeconds,
      ctx: ctxOf(req),
    });
    return handleResponse(res, 201, "Call logged", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const assignCulpritHandler = async (req, res) => {
  try {
    const result = await assignCulprit({
      complaintId: req.params.complaintId,
      adminId: req.user.id,
      culprit: req.body?.culprit,
      amount: req.body?.amount,
      recoveryTicketRef: req.body?.recoveryTicketRef,
      note: req.body?.note,
      ctx: ctxOf(req),
    });
    return handleResponse(res, 200, "Assigned", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const sellerDecisionHandler = async (req, res) => {
  try {
    const result = await sellerDecision({
      complaintId: req.params.complaintId,
      sellerStoreId: req.user.activeStoreId || req.user.id,
      decision: req.body?.decision,
      amount: req.body?.amount,
      reason: req.body?.reason,
      ctx: ctxOf(req),
    });
    return handleResponse(res, 200, "Decision recorded", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const refundCustomerHandler = async (req, res) => {
  try {
    const result = await refundCustomer({
      complaintId: req.params.complaintId,
      adminId: req.user.id,
      ctx: ctxOf(req),
    });
    return handleResponse(res, 200, "Refund sent", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const closeComplaintHandler = async (req, res) => {
  try {
    const result = await closeComplaint({
      complaintId: req.params.complaintId,
      adminId: req.user.id,
      summary: req.body?.summary,
      ctx: ctxOf(req),
    });
    return handleResponse(res, 200, "Complaint closed", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
