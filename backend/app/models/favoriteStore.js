import mongoose from "mongoose";

const favoriteStoreSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      unique: true,
    },
    stores: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Store",
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model("FavoriteStore", favoriteStoreSchema);
