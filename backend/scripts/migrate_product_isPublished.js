import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../app/models/product.js";

dotenv.config();

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const result = await Product.updateMany(
    {
      $or: [
        { isPublished: { $exists: false } },
        { importSource: { $exists: false } },
      ],
    },
    {
      $set: {
        isPublished: true,
        importSource: "manual",
      },
    },
  );

  console.log(`Updated ${result.modifiedCount} product(s)`);
  await mongoose.disconnect();
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
