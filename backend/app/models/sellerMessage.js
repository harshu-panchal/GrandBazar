import mongoose from "mongoose";

// Standalone admin -> seller message inbox. Deliberately independent of the
// shared push-notification pipeline (notify()/buildNotification, dedupe,
// notification preferences, PushToken/FCM) — that pipeline requires an
// active device token to be of any use, so a seller who's offline never
// sees the message. This model is just a plain persisted record the seller
// app reads directly, so the message is guaranteed visible next time they
// open the app regardless of push delivery.
const sellerMessageSchema = new mongoose.Schema(
    {
        sellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Store",
            required: true,
            index: true,
        },
        fromAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        fromAdminName: {
            type: String,
            trim: true,
            default: "Admin",
        },
        title: {
            type: String,
            trim: true,
            default: "Message from Admin",
        },
        message: {
            type: String,
            required: true,
            trim: true,
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
    { timestamps: true },
);

sellerMessageSchema.index({ sellerId: 1, createdAt: -1 });
sellerMessageSchema.index({ sellerId: 1, isRead: 1 });

export default mongoose.model("SellerMessage", sellerMessageSchema);
