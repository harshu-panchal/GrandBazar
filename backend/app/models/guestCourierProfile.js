import mongoose from "mongoose";

const guestCourierProfileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, unique: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["active", "blocked"],
      default: "active",
      index: true,
    },
    assignmentCount: { type: Number, default: 0, min: 0 },
    lastAssignedAt: { type: Date, default: null, index: true },
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    updatedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true },
);

guestCourierProfileSchema.index({ status: 1, lastAssignedAt: -1 });

export default mongoose.model("GuestCourierProfile", guestCourierProfileSchema);
