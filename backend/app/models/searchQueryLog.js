import mongoose from "mongoose";

const searchQueryLogSchema = new mongoose.Schema(
  {
    query: { type: String, required: true, trim: true },
    normalizedQuery: { type: String, required: true, trim: true, lowercase: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    city: { type: String, default: "", trim: true },
    resultCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }, // auto-expire after 30 days
  },
  { timestamps: false },
);

searchQueryLogSchema.index({ normalizedQuery: 1, createdAt: -1 });

export default mongoose.model("SearchQueryLog", searchQueryLogSchema);
