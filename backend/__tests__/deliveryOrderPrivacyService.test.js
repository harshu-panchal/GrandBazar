import {
  redactDeliveredCustomerDetails,
  redactDeliveredCustomerDetailsList,
} from "../app/services/deliveryOrderPrivacyService.js";

describe("deliveryOrderPrivacyService", () => {
  const viewer = { id: "rider-1", role: "delivery" };

  it("removes customer identity and address from delivered orders", () => {
    const result = redactDeliveredCustomerDetails({
      orderId: "ORD-1",
      status: "delivered",
      customer: { _id: "customer-1", name: "Customer Name", phone: "9999999999" },
      address: { name: "Customer Name", phone: "9999999999", address: "Private address" },
      customerName: "Customer Name",
      customerPhone: "9999999999",
      addressSnapshot: { address: "Private address" },
    }, viewer);

    expect(result.customer).toBeUndefined();
    expect(result.address).toBeUndefined();
    expect(result.customerName).toBeUndefined();
    expect(result.customerPhone).toBeUndefined();
    expect(result.addressSnapshot).toBeUndefined();
    expect(result.customerDetailsRemoved).toBe(true);
  });

  it("keeps details for an active order", () => {
    const order = {
      status: "out_for_delivery",
      customer: { name: "Customer Name" },
      address: { address: "Delivery address" },
    };
    expect(redactDeliveredCustomerDetails(order, viewer)).toBe(order);
  });

  it("keeps details when the viewer is assigned to an active return pickup", () => {
    const order = {
      status: "delivered",
      returnStatus: "return_pickup_assigned",
      returnDeliveryBoy: "rider-1",
      customer: { name: "Customer Name" },
      address: { address: "Pickup address" },
    };
    expect(redactDeliveredCustomerDetails(order, viewer)).toBe(order);
  });

  it("redacts delivered entries in history lists only", () => {
    const result = redactDeliveredCustomerDetailsList([
      { status: "delivered", customer: { name: "Hidden" } },
      { status: "cancelled", customer: { name: "Visible" } },
    ], viewer);
    expect(result[0].customer).toBeUndefined();
    expect(result[1].customer.name).toBe("Visible");
  });
});
