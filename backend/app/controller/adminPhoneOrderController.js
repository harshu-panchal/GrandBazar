import handleResponse from "../utils/helper.js";
import Order from "../models/order.js";
import { adminPhoneOrderSchema } from "../validation/financeValidation.js";
import { placeOrderAtomic } from "../services/orderPlacementService.js";
import { findCustomerByPhone } from "../services/admin/userAdminService.js";
import { signPhoneOrderPayLinkToken } from "../services/paymentService.js";
import { sendPhoneOrderPayLinkSms } from "../services/smsIndiaHubService.js";
import { sendOrderPaymentLinkEmail } from "../services/emailService.js";

const PAY_LINK_EXPIRY_MS = 30 * 60 * 1000;

// Customer.addresses stores label as lowercase ("home"/"work"/"other" —
// see models/customer.js addressSchema), but Order.address.type is an enum
// of ["Home", "Work", "Other"] (models/order.js). The admin UI passes the
// customer's saved address straight through, so it must be re-cased here
// or Mongoose rejects the order with an enum validation error.
const ADDRESS_TYPE_ENUM = ["Home", "Work", "Other"];
function normalizeAddressType(type) {
  const match = ADDRESS_TYPE_ENUM.find(
    (candidate) => candidate.toLowerCase() === String(type || "").toLowerCase(),
  );
  return match || "Other";
}

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

// Used by the admin "Create Phone Order" screen's customer-search step, and
// reused inline by createPhoneOrderForCustomer below. Deliberately NOT the
// paginated/client-filtered GET /admin/users list — that endpoint can't
// answer "does this exact phone number have an account" authoritatively.
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

    const customer = await findCustomerByPhone(validated.customerPhone);
    if (!customer) {
      return handleResponse(
        res,
        404,
        "No account found for this phone number. Ask the customer to sign up first.",
      );
    }
    if (customer.isActive === false) {
      return handleResponse(res, 403, "This customer account is inactive");
    }

    const payload = {
      items: validated.items,
      address: {
        ...validated.address,
        type: normalizeAddressType(validated.address?.type),
      },
      // Forced, never taken from the client — the whole point of this flow
      // is confirm-after-payment, so COD phone orders are out of scope.
      paymentMode: "ONLINE",
      timeSlot: validated.timeSlot || "now",
      fulfillmentType: validated.fulfillmentType,
      fulfillmentMethod: validated.fulfillmentMethod,
      deliveryDate: validated.deliveryDate,
      windowLabel: validated.windowLabel,
      campaignId: validated.campaignId,
      preOrderCampaignId: validated.preOrderCampaignId,
      tipAmount: validated.tipAmount || 0,
      couponId: validated.couponId || null,
      couponCode: validated.couponCode || null,
      discountTotal: validated.discountTotal || 0,
      freeDelivery: Boolean(validated.freeDelivery),
    };
    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim() || null;

    // Supplying items directly (rather than via the customer's own cart)
    // takes placeOrderAtomic's DIRECT_ITEMS branch, so the target
    // customer's real Cart document is never touched by the operator's
    // picks. Seller/store is derived from the items automatically, and
    // placeOrderAtomic already rejects a cart spanning more than one store.
    const placement = await placeOrderAtomic({
      customerId: customer._id,
      payload,
      idempotencyKey,
    });

    const orders = placement.orders || [];
    const primaryOrder = placement.order;
    const orderRef = placement.checkoutGroup?.checkoutGroupId || primaryOrder?.orderId;
    const amount =
      primaryOrder?.paymentBreakdown?.grandTotal ??
      primaryOrder?.pricing?.total ??
      null;

    const token = signPhoneOrderPayLinkToken({ orderRef, customerId: customer._id });
    const expiresAt = new Date(Date.now() + PAY_LINK_EXPIRY_MS);
    const payLinkUrl = `${process.env.FRONTEND_URL}/pay/${token}`;

    const notifyVia = validated.notifyVia || [];
    const sentVia = [];
    if (notifyVia.includes("sms") && customer.phone) {
      try {
        await sendPhoneOrderPayLinkSms({ phone: customer.phone, payLinkUrl, amount });
        sentVia.push("sms");
      } catch (err) {
        console.warn("[adminPhoneOrderController] SMS send failed:", err.message);
      }
    }
    if (notifyVia.includes("email") && customer.email) {
      try {
        await sendOrderPaymentLinkEmail({
          email: customer.email,
          name: customer.name,
          orderId: primaryOrder?.orderId,
          amount,
          payLinkUrl,
          expiresAt,
        });
        sentVia.push("email");
      } catch (err) {
        console.warn("[adminPhoneOrderController] Email send failed:", err.message);
      }
    }

    const orderIds = orders.map((order) => order._id);
    if (orderIds.length) {
      await Order.updateMany(
        { _id: { $in: orderIds } },
        {
          $set: {
            placedByAdmin: req.user.id,
            placementChannel: "ADMIN_PHONE_ORDER",
            paymentLink: {
              token,
              url: payLinkUrl,
              sentVia,
              sentAt: new Date(),
              expiresAt,
              createdByAdmin: req.user.id,
            },
          },
        },
      );
    }

    return handleResponse(
      res,
      placement.duplicate ? 200 : 201,
      "Phone order created",
      {
        order: primaryOrder,
        orders,
        paymentLinkUrl: payLinkUrl,
        sentVia,
      },
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
