import mongoose from "mongoose";
import { ALL_INVOICE_TYPES } from "../constants/finance.js";

const invoiceLineItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: String,
    quantity: Number,
    unitPrice: Number,
    itemSubtotal: Number,
    gstSlab: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    lineTotal: Number,
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderId: { type: String, required: true },
    type: {
      type: String,
      enum: ALL_INVOICE_TYPES,
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    billedTo: {
      name: String,
      address: String,
      city: String,
      state: String,
      pincode: String,
      gstin: String,
    },
    billedFrom: {
      name: String,
      address: String,
      city: String,
      state: String,
      pincode: String,
      gstin: String,
    },
    lineItems: {
      type: [invoiceLineItemSchema],
      default: [],
    },
    taxJurisdiction: {
      type: String,
      enum: ["intra_state", "inter_state", null],
      default: null,
    },
    subtotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    // Non-tax charges, itemized separately from the product subtotal so the
    // generated PDF can break them out instead of folding them silently
    // into the grand total (see drawTotals in invoiceService.js).
    charges: {
      deliveryFee: { type: Number, default: 0 },
      handlingFee: { type: Number, default: 0 },
      packingFee: { type: Number, default: 0 },
      packagingCharge: { type: Number, default: 0 },
      oddHourSurcharge: { type: Number, default: 0 },
      weatherSurcharge: { type: Number, default: 0 },
      platformSurcharge: { type: Number, default: 0 },
      platformSurchargeReason: { type: String, default: "" },
    },
    grandTotal: { type: Number, default: 0 },
    pdfUrl: { type: String, default: "" },
    pdfPublicId: { type: String, default: "" },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

invoiceSchema.index({ order: 1, type: 1 }, { unique: true });

export default mongoose.model("Invoice", invoiceSchema);
