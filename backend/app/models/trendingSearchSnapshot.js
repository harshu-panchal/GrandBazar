import mongoose from "mongoose";

const trendingSearchSnapshotSchema = new mongoose.Schema({
  _id: { type: String, default: "latest" },
  items: {
    type: [
      {
        _id: false,
        query: { type: String, required: true },
        count: { type: Number, required: true },
      },
    ],
    default: [],
  },
  computedAt: { type: Date, default: Date.now },
});

export default mongoose.model("TrendingSearchSnapshot", trendingSearchSnapshotSchema);
