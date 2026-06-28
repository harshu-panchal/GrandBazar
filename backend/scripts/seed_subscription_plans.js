/**
 * Seed default subscription plans.
 * Usage: node backend/scripts/seed_subscription_plans.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

import SubscriptionPlan from "../app/models/subscriptionPlan.js";

const DEFAULT_PLANS = [
  {
    name: "Starter",
    description: "1 shop, 50 products, monthly",
    shopCount: 1,
    productCountPerShop: 50,
    durationDays: 30,
    price: 999,
    sortOrder: 1,
    billingCycle: "monthly",
  },
  {
    name: "Growth",
    description: "3 shops, 100 products each, monthly",
    shopCount: 3,
    productCountPerShop: 100,
    durationDays: 30,
    price: 2499,
    sortOrder: 2,
    billingCycle: "monthly",
  },
  {
    name: "Pro",
    description: "5 shops, 200 products each, monthly",
    shopCount: 5,
    productCountPerShop: 200,
    durationDays: 30,
    price: 4999,
    sortOrder: 3,
    billingCycle: "monthly",
  },
];

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);

  for (const plan of DEFAULT_PLANS) {
    const exists = await SubscriptionPlan.findOne({ name: plan.name }).lean();
    if (!exists) {
      await SubscriptionPlan.create(plan);
      console.log(`Created plan: ${plan.name}`);
    } else {
      console.log(`Skipped existing plan: ${plan.name}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
