import handleResponse from "../utils/helper.js";
import Store from "../models/store.js";
import {
  resolveDeliveryOptions,
  resolveStoreDeliveryPolicy,
  resolveStoreAvailability,
  loadStoreForDeliveryPolicy,
} from "../services/deliveryOptionResolver.js";
import {
  markOrderReadyForCustomerPickup,
  verifyCustomerPickup,
  getCustomerPickupCredentials,
} from "../services/customerPickupService.js";
import { resolveStoreSchedulingSettings } from "../services/orderSchedulingService.js";
import { DEFAULT_DELIVERY_POLICY, DEFAULT_AVAILABILITY } from "../constants/deliveryPolicy.js";

export const getDeliveryOptionsForStore = async (req, res) => {
  try {
    const { sellerId, lat, lng, fulfillmentType } = req.query;
    if (!sellerId) {
      return handleResponse(res, 400, "sellerId is required");
    }
    const store = await loadStoreForDeliveryPolicy(sellerId);
    if (!store) return handleResponse(res, 404, "Store not found");

    const customerLocation =
      lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;

    const result = await resolveDeliveryOptions({
      store,
      customerLocation,
      fulfillmentType: fulfillmentType || "instant",
    });
    return handleResponse(res, 200, "Delivery options", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getSellerDeliveryPolicy = async (req, res) => {
  try {
    const storeId = req.user?.id || req.params.storeId;
    const store = await Store.findById(storeId).lean();
    if (!store) return handleResponse(res, 404, "Store not found");

    return handleResponse(res, 200, "Delivery policy", {
      deliveryPolicy: resolveStoreDeliveryPolicy(store),
      availability: resolveStoreAvailability(store),
      schedulingSettings: resolveStoreSchedulingSettings(store),
      serviceRadius: store.serviceRadius,
      packagingChargeEnabled: Boolean(store.packagingChargeEnabled),
      packagingCharge: Number(store.packagingCharge || 0),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const updateSellerDeliveryPolicy = async (req, res) => {
  try {
    const storeId = req.user?.id;
    const {
      deliveryPolicy,
      availability,
      schedulingSettings,
      serviceRadius,
      packagingChargeEnabled,
      packagingCharge,
    } = req.body || {};

    const update = {};

    if (deliveryPolicy && typeof deliveryPolicy === "object") {
      const existingStore = await Store.findById(storeId)
        .select("deliveryPolicy sameDayCutoffTime")
        .lean();
      if (!existingStore) {
        return handleResponse(res, 404, "Store not found");
      }

      const adminAllowsPlatform =
        existingStore.deliveryPolicy?.platformLogisticsEnabledByAdmin !== false;

      const nextPolicy = {
        customerPickup: Boolean(deliveryPolicy.customerPickup),
        sellerDelivery: Boolean(deliveryPolicy.sellerDelivery),
        platformLogistics: adminAllowsPlatform
          ? deliveryPolicy.platformLogistics !== false
          : false,
        autoSwitchToPlatform: Boolean(deliveryPolicy.autoSwitchToPlatform),
        platformLogisticsEnabledByAdmin: adminAllowsPlatform,
        sameDayCutoffTime:
          deliveryPolicy.sameDayCutoffTime ||
          existingStore.deliveryPolicy?.sameDayCutoffTime ||
          DEFAULT_DELIVERY_POLICY.sameDayCutoffTime,
      };

      if (
        !nextPolicy.customerPickup &&
        !nextPolicy.sellerDelivery &&
        !nextPolicy.platformLogistics
      ) {
        return handleResponse(
          res,
          400,
          "Enable at least one fulfillment method: Customer Pickup, Seller Self Delivery, or Platform Logistics",
        );
      }

      update.deliveryPolicy = nextPolicy;
      if (!(schedulingSettings && typeof schedulingSettings === "object")) {
        update["schedulingSettings.selfLogistics"] = nextPolicy.sellerDelivery;
      }
    }

    if (availability && typeof availability === "object") {
      update.availability = {
        workingDays: Array.isArray(availability.workingDays)
          ? availability.workingDays
          : DEFAULT_AVAILABILITY.workingDays,
        openTime: availability.openTime || DEFAULT_AVAILABILITY.openTime,
        closeTime: availability.closeTime || DEFAULT_AVAILABILITY.closeTime,
        weeklyOff: Array.isArray(availability.weeklyOff) ? availability.weeklyOff : [],
        holidays: Array.isArray(availability.holidays) ? availability.holidays : [],
        vacation: {
          active: Boolean(availability.vacation?.active),
          startAt: availability.vacation?.startAt || null,
          endAt: availability.vacation?.endAt || null,
          message: availability.vacation?.message || "",
        },
        temporaryClosure: {
          active: Boolean(availability.temporaryClosure?.active),
          reason: availability.temporaryClosure?.reason || "",
          message: availability.temporaryClosure?.message || "",
          restoreAt: availability.temporaryClosure?.restoreAt || null,
          previousPolicy: availability.temporaryClosure?.previousPolicy || null,
        },
      };
    }

    if (schedulingSettings && typeof schedulingSettings === "object") {
      const hasFullSchedulingPayload =
        schedulingSettings.enabled !== undefined ||
        schedulingSettings.maxDaysAhead !== undefined ||
        schedulingSettings.rescheduleCutoffDays !== undefined ||
        Array.isArray(schedulingSettings.deliveryWindows);

      if (hasFullSchedulingPayload) {
        update.schedulingSettings = {
          enabled: Boolean(schedulingSettings.enabled),
          maxDaysAhead: Number(schedulingSettings.maxDaysAhead || 30),
          rescheduleCutoffDays: Number(schedulingSettings.rescheduleCutoffDays ?? 1),
          selfLogistics: Boolean(
            schedulingSettings.selfLogistics ?? deliveryPolicy?.sellerDelivery,
          ),
          deliveryWindows: Array.isArray(schedulingSettings.deliveryWindows)
            ? schedulingSettings.deliveryWindows
            : [],
        };
      } else if (schedulingSettings.selfLogistics !== undefined) {
        update["schedulingSettings.selfLogistics"] = Boolean(
          schedulingSettings.selfLogistics,
        );
      }
    }

    if (serviceRadius !== undefined) {
      update.serviceRadius = Math.max(0.5, Number(serviceRadius) || 5);
    }

    if (packagingChargeEnabled !== undefined) {
      update.packagingChargeEnabled = Boolean(packagingChargeEnabled);
    }
    if (packagingCharge !== undefined) {
      const amount = Math.max(0, Number(packagingCharge) || 0);
      update.packagingCharge = amount;
      if (amount <= 0 && packagingChargeEnabled === undefined) {
        update.packagingChargeEnabled = false;
      }
    }

    const updated = await Store.findByIdAndUpdate(
      storeId,
      { $set: update },
      { new: true },
    ).lean();

    return handleResponse(res, 200, "Delivery policy updated", {
      deliveryPolicy: resolveStoreDeliveryPolicy(updated),
      availability: resolveStoreAvailability(updated),
      schedulingSettings: resolveStoreSchedulingSettings(updated),
      serviceRadius: updated.serviceRadius,
      packagingChargeEnabled: Boolean(updated.packagingChargeEnabled),
      packagingCharge: Number(updated.packagingCharge || 0),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const adminGetStoreDeliveryPolicy = async (req, res) => {
  try {
    const { storeId } = req.params;
    const store = await Store.findById(storeId).lean();
    if (!store) return handleResponse(res, 404, "Store not found");

    return handleResponse(res, 200, "Store delivery policy", {
      deliveryPolicy: resolveStoreDeliveryPolicy(store),
      availability: resolveStoreAvailability(store),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const adminUpdateStoreDeliveryPolicy = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { platformLogisticsEnabledByAdmin, deliveryPolicy, availability } = req.body || {};
    const update = {};

    if (platformLogisticsEnabledByAdmin !== undefined) {
      update["deliveryPolicy.platformLogisticsEnabledByAdmin"] =
        Boolean(platformLogisticsEnabledByAdmin);
    }

    if (deliveryPolicy) {
      Object.entries(deliveryPolicy).forEach(([key, value]) => {
        if (key !== "platformLogisticsEnabledByAdmin") {
          update[`deliveryPolicy.${key}`] = value;
        }
      });
    }

    if (availability) {
      Object.entries(availability).forEach(([key, value]) => {
        update[`availability.${key}`] = value;
      });
    }

    const updated = await Store.findByIdAndUpdate(
      storeId,
      { $set: update },
      { new: true },
    ).lean();
    if (!updated) return handleResponse(res, 404, "Store not found");

    return handleResponse(res, 200, "Store delivery policy updated by admin", {
      deliveryPolicy: resolveStoreDeliveryPolicy(updated),
      availability: resolveStoreAvailability(updated),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const sellerMarkReadyForPickup = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const sellerId = req.user?.id;
    const result = await markOrderReadyForCustomerPickup(sellerId, orderId);
    return handleResponse(res, 200, "Order ready for customer pickup", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const customerVerifyPickup = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { otp, qrToken, orderNumber } = req.body || {};
    const order = await verifyCustomerPickup({
      orderId,
      customerId: req.user?.id,
      otp,
      qrToken,
      orderNumber,
      verifiedBy: "customer",
    });
    return handleResponse(res, 200, "Pickup verified", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const sellerVerifyPickup = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { otp, qrToken, orderNumber } = req.body || {};
    const order = await verifyCustomerPickup({
      orderId,
      customerId: null,
      otp,
      qrToken,
      orderNumber,
      verifiedBy: "seller",
    });
    return handleResponse(res, 200, "Pickup verified", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getPickupStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const status = await getCustomerPickupCredentials(orderId, req.user?.id);
    if (!status) return handleResponse(res, 404, "Pickup order not found");
    return handleResponse(res, 200, "Pickup status", status);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
