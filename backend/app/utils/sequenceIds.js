import Counter from "../models/counter.js";

// Human-readable, collision-free business IDs for the Complaint + Settlement
// workstream. All backed by the atomic Counter.next(key) so concurrent
// requests never produce duplicates. Pass a mongoose `session` to keep ID
// allocation inside the same transaction as the row that uses it.

/**
 * Complaint ticket number, e.g. "C-1023".
 * Padded to at least 4 digits to match the BRD examples.
 */
export async function nextComplaintId({ session = null } = {}) {
  const seq = await Counter.next("complaint", { session });
  return `C-${String(seq).padStart(4, "0")}`;
}

/**
 * Seller settlement invoice number, e.g. "INV-0007".
 */
export async function nextSettlementInvoiceNo({ session = null } = {}) {
  const seq = await Counter.next("settlementInvoice", { session });
  return `INV-${String(seq).padStart(4, "0")}`;
}

/**
 * Bulk settlement reference number, e.g. "BS-2610-001".
 * Format: BS-<YY><MM>-<NNN>, where NNN resets each calendar month so the
 * running number stays short. Every order, settlement invoice and seller
 * notification in one bulk settlement shares this exact reference (BLK-07).
 */
export async function nextBulkSettlementRef({ now = new Date(), session = null } = {}) {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const period = `${yy}${mm}`;
  const seq = await Counter.next(`bulkSettlement:${period}`, { session });
  return `BS-${period}-${String(seq).padStart(3, "0")}`;
}
