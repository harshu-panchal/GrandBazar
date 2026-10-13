export const handleResponse = (res, statusCode, message, data = {}) => {
  const success = statusCode >= 200 && statusCode < 300;

  const sanitize = (item) => {
    if (!item) return item;

    // Handle Mongoose documents
    let obj = item;
    if (typeof item.toObject === 'function') {
      obj = item.toObject();
    } else if (typeof item === 'object') {
      // Recursively sanitize if it's a plain object that might contain Mongoose docs
      obj = { ...item };
      for (const key in obj) {
        if (obj[key] && typeof obj[key].toObject === 'function') {
          obj[key] = obj[key].toObject();
          // Clean the nested object too
          const { updatedAt, __v, password, ...rest } = obj[key];
          obj[key] = rest;
        }
      }
    }

    const { updatedAt, __v, password, ...cleaned } = obj;
    return cleaned;
  };

  const sanitizedData = Array.isArray(data)
    ? data.map(sanitize)
    : sanitize(data);

  const responsePayload = {
    success,
    error: !success,
    message,
  };

  if (Array.isArray(sanitizedData)) {
    responsePayload.results = sanitizedData;
    responsePayload.result = sanitizedData;
  } else {
    responsePayload.result = sanitizedData;
  }

  return res.status(statusCode).json(responsePayload);
};

export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
            Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance; // Distance in km
};

// True for root admin/superadmin AND any custom-role staff member (scope
// "admin" on the JWT — minted for every AdminRole-based account, e.g.
// Accountant, Assistant, Operator L1-L4). Several order-access checks in
// orderController.js/orderQueryService.js used to test `role === "admin"`
// literally, which is only ever true for the root role — every custom
// admin role failed those checks (403 on order details, an empty order
// list on /orders/seller-orders). Use this wherever "is this an
// admin-scoped caller" is the actual intent.
export const isAdminScopedUser = (user) =>
    user?.role === "admin" || user?.role === "superadmin" || user?.scope === "admin";

export default handleResponse;