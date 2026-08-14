import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { jest } from "@jest/globals";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import User from "../app/models/customer.js";
import Seller from "../app/models/seller.js";
import Store from "../app/models/store.js";
import Category from "../app/models/category.js";
import Product from "../app/models/product.js";
import Setting from "../app/models/setting.js";
import Order from "../app/models/order.js";
import Wallet from "../app/models/wallet.js";
import Payout from "../app/models/payout.js";
import ExperienceSection from "../app/models/experienceSection.js";
import { resolveCategoryWindowOverrideHours } from "../app/utils/returnWindow.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

process.env.REDIS_DISABLED = process.env.REDIS_DISABLED || "true";

import setupRoutes from "../app/routes/index.js";

jest.setTimeout(60000);

function randomSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

function createToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || "test-secret-key", { expiresIn: "2h" });
}

async function resetCollections() {
  await Promise.all([
    User.deleteMany({}),
    Seller.deleteMany({}),
    Store.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Setting.deleteMany({}),
    Order.deleteMany({}),
    Wallet.deleteMany({}),
    Payout.deleteMany({}),
    ExperienceSection.deleteMany({}),
  ]);
}

describe("Admin Platform & Management Requirements Tests", () => {
  let app;
  let mongoUri;
  let dbName;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
    mongoUri = process.env.MONGO_URI_TEST || process.env.MONGO_URI || "mongodb://localhost:27017/quick-commerce-test";
    dbName = `db_adm_req_${Date.now().toString().slice(-6)}`;
    
    await mongoose.connect(mongoUri, {
      dbName,
      serverSelectionTimeoutMS: 15000,
    });
    
    app = express();
    app.use(express.json());
    setupRoutes(app);
  });

  beforeEach(async () => {
    await resetCollections();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
  });

  // Requirement 1 & 4 & 5: Banners, Categories, Products, Highlights & Ad Placements (Impressions/Clicks)
  it("should create/get/update Experience Sections and track Ad Placements (Super ADs)", async () => {
    const adminToken = createToken({ id: new mongoose.Types.ObjectId().toString(), role: "admin" });
    const suffix = randomSuffix();

    // Create a seller and store first for the ad slot
    const seller = await Seller.create({
      name: "Ad Seller Partner",
      email: `ad_seller_${suffix}@example.com`,
      phone: `86100${suffix.slice(-5)}`,
      password: "Password@123",
      isVerified: true
    });
    const store = await Store.create({
      ownerId: seller._id,
      shopName: "Ad Store",
      category: "Special",
      isVerified: true,
      isActive: true,
      isOpen: true,
      applicationStatus: "approved"
    });

    // Create experience section for home page
    const sectionPayload = {
      displayType: "super_ads",
      title: "Featured Super Ads",
      pageType: "home",
      status: "active",
      config: {
        superAds: {
          items: [
            {
              sellerId: store._id.toString(),
              title: "Amazing Tech Deals",
              imageUrl: `https://cloudinary.com/ad-${suffix}.png`,
              linkType: "store",
              priority: 1,
            }
          ]
        }
      }
    };

    const createRes = await request(app)
      .post("/api/admin/experience")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(sectionPayload);

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    
    const createdSection = createRes.body.result;
    expect(createdSection.title).toBe("Featured Super Ads");
    expect(createdSection.displayType).toBe("super_ads");
    expect(createdSection.config.superAds.items).toHaveLength(1);
    const itemId = createdSection.config.superAds.items[0]._id;

    // Track ad impression
    const trackImpressionRes = await request(app)
      .post(`/api/experience/super-ads/${createdSection._id}/${itemId}/track`)
      .send({ event: "impression" });

    expect(trackImpressionRes.status).toBe(200);

    // Track ad click
    const trackClickRes = await request(app)
      .post(`/api/experience/super-ads/${createdSection._id}/${itemId}/track`)
      .send({ event: "click" });

    expect(trackClickRes.status).toBe(200);

    // Fetch verified/persisted counts
    const updatedSec = await ExperienceSection.findById(createdSection._id);
    expect(updatedSec.config.superAds.items[0].impressions).toBe(1);
    expect(updatedSec.config.superAds.items[0].clicks).toBe(1);

    // Public experience endpoints should return it
    const publicExperienceRes = await request(app)
      .get("/api/experience?pageType=home");
    
    expect(publicExperienceRes.status).toBe(200);
    expect(publicExperienceRes.body.success).toBe(true);
    expect(publicExperienceRes.body.result[0].title).toBe("Featured Super Ads");
  });

  // Requirement 2: Seller recommendations for offline sellers (alternatives)
  it("should return public recommendations/alternatives for closed stores, respecting excludeFromAlternatives flag", async () => {
    const suffix = randomSuffix();
    
    // Store A = Target store (closed)
    const targetStoreOwner = await Seller.create({
      name: "Target Owner", email: `target_${suffix}@example.com`, phone: `88000${suffix.slice(-5)}`, password: "Password@123", isVerified: true
    });
    const targetStore = await Store.create({
      ownerId: targetStoreOwner._id,
      shopName: "Target Closed Store",
      slug: `target-closed-${suffix}`,
      category: "Grocery",
      city: "San Francisco",
      isVerified: true,
      isActive: true,
      isOpen: false,
      applicationStatus: "approved"
    });

    // Store B = Alternative store (open)
    const altStoreOwner = await Seller.create({
      name: "Alt Owner 1", email: `alt1_${suffix}@example.com`, phone: `88100${suffix.slice(-5)}`, password: "Password@123", isVerified: true
    });
    const altStore = await Store.create({
      ownerId: altStoreOwner._id,
      shopName: "Alternative Grocery Open Store",
      slug: `alt-open-${suffix}`,
      category: "Grocery",
      city: "San Francisco",
      isVerified: true,
      isActive: true,
      isOpen: true,
      applicationStatus: "approved",
      excludeFromAlternatives: false
    });

    // Store C = Excluded store (also open, same category, but excludeFromAlternatives: true)
    const exclStoreOwner = await Seller.create({
      name: "Excl Owner", email: `excl_${suffix}@example.com`, phone: `88200${suffix.slice(-5)}`, password: "Password@123", isVerified: true
    });
    await Store.create({
      ownerId: exclStoreOwner._id,
      shopName: "Excluded Store",
      slug: `excl-store-${suffix}`,
      category: "Grocery",
      city: "San Francisco",
      isVerified: true,
      isActive: true,
      isOpen: true,
      applicationStatus: "approved",
      excludeFromAlternatives: true
    });

    // Call public getStoreAlternatives
    const alternativesRes = await request(app)
      .get(`/api/seller/public/${targetStore.slug}/alternatives`);

    expect(alternativesRes.status).toBe(200);
    expect(alternativesRes.body.success).toBe(true);
    
    const alternatives = alternativesRes.body.result;
    // Should include altStore but exclude Store C and targetStore itself
    expect(alternatives).toHaveLength(1);
    expect(alternatives[0].shopName).toBe("Alternative Grocery Open Store");
  });

  // Requirement 3: Category-wise Refund Window Configuration
  it("should resolve category-level refund window config and return eligibility overrides", async () => {
    const suffix = randomSuffix();
    const seller = await Seller.create({
      name: "Seller Test", email: `sell_${suffix}@example.com`, phone: `89000${suffix.slice(-5)}`, password: "Password@123", isVerified: true
    });

    const header = await Category.create({ name: "Header X", slug: `head-${suffix}`, type: "header" });
    
    // Category 1: Refundable with 48 hours window
    const categoryRefundable = await Category.create({
      name: "Refundable Clothes",
      slug: `clothes-${suffix}`,
      type: "category",
      parentId: header._id,
      returnEligible: true,
      refundWindowHours: 48
    });

    // Category 2: Non-refundable
    const categoryNonRefundable = await Category.create({
      name: "Non-Refundable Cosmetics",
      slug: `cosmetics-${suffix}`,
      type: "category",
      parentId: header._id,
      returnEligible: false,
      refundWindowHours: 0
    });

    const productA = await Product.create({
      name: "Nice Jacket", slug: `jacket-${suffix}`, price: 500, stock: 10,
      headerId: header._id, categoryId: categoryRefundable._id, sellerId: seller._id
    });

    const productB = await Product.create({
      name: "Lipstick red", slug: `lipstick-${suffix}`, price: 150, stock: 10,
      headerId: header._id, categoryId: categoryNonRefundable._id, sellerId: seller._id
    });

    // 1. Resolve for productA only
    const resProductA = await resolveCategoryWindowOverrideHours([productA._id]);
    expect(resProductA.overrideHours).toBe(48);
    expect(resProductA.ineligibleProductName).toBeNull();

    // 2. Resolve for productB only (non-refundable category)
    const resProductB = await resolveCategoryWindowOverrideHours([productB._id]);
    expect(resProductB.ineligibleProductName).toBe("Lipstick red");

    // 3. Resolve for both products combined - should flag ineligible product
    const resCombined = await resolveCategoryWindowOverrideHours([productA._id, productB._id]);
    expect(resCombined.ineligibleProductName).toBe("Lipstick red");
  });

  // Requirement 5: Configure Dynamic Section & Platform settings / rules
  it("should fetch and update dynamic platform settings/rules", async () => {
    const adminToken = createToken({ id: new mongoose.Types.ObjectId().toString(), role: "admin" });

    // Seed initial setting
    await Setting.create({
      refundWindowHours: 24,
      alternativesDisplayLimit: 6,
      pricingMode: "distance_based"
    });

    // Update settings via admin
    const updateRes = await request(app)
      .put("/api/admin/settings/platform")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        refundWindowHours: 36,
        alternativesDisplayLimit: 10
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);

    // Retrieve settings
    const getRes = await request(app)
      .get("/api/admin/settings/platform")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(getRes.body.result.refundWindowHours).toBe(36);
    expect(getRes.body.result.alternativesDisplayLimit).toBe(10);
  });

  // Requirement 6: Manage seller shop setup on behalf of seller
  it("should update seller shop setup details on behalf of the seller", async () => {
    const adminToken = createToken({ id: new mongoose.Types.ObjectId().toString(), role: "admin" });
    const suffix = randomSuffix();

    const seller = await Seller.create({
      name: "Original Owner",
      email: `original_${suffix}@example.com`,
      phone: `87000${suffix.slice(-5)}`,
      password: "Password@123",
      isVerified: true
    });

    const store = await Store.create({
      ownerId: seller._id,
      shopName: "Original Shop Name",
      category: "Special",
      isVerified: true,
      isActive: true,
      isOpen: true,
      applicationStatus: "approved"
    });

    // Admin updates store setup
    const updateSetupRes = await request(app)
      .put(`/api/admin/sellers/${store._id}/store-setup`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        shopName: "Updated Shop Name By Admin",
        description: "Admin curated shop settings",
        excludeFromAlternatives: true,
        panNumber: "ABCDE1234F",
        bankName: "State Bank"
      });

    expect(updateSetupRes.status).toBe(200);
    expect(updateSetupRes.body.success).toBe(true);

    const updatedStore = await Store.findById(store._id);
    expect(updatedStore.shopName).toBe("Updated Shop Name By Admin");
    expect(updatedStore.description).toBe("Admin curated shop settings");
    expect(updatedStore.excludeFromAlternatives).toBe(true);
    expect(updatedStore.panNumber).toBe("ABCDE1234F");
    expect(updatedStore.bankName).toBe("State Bank");
  });

  // Requirement 7: Seller Settlement & Bulk Order Settlement Management
  it("should manage payouts, place holds, releases and apply adjustments", async () => {
    const adminToken = createToken({ id: new mongoose.Types.ObjectId().toString(), role: "admin" });
    const suffix = randomSuffix();

    const customer = await User.create({ name: "Test Cust", phone: `99222${suffix.slice(-5)}`, isVerified: true });
    const seller = await Seller.create({
      name: "Payout Seller", email: `payout_${suffix}@example.com`, phone: `80200${suffix.slice(-5)}`, password: "Password@123", isVerified: true
    });
    
    // Seed wallet
    const wallet = await Wallet.create({
      ownerType: "SELLER",
      ownerId: seller._id,
      availableBalance: 500,
      pendingBalance: 200
    });

    // Create mock order
    const order = await Order.create({
      orderId: `ORD-${suffix}`,
      customer: customer._id,
      seller: seller._id,
      items: [],
      status: "delivered",
      paymentMode: "ONLINE",
      paymentStatus: "PAID",
      paymentBreakdown: {
        grandTotal: 1000,
        sellerPayoutTotal: 900,
      },
      settlementStatus: {
        sellerPayout: "PENDING",
      }
    });

    // Create Payout
    const payout = await Payout.create({
      payoutType: "SELLER",
      beneficiaryId: seller._id,
      amount: 900,
      status: "PENDING",
      relatedOrderIds: [order._id],
      isBulkSettlement: false,
      metadata: { orderId: order.orderId }
    });

    // 1. Hold Seller Payout for Order
    const holdRes = await request(app)
      .post(`/api/admin/finance/orders/${order.orderId}/hold`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Dispute about product condition" });

    expect(holdRes.status).toBe(200);
    
    const heldOrder = await Order.findById(order._id);
    expect(heldOrder.settlementStatus.sellerPayout).toBe("HOLD");
    expect(heldOrder.financeFlags.sellerPayoutHeld).toBe(true);

    // 2. Release Seller Payout Hold
    const releaseRes = await request(app)
      .post(`/api/admin/finance/orders/${order.orderId}/release`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(releaseRes.status).toBe(200);

    const releasedOrder = await Order.findById(order._id);
    expect(releasedOrder.settlementStatus.sellerPayout).toBe("PENDING");
    expect(releasedOrder.financeFlags.sellerPayoutHeld).toBe(false);

    // 3. Apply Adjustment (deduction) of ₹50 to payout amount
    const adjustRes = await request(app)
      .post(`/api/admin/finance/payouts/${payout._id}/adjust`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ amount: -50, reason: "Deduction for packing complaint" });

    expect(adjustRes.status).toBe(200);
    expect(adjustRes.body.success).toBe(true);

    const adjustedPayout = await Payout.findById(payout._id);
    expect(adjustedPayout.amount).toBe(850);
    expect(adjustedPayout.metadata.adjustments).toHaveLength(1);
    expect(adjustedPayout.metadata.adjustments[0].amount).toBe(-50);
  });
});
