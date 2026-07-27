import axiosInstance from "@core/api/axios";
import { getWithDedupe, invalidateCache } from "@core/api/dedupe";

export const customerApi = {
  sendLoginOtp: (data) => axiosInstance.post("/customer/send-login-otp", data),
  sendSignupOtp: (data) =>
    axiosInstance.post("/customer/send-signup-otp", data),
  verifyOtp: (data) => axiosInstance.post("/customer/verify-otp", data),
  getProfile: () => getWithDedupe("/customer/profile", {}, { ttl: 5000 }), // Short cache for profile
  updateProfile: (data) => {
    invalidateCache("/customer/profile");
    return axiosInstance.put("/customer/profile", data);
  },
  getWalletTransactions: (params) =>
    getWithDedupe("/customer/transactions", params),
  getCategories: (params) =>
    getWithDedupe("/categories", params, { ttl: 60 * 1000 }), // 1 min for categories
  getProducts: (params) => getWithDedupe("/products", params),
  getProductById: (id, params) => getWithDedupe(`/products/${id}`, params),

  // Sellers & Location
  getNearbySellers: (params) => getWithDedupe("/seller/nearby", params),
  getSellerPublicProfile: (id) => getWithDedupe(`/seller/public/${id}`),

  // Cart
  getCart: () => getWithDedupe("/cart", {}, { ttl: 2000 }), // Very short cache for cart
  addToCart: (data) => {
    invalidateCache("/cart"); // Invalidate cart cache
    return axiosInstance.post("/cart/add", data);
  },
  updateCartQuantity: (data) => {
    invalidateCache("/cart");
    return axiosInstance.put("/cart/update", data);
  },
  removeFromCart: (productId, variantSku = "") => {
    invalidateCache("/cart");
    const params = {};
    const normalizedVariantSku = String(variantSku || "").trim();
    if (normalizedVariantSku) params.variantSku = normalizedVariantSku;
    return axiosInstance.delete(`/cart/remove/${productId}`, { params });
  },
  clearCart: () => {
    invalidateCache("/cart");
    return axiosInstance.delete("/cart/clear");
  },

  // Wishlist
  getWishlist: (params) => getWithDedupe("/wishlist", params, { ttl: 5000 }),
  addToWishlist: (data) => {
    invalidateCache("/wishlist");
    return axiosInstance.post("/wishlist/add", data);
  },
  toggleWishlist: (data) => {
    invalidateCache("/wishlist");
    return axiosInstance.post("/wishlist/toggle", data);
  },
  removeFromWishlist: (productId) => {
    invalidateCache("/wishlist");
    return axiosInstance.delete(`/wishlist/remove/${productId}`);
  },

  // Favorite sellers / stores
  getFavoriteStores: (params) =>
    getWithDedupe("/favorite-stores", params, { ttl: 5000 }),
  toggleFavoriteStore: (data) => {
    invalidateCache("/favorite-stores");
    invalidateCache("/seller/nearby");
    return axiosInstance.post("/favorite-stores/toggle", data);
  },
  removeFavoriteStore: (storeId) => {
    invalidateCache("/favorite-stores");
    invalidateCache("/seller/nearby");
    return axiosInstance.delete(`/favorite-stores/remove/${storeId}`);
  },

  // Orders
  // Explicit timeout so checkout never waits forever if the server blocks (e.g. Redis/Bull).
  checkoutPreview: (data) =>
    axiosInstance.post("/orders/checkout/preview", data, { timeout: 120000 }),
  createOrder: (data) =>
    axiosInstance.post("/orders", data, { timeout: 120000 }),
  verifyOnlineOrderPayment: (orderId, data) =>
    axiosInstance.post(`/orders/${orderId}/payment/verify-online`, data),
  markOrderDelivered: (orderId, data) =>
    axiosInstance.post(`/orders/${orderId}/delivered`, data || {}),
  markOrderCodCollected: (orderId, data) =>
    axiosInstance.post(`/orders/${orderId}/cod/mark-collected`, data || {}),
  reconcileOrderCod: (orderId, data) =>
    axiosInstance.post(`/orders/${orderId}/cod/reconcile`, data),
  placeOrder: (data) =>
    axiosInstance.post("/orders/place", data, { timeout: 120000 }),
  getMyOrders: () => getWithDedupe("/orders/my-orders"),
  /**
   * Order details must reflect live workflow, but we still dedupe in-flight requests to avoid
   * network spam when multiple effects/events trigger refresh simultaneously.
   * ttl=0 means "no caching" (only in-flight dedupe).
   */
  getOrderDetails: (orderId) =>
    getWithDedupe(
      `/orders/details/${encodeURIComponent(String(orderId ?? "").trim())}`,
      {},
      { ttl: 0 },
    ),
  getDeliverySlots: (params) => getWithDedupe("/orders/scheduling/slots", params, { ttl: 30000 }),
  getDeliveryOptions: (params) => getWithDedupe("/orders/delivery-options", params, { ttl: 15000 }),
  verifyCustomerPickup: (orderId, data) => axiosInstance.post(`/orders/${orderId}/pickup/verify`, data),
  getPickupStatus: (orderId) => axiosInstance.get(`/orders/${orderId}/pickup/status`),
  getActiveCampaigns: (params) => getWithDedupe("/orders/campaigns/active", params),
  getCampaignDetail: (campaignId, params) =>
    getWithDedupe(`/orders/campaigns/${campaignId}`, params),
  rescheduleOrder: (orderId, data) => axiosInstance.put(`/orders/reschedule/${orderId}`, data),
  requestReschedule: (orderId, data) =>
    axiosInstance.post(`/orders/reschedule/${orderId}/request`, data),
  payOrderDifference: (orderId, data) =>
    axiosInstance.post(`/orders/${orderId}/pay-difference`, data),
  reviewReplacementRequest: (orderId, requestId, data) =>
    axiosInstance.put(`/orders/${orderId}/replacements/${requestId}/review`, data),
  getOrderModificationHistory: (orderId) =>
    axiosInstance.get(`/orders/${orderId}/modifications`),
  raiseDispute: (orderId, data) => axiosInstance.post(`/orders/${orderId}/dispute`, data),
  getOrderDispute: (orderId) => axiosInstance.get(`/orders/${orderId}/dispute`),
  getOrderRoute: (orderId, params) =>
    axiosInstance.get(`/orders/workflow/${orderId}/route`, { params }),
  cancelOrder: (orderId, data) => {
    invalidateCache("/orders/my-orders");
    invalidateCache("/orders/details/");
    return axiosInstance.put(`/orders/cancel/${orderId}`, data);
  },
  requestReturn: (orderId, data) =>
    axiosInstance.post(`/orders/${orderId}/returns`, data),
  getReturnDetails: (orderId) =>
    axiosInstance.get(`/orders/${encodeURIComponent(String(orderId ?? "").trim())}/returns`),

  // Payments
  createPaymentOrder: (data) =>
    axiosInstance.post("/payments/create-order", data),
  verifyPaymentStatus: (id) => axiosInstance.get(`/payments/status/${id}`),

  // Support & Reviews
  getProductReviews: (productId) =>
    getWithDedupe(`/reviews/product/${productId}`),
  getStoreReviews: (storeId) => getWithDedupe(`/reviews/store/${storeId}`),
  submitReview: (data) => axiosInstance.post("/reviews/submit", data),
  createTicket: (data) => axiosInstance.post("/tickets/create", data),
  getMyTickets: () => getWithDedupe("/tickets/my-tickets"),
  replyTicket: (ticketId, text, options = {}) => {
    const {
      mediaUrl = "",
      mediaType = "",
      mimeType = "",
    } = options || {};

    return axiosInstance.post(`/tickets/reply/${encodeURIComponent(String(ticketId))}`, {
      text,
      isAdmin: false,
      mediaUrl,
      mediaType,
      mimeType,
    });
  },

  // Experience sections (home / header pages)
  getExperienceSections: (params) => getWithDedupe("/experience", params),

  // Hero config (separate hero banners + categories per page; fallback to home)
  getHeroConfig: (params) =>
    getWithDedupe("/experience/hero", params, { ttl: 60 * 1000 }),

  // Public offers
  getOffers: () => getWithDedupe("/offers"),
  // Offer sections (category → products, banner + side image)
  getOfferSections: (params) => getWithDedupe("/offer-sections", params),

  // Coupons
  validateCoupon: (data) => axiosInstance.post("/coupons/validate", data),
  getActiveCoupons: (params = {}, options = {}) =>
    getWithDedupe("/coupons", { status: "active", ...params }, { ttl: 5000, ...options }),

  // Rewards
  getRewardSummary: () => getWithDedupe("/rewards/customer/summary", {}, { ttl: 5000 }),
  getRewardGrants: (params) => getWithDedupe("/rewards/customer/grants", params),
  getRewardTransactions: (params) => getWithDedupe("/rewards/customer/transactions", params),
  getMyRewardCoupons: () => getWithDedupe("/rewards/customer/coupons"),
  getCouponHistory: (params) => getWithDedupe("/rewards/customer/coupon-history", params),
  getRewardNotifications: (params) => getWithDedupe("/rewards/customer/notifications", params),
  getMyReferrals: (params) => getWithDedupe("/rewards/customer/referrals", params),
  getReferralCode: () => getWithDedupe("/rewards/customer/referral-code"),
  inviteReferral: (data) => axiosInstance.post("/rewards/customer/referrals/invite", data),

  // Maps (server-side geocoding)
  geocodeAddress: (address, params = {}) =>
    axiosInstance.get("/maps/geocode", { params: { address, ...params } }),
  geocodePlaceId: (placeId, params = {}) =>
    axiosInstance.get("/maps/geocode", { params: { placeId, ...params } }),

  // Push (FCM) test
  testPushNotification: () => axiosInstance.post("/push/test"),
  getTestPushNotificationStatus: (orderId) =>
    axiosInstance.get(`/push/test-status/${encodeURIComponent(String(orderId || "").trim())}`),
};
