import { WORKFLOW_STATUS, workflowFromLegacyStatus } from "../constants/orderWorkflow.js";

const TERMINAL_REASSIGNMENT_STATUSES = new Set([
  WORKFLOW_STATUS.DELIVERED,
  WORKFLOW_STATUS.CANCELLED,
]);

export function workflowStatusForReassignment(order) {
  return order?.workflowStatus
    || workflowFromLegacyStatus(order?.status || order?.orderStatus);
}

export function canReassignOrderBeforeDelivery(order) {
  return !TERMINAL_REASSIGNMENT_STATUSES.has(
    workflowStatusForReassignment(order),
  );
}

