/**
 * Checks if the current time falls within configured platform operating hours.
 * @param {Object} operatingHours - { enabled: Boolean, startHour: "HH:mm", endHour: "HH:mm" }
 * @param {Date} [now=new Date()] - Date instance to test
 * @returns {{ isAllowed: Boolean, message?: String }}
 */
export function checkOperatingHours(operatingHours, now = new Date()) {
  if (!operatingHours || !operatingHours.enabled) {
    return { isAllowed: true };
  }

  const { startHour = "06:00", endHour = "22:00", cutoffMessage } = operatingHours;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = startHour.split(":").map(Number);
  const startMinutes = (startH || 0) * 60 + (startM || 0);

  const [endH, endM] = endHour.split(":").map(Number);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  let isAllowed = false;
  if (startMinutes <= endMinutes) {
    // Normal range e.g. 06:00 to 22:00
    isAllowed = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight range e.g. 22:00 to 06:00
    isAllowed = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  const defaultMsg = `Orders are currently closed. Platform operating hours are between ${startHour} and ${endHour}.`;
  return {
    isAllowed,
    message: isAllowed ? null : (cutoffMessage || defaultMsg),
  };
}

/**
 * Checks if an order is still eligible for refund/complaint based on delivery timestamp and allowed window.
 * @param {Date|String|Number} deliveredAt - Delivery timestamp
 * @param {Number} [refundWindowHours=24] - Maximum hours allowed after delivery
 * @param {Date} [now=new Date()] - Date instance to test
 * @returns {{ isEligible: Boolean, remainingMs: Number, windowHours: Number }}
 */
export function checkRefundEligibility(deliveredAt, refundWindowHours = 24, now = new Date()) {
  if (!deliveredAt) {
    return { isEligible: false, remainingMs: 0, windowHours: refundWindowHours };
  }

  const deliveryTime = new Date(deliveredAt).getTime();
  const currentTime = now.getTime();
  const windowMs = Number(refundWindowHours || 24) * 60 * 60 * 1000;
  const expiryTime = deliveryTime + windowMs;
  const remainingMs = Math.max(0, expiryTime - currentTime);

  return {
    isEligible: remainingMs > 0,
    remainingMs,
    windowHours: Number(refundWindowHours || 24),
  };
}
