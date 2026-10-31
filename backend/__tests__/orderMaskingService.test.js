import { describe, expect, it } from "@jest/globals";
import { maskOrderForViewer, maskOrdersForViewer } from "../app/services/orderMaskingService.js";

const order = {
  orderId: "ORD-HANDOVER-1",
  status: "handed_over_to_logistics",
  pickupProofImages: ["https://res.cloudinary.com/demo/handover.jpg"],
};

describe("product handover proof visibility", () => {
  it("hides the photo from customers while preserving the status", () => {
    const result = maskOrderForViewer(order, { role: "customer", id: "customer1" });
    expect(result.status).toBe("handed_over_to_logistics");
    expect(result.pickupProofImages).toBeUndefined();
  });

  it.each(["seller", "delivery", "admin"])("keeps the photo visible to %s", (role) => {
    const result = maskOrderForViewer(order, { role, id: `${role}1` });
    expect(result.pickupProofImages).toEqual(order.pickupProofImages);
  });

  it("applies the same customer rule to order lists", () => {
    expect(maskOrdersForViewer([order], { role: "user", id: "customer1" })[0].pickupProofImages).toBeUndefined();
  });
});
