import mongoose from "mongoose";

// Single-document snapshot (same pattern as trendingSearchSnapshot.js) —
// recomputed periodically by trendingProductsAggregationJob.js rather than
// queried live, since the underlying order aggregation is too expensive to
// run on every Home page load.
const trendingProductSnapshotSchema = new mongoose.Schema({
  _id: { type: String, default: "latest" },
  items: {
    type: [
      {
        _id: false,
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        unitsSold: { type: Number, required: true },
      },
    ],
    default: [],
  },
  computedAt: { type: Date, default: Date.now },
});

export default mongoose.model("TrendingProductSnapshot", trendingProductSnapshotSchema);
