import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import {
  getOperationsQueue,
  escalateOrder,
  resolveEscalation,
} from "../../services/operationsQueueService.js";

export const getOperationsQueueController = async (req, res) => {
  try {
    const { page, limit } = getPagination(req, { defaultLimit: 25, maxLimit: 100 });
    const data = await getOperationsQueue({ page, limit });
    return handleResponse(res, 200, "Operations queue fetched", data);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const escalateOrderController = async (req, res) => {
  try {
    const { reason } = req.body || {};
    const order = await escalateOrder(req.params.orderId, {
      reason,
      actorId: req.user?.id || req.user?.accountId,
      actorRole: req.user?.role,
    });
    return handleResponse(res, 200, "Order escalated to operations queue", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const resolveEscalationController = async (req, res) => {
  try {
    const { note } = req.body || {};
    const order = await resolveEscalation(req.params.orderId, {
      note,
      actorId: req.user?.id || req.user?.accountId,
    });
    return handleResponse(res, 200, "Escalation resolved", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
