import mongoose from "mongoose";

const deliveryWindowSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    start: { type: String, required: true, trim: true },
    end: { type: String, required: true, trim: true },
    capacityPerDay: { type: Number, default: 50, min: 1 },
    enabled: { type: Boolean, default: true },
  },
  { _id: true },
);

const preOrderCampaignSchema = new mongoose.Schema(
  {
    campaignId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    /** All stores contributing products (admin multi-store campaigns). */
    sellers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Store",
      },
    ],
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["draft", "active", "sale_started", "completed", "cancelled"],
      default: "draft",
      index: true,
    },
    saleWindow: {
      startAt: { type: Date, required: true },
      endAt: { type: Date, required: true },
    },
    deliveryWindow: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
    },
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        /** Store that owns this product (required for multi-store admin campaigns). */
        seller: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Store",
          default: null,
        },
        allocationCap: { type: Number, required: true, min: 1 },
        allocatedQty: { type: Number, default: 0, min: 0 },
        priceOverride: { type: Number, default: null },
      },
    ],
    rescheduleCutoffDays: { type: Number, default: null, min: 0 },
    deliveryWindows: {
      type: [deliveryWindowSchema],
      default: [],
    },
    timezone: { type: String, default: "Asia/Kolkata" },
    saleStartJobId: { type: String, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      default: null,
    },
    createdByRole: {
      type: String,
      enum: ["seller", "admin"],
      default: "seller",
      index: true,
    },
    createdByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: "" },
  },
  { timestamps: true },
);

preOrderCampaignSchema.index({ seller: 1, status: 1, "saleWindow.startAt": 1 });
preOrderCampaignSchema.index({ sellers: 1, status: 1 });
preOrderCampaignSchema.index({ "products.product": 1, status: 1 });
preOrderCampaignSchema.index({ "products.seller": 1, status: 1 });
preOrderCampaignSchema.index({ createdByRole: 1, status: 1, "saleWindow.startAt": 1 });

export default mongoose.model("PreOrderCampaign", preOrderCampaignSchema);
