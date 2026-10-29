export function formatOrderId(orderOrId) {
  const shortOrderId =
    typeof orderOrId === "object" && orderOrId !== null
      ? orderOrId.shortOrderId
      : null;
  const orderId =
    typeof orderOrId === "string"
      ? orderOrId
      : typeof orderOrId === "object" && orderOrId !== null
        ? orderOrId.orderId
        : "";
  const value = String(shortOrderId || orderId || "").trim();

  if (!value) return "";
  return (value.length > 8 ? value.slice(-8) : value).toUpperCase();
}
