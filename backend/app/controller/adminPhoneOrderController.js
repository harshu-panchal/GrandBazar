import handleResponse from "../utils/helper.js";
import { adminPhoneOrderSchema } from "../validation/financeValidation.js";
import { findCustomerByPhone } from "../services/admin/userAdminService.js";
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

// Used by both the admin and seller "Create Phone Order" screens' customer-
// search step. Deliberately NOT the paginated/client-filtered GET
// /admin/users list — that endpoint can't answer "does this exact phone
// number have an account" authoritatively.
export const lookupCustomerByPhone = async (req, res) => {
  try {
    const phone = String(req.query.phone || "").trim();
    if (!phone) return handleResponse(res, 400, "phone is required");

    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return handleResponse(res, 404, "No account found for this phone number");
    }
    if (customer.isActive === false) {
      return handleResponse(res, 403, "This customer account is inactive");
    }

    return handleResponse(res, 200, "Customer found", {
      customer: {
        id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        addresses: customer.addresses || [],
      },
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const createPhoneOrderForCustomer = async (req, res) => {
  try {
    const validated = validateWithJoi(adminPhoneOrderSchema, req.body || {});
    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim() || null;

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
      // Admin flow: no store restriction — an operator may place an order
      // for any store.
      restrictToSellerId: null,
      placedByActorId: req.user.id,
      placementActorRole: "admin",
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
        notifyErrors: result.notifyErrors,
      },
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
