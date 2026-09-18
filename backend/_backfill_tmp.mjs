import mongoose from "mongoose";
import { enqueueRecalcByCategory } from "./app/queues/pricingQueueProcessors.js";

const uri = process.env.MONGO_URI || "mongodb+srv://zintoindia_db_user:Zinto123@cluster0.rpenpt5.mongodb.net/zinto?retryWrites=true&w=majority";

async function main() {
  await mongoose.connect(uri);
  // "Fresh Fruits" subcategory that both Dragon Fruit and Jackfruit belong to.
  await enqueueRecalcByCategory("699b59a6f77564cd9e5052d9");
  console.log("Recalc done");

  const db = mongoose.connection.db;
  const after = await db.collection("products").find({ name: { $regex: /jackfruit|dragon fruit/i } }).toArray();
  for (const p of after) {
    console.log(JSON.stringify({ name: p.name, _id: p._id, price: p.price, salePrice: p.salePrice, customerPrice: p.customerPrice, customerSalePrice: p.customerSalePrice }));
  }
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
