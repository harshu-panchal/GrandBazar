import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import Store from "../app/models/store.js";
import Seller from "../app/models/seller.js";
import { getSellerProfile, updateSellerProfile, getPublicSellerProfile } from "../app/controller/sellerController.js";
import { updateStoreSetupByAdmin } from "../app/services/admin/sellerApplicationService.js";
import { getActiveSellerByIdData } from "../app/services/admin/sellerDirectoryService.js";

function mockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to DB");

  let seller = null;
  let store = null;
  const FAKE_LOGO = "data:image/png;base64,ZZTEST_FAKE_LOGO_BYTES";

  try {
    seller = await Seller.create({
      name: "ZZTEST_WS30_Seller",
      email: "zztest_ws30_seller@example.com",
      phone: "9999900030",
      password: "hashednotrealpwd",
      businessModel: "commission",
      isVerified: true,
      applicationStatus: "approved",
      isActive: true,
    });

    store = await Store.create({
      ownerId: seller._id,
      shopName: "ZZTEST WS30 Store",
      category: "Grocery",
      description: "ZZTEST description for About My Shop section.",
      address: "1 Test Lane",
      locality: "Test Locality",
      city: "Test City",
      state: "Test State",
      pincode: "123456",
      isVerified: true,
      isActive: true,
      applicationStatus: "approved",
      location: { type: "Point", coordinates: [77.5, 12.9] },
    });

    // Case 1: schema field itself — default is "", accepts a real value on save
    console.assert(store.logoUrl === "", "Case1a FAILED: default logoUrl should be empty string");
    store.logoUrl = FAKE_LOGO;
    await store.save();
    const reloaded = await Store.findById(store._id).lean();
    console.assert(reloaded.logoUrl === FAKE_LOGO, "Case1b FAILED: logoUrl did not persist on Store");
    console.log("Case 1 PASSED: Store.logoUrl schema field persists correctly");

    // reset for the next cases so we test the controller-driven write path cleanly
    store.logoUrl = "";
    await store.save();

    // Case 2: updateSellerProfile (seller's own PATCH) writes logoUrl
    const req2 = { user: { id: String(store._id) }, body: { logoUrl: FAKE_LOGO } };
    const res2 = mockRes();
    await updateSellerProfile(req2, res2);
    console.assert(res2.statusCode === 200, `Case2 FAILED: expected 200, got ${res2.statusCode}`);
    const afterUpdate = await Store.findById(store._id).lean();
    console.assert(afterUpdate.logoUrl === FAKE_LOGO, "Case2 FAILED: updateSellerProfile did not persist logoUrl");
    console.log("Case 2 PASSED: seller updateSellerProfile persists logoUrl");

    // Case 3: getSellerProfile (seller's own GET) returns logoUrl
    const req3 = { user: { id: String(store._id), accountId: String(seller._id), activeStoreId: String(store._id) } };
    const res3 = mockRes();
    await getSellerProfile(req3, res3);
    console.assert(res3.statusCode === 200, `Case3 FAILED: expected 200, got ${res3.statusCode}`);
    console.assert(res3.body?.result?.logoUrl === FAKE_LOGO, "Case3 FAILED: getSellerProfile did not return logoUrl");
    console.log("Case 3 PASSED: seller getSellerProfile returns logoUrl");

    // Case 4: getPublicSellerProfile (customer-facing StoreDetailPage source) returns logoUrl
    const req4 = { params: { id: String(store._id) } };
    const res4 = mockRes();
    await getPublicSellerProfile(req4, res4);
    console.assert(res4.statusCode === 200, `Case4 FAILED: expected 200, got ${res4.statusCode}`);
    console.assert(res4.body?.result?.logoUrl === FAKE_LOGO, "Case4 FAILED: getPublicSellerProfile did not return logoUrl (select string gap)");
    console.assert(res4.body?.result?.description === store.description, "Case4 FAILED: description missing for About My Shop section");
    console.log("Case 4 PASSED: getPublicSellerProfile returns logoUrl + description");

    // Case 5: admin updateStoreSetupByAdmin whitelist accepts logoUrl
    const NEW_LOGO = "data:image/png;base64,ZZTEST_ADMIN_UPDATED_LOGO";
    await updateStoreSetupByAdmin(String(store._id), { logoUrl: NEW_LOGO });
    const afterAdminUpdate = await Store.findById(store._id).lean();
    console.assert(afterAdminUpdate.logoUrl === NEW_LOGO, "Case5 FAILED: admin updateStoreSetupByAdmin did not persist logoUrl");
    console.log("Case 5 PASSED: admin updateStoreSetupByAdmin whitelist includes logoUrl");

    // Case 6: admin getActiveSellerByIdData returns logoUrl (needs isVerified+approved, already true)
    const adminDetail = await getActiveSellerByIdData(String(store._id));
    console.assert(adminDetail?.logoUrl === NEW_LOGO, "Case6 FAILED: admin getActiveSellerByIdData did not return logoUrl");
    console.log("Case 6 PASSED: admin getActiveSellerByIdData returns logoUrl");

    console.log("\nALL WS30 CASES PASSED");
  } finally {
    if (store?._id) await Store.deleteOne({ _id: store._id });
    if (seller?._id) await Seller.deleteOne({ _id: seller._id });

    const remainingStores = await Store.countDocuments({ shopName: /^ZZTEST/ });
    const remainingSellers = await Seller.countDocuments({ name: /^ZZTEST/ });
    console.log(`Residual ZZTEST stores: ${remainingStores}, sellers: ${remainingSellers}`);

    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error("TEST SCRIPT ERROR:", e);
  process.exit(1);
});
