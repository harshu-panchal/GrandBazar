import handleResponse from "../utils/helper.js";
import { adminPhoneOrderSchema } from "../validation/financeValidation.js";
import { placePhoneOrderForCustomer } from "../services/phoneOrderService.js";

function validateWithJoi(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    const details = error.details.map((item) => item.message).join("; ");
    const err = new Error(details);
    err.statusCode = 400;
    throw err;
  }
  return value;
}

// Seller/sub-staff "create order on behalf of a customer who called the
// shop directly" flow — same shape as the admin phone-order endpoint, but
// restricted to the acting store's own catalog (see assertItemsBelongToSeller
// in phoneOrderService.js; placeOrderAtomic itself does not enforce this).
export const createPhoneOrderForCustomerBySeller = async (req, res) => {
  try {
    const validated = validateWithJoi(adminPhoneOrderSchema, req.body || {});
    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim() || null;
    // resolveActiveStore/requireApprovedSeller (sellerOrderChain) have
    // already pinned req.user.id to the acting store's _id by this point —
    // same pattern as markOrderPackedBySeller.
    const { id: storeId } = req.user;

    const result = await placePhoneOrderForCustomer({
      customerPhone: validated.customerPhone,
      items: validated.items,
      address: validated.address,
      notifyVia: validated.notifyVia,
      fulfillmentType: validated.fulfillmentType,
      fulfillmentMethod: validated.fulfillmentMethod,
      deliveryDate: validated.deliveryDate,
      windowLabel: validated.windowLabel,
      timeSlot: validated.timeSlot,
      campaignId: validated.campaignId,
      preOrderCampaignId: validated.preOrderCampaignId,
      tipAmount: validated.tipAmount,
      couponId: validated.couponId,
      couponCode: validated.couponCode,
      discountTotal: validated.discountTotal,
      freeDelivery: validated.freeDelivery,
      idempotencyKey,
      restrictToSellerId: storeId,
      placedByActorId: storeId,
      placementActorRole: "seller",
    });

    return handleResponse(
      res,
      result.duplicate ? 200 : 201,
      "Phone order created",
      {
        order: result.order,
        orders: result.orders,
        paymentLinkUrl: result.paymentLinkUrl,
        sentVia: result.sentVia,
      },
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
