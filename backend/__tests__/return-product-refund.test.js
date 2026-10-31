import { calculateReturnedProductAmount } from "../app/utils/returnRefund.js";

describe("return product-only refund", () => {
  it("refunds the product value and excludes all order-level charges", () => {
    const returnItems = [{ price: 150, quantity: 1 }];
    const paymentBreakdown = {
      productSubtotal: 150,
      deliveryFeeCharged: 20,
      handlingFeeCharged: 10,
      packingFeeCharged: 10,
      taxTotal: 10,
      grandTotal: 200,
    };

    expect(paymentBreakdown.grandTotal).toBe(200);
    expect(calculateReturnedProductAmount(returnItems)).toBe(150);
  });

  it("calculates partial and multi-item returns", () => {
    expect(calculateReturnedProductAmount([
      { price: 50, quantity: 2 },
      { price: 25, quantity: 1 },
    ])).toBe(125);
  });
});
