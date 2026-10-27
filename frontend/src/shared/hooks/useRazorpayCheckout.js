const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

let loadPromise = null;

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load Razorpay checkout script"));
    };
    document.body.appendChild(script);
  });

  return loadPromise;
}

/**
 * Opens Razorpay's embedded Checkout.js modal. Shared by customer checkout,
 * the phone-order pay-link page, seller subscription payment, delivery-boy
 * COD remittance, and seller COD commission payment — every "collect a
 * payment" surface in the app uses the same order-id/amount/key payload the
 * backend's create-order endpoints already return.
 *
 * @param {object} opts
 * @param {string} opts.razorpayOrderId
 * @param {number} opts.amount - amount in paise
 * @param {string} [opts.currency]
 * @param {string} opts.keyId
 * @param {string} [opts.name] - shown in the modal header
 * @param {string} [opts.description]
 * @param {{name?: string, email?: string, contact?: string}} [opts.prefill]
 * @param {(response: {razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string}) => void} opts.onSuccess
 * @param {(error: { description?: string, reason?: string }) => void} [opts.onFailure]
 * @param {() => void} [opts.onDismiss] - called if the customer closes the modal without paying
 */
export async function openRazorpayCheckout({
  razorpayOrderId,
  amount,
  currency = "INR",
  keyId,
  name = "Zinto",
  description = "",
  prefill = {},
  onSuccess,
  onFailure,
  onDismiss,
}) {
  if (!razorpayOrderId || !keyId) {
    throw new Error("Missing Razorpay order details");
  }

  await loadRazorpayScript();

  const rzp = new window.Razorpay({
    key: keyId,
    order_id: razorpayOrderId,
    amount,
    currency,
    name,
    description,
    prefill,
    theme: { color: "#6d28d9" },
    handler: (response) => {
      onSuccess?.({
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      });
    },
    modal: {
      ondismiss: () => onDismiss?.(),
    },
  });

  rzp.on("payment.failed", (resp) => {
    onFailure?.(resp?.error || { description: "Payment failed" });
  });

  rzp.open();
}
