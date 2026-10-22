import handleResponse from "../utils/helper.js";
import {
  previewBulk,
  payBulk,
  getBulkSettlement,
  listBulkSettlements,
  listSellerUnsettledOrders,
} from "../services/finance/bulkSettlementService.js";

// Admin/Finance HTTP layer for Bulk Settlement (BRD section 6). Gating is in
// the routes; one-seller + ready-only + idempotency are enforced in the service.

const actorOf = (req) => ({ id: req.user?.id, role: req.user?.role });

export const listSellerUnsettledHandler = async (req, res) => {
  try {
    const result = await listSellerUnsettledOrders(req.params.sellerId);
    return handleResponse(res, 200, "Unsettled orders", { items: result });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const bulkPreviewHandler = async (req, res) => {
  try {
    const result = await previewBulk({ sellerId: req.body?.sellerId, orderIds: req.body?.orderIds }, actorOf(req));
    return handleResponse(res, 200, "Bulk preview", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const bulkPayHandler = async (req, res) => {
  try {
    const result = await payBulk(
      {
        sellerId: req.body?.sellerId,
        orderIds: req.body?.orderIds,
        mode: req.body?.mode,
        txnNo: req.body?.txnNo,
        idempotencyKey: req.body?.idempotencyKey,
      },
      actorOf(req),
    );
    return handleResponse(res, 200, "Bulk settlement processed", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getBulkHandler = async (req, res) => {
  try {
    const result = await getBulkSettlement(req.params.refNo);
    return handleResponse(res, 200, "Bulk settlement", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const listBulkHandler = async (req, res) => {
  try {
    const result = await listBulkSettlements(req.query);
    return handleResponse(res, 200, "Bulk settlements", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
