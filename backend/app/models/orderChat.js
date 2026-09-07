import mongoose from "mongoose";

const orderChatSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    orderMongoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    senderRole: {
      type: String,
      enum: ["customer", "delivery", "admin"],
      required: true,
    },
    senderName: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    quickReplyType: {
      type: String,
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

orderChatSchema.index({ orderId: 1, createdAt: 1 });

export default mongoose.model("OrderChat", orderChatSchema);
