export const FULFILLMENT_METHOD = {
  CUSTOMER_PICKUP: "customer_pickup",
  SELLER_DELIVERY: "seller_delivery",
  PLATFORM_LOGISTICS: "platform_logistics",
};

export const CLOSURE_REASON = {
  VACATION: "vacation",
  FESTIVAL: "festival",
  EMERGENCY: "emergency",
  STAFF_UNAVAILABLE: "staff_unavailable",
  OTHER: "other",
};

export const DEFAULT_DELIVERY_POLICY = {
  customerPickup: false,
  sellerDelivery: false,
  platformLogistics: true,
  autoSwitchToPlatform: false,
  platformLogisticsEnabledByAdmin: true,
  sameDayCutoffTime: "18:00",
};

export const DEFAULT_AVAILABILITY = {
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  openTime: "09:00",
  closeTime: "21:00",
  weeklyOff: [],
  holidays: [],
  vacation: {
    active: false,
    startAt: null,
    endAt: null,
    message: "",
  },
  temporaryClosure: {
    active: false,
    reason: "",
    message: "",
    restoreAt: null,
    previousPolicy: null,
  },
};

export function fulfillmentMethodToLogisticsMode(method) {
  switch (method) {
    case FULFILLMENT_METHOD.CUSTOMER_PICKUP:
      return "pickup";
    case FULFILLMENT_METHOD.SELLER_DELIVERY:
      return "external";
    case FULFILLMENT_METHOD.PLATFORM_LOGISTICS:
    default:
      return "zinto";
  }
}
