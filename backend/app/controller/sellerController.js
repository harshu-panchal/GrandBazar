import Seller from "../models/seller.js";
import Store from "../models/store.js";
import Transaction from "../models/transaction.js";
import Product from "../models/product.js";
import { handleResponse, calculateDistance } from "../utils/helper.js";
import mongoose from "mongoose";
import { invalidateSellerName } from "../services/entityNameCache.js";
import { loadOwnerStores, getStoreCategoryList } from "../services/storeService.js";
import {
  getOwnerAccountApplicationStatus,
  isOwnerAccountApproved,
} from "../services/sellerAccountService.js";

/* ===============================
   GET NEARBY STORES (public)
================================ */
export const getNearbySellers = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return handleResponse(res, 400, "Latitude and longitude are required");
    }

    const customerLat = Number(lat);
    const customerLng = Number(lng);

    const stores = await Store.find({
      isActive: true,
      isVerified: true,
      applicationStatus: "approved",
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [customerLng, customerLat],
          },
          $maxDistance: 100000,
        },
      },
    }).lean();

    const nearbyStores = stores.filter((store) => {
      const storeLng = store.location.coordinates[0];
      const storeLat = store.location.coordinates[1];
      const distance = calculateDistance(
        customerLat,
        customerLng,
        storeLat,
        storeLng,
      );
      store.distance = distance;
      return distance <= (store.serviceRadius || 5);
    });

    if (nearbyStores.length > 0) {
      const storeIds = nearbyStores.map((s) => s._id);

      const activeProducts = await Product.find({
        sellerId: { $in: storeIds },
        status: "active",
      })
        .select("sellerId headerId categoryId")
        .populate("headerId", "name")
        .populate("categoryId", "name")
        .lean();

      const storeCategoryMap = {};
      nearbyStores.forEach((s) => {
        storeCategoryMap[s._id.toString()] = new Set();
        getStoreCategoryList(s).forEach((name) => {
          storeCategoryMap[s._id.toString()].add(name);
        });
      });

      activeProducts.forEach((p) => {
        if (p.headerId && p.headerId.name) {
          storeCategoryMap[p.sellerId.toString()].add(p.headerId.name);
        }
        if (p.categoryId && p.categoryId.name) {
          storeCategoryMap[p.sellerId.toString()].add(p.categoryId.name);
        }
      });

      nearbyStores.forEach((s) => {
        s.productCategories = Array.from(storeCategoryMap[s._id.toString()]);
      });

      const signatureProducts = await Product.find({
        sellerId: { $in: storeIds },
        isSignatureProduct: true,
        status: "active",
      }).lean();

      nearbyStores.forEach((s) => {
        s.signatureProduct = signatureProducts.find(
          (p) => p.sellerId.toString() === s._id.toString(),
        ) || null;
      });
    }

    return handleResponse(
      res,
      200,
      "Nearby stores fetched successfully",
      nearbyStores,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REQUEST WITHDRAWAL (per store)
================================ */
export const requestWithdrawal = async (req, res) => {
  try {
    const storeId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return handleResponse(res, 400, "Please enter a valid amount");
    }

    const transactions = await Transaction.find({
      user: storeId,
      userModel: { $in: ["Seller", "Store"] },
    })
      .select("status amount type")
      .lean();

    const settledBalance = transactions
      .filter((t) => t.status === "Settled")
      .reduce((acc, t) => acc + (t.amount || 0), 0);

    const pendingPayouts = transactions
      .filter(
        (t) =>
          t.type === "Withdrawal" &&
          (t.status === "Pending" || t.status === "Processing"),
      )
      .reduce((acc, t) => acc + Math.abs(t.amount || 0), 0);

    const availableBalance = settledBalance - pendingPayouts;

    if (amount > availableBalance) {
      return handleResponse(
        res,
        400,
        `Insufficient balance. Available: ₹${availableBalance}`,
      );
    }

    const withdrawal = await Transaction.create({
      user: storeId,
      userModel: "Store",
      type: "Withdrawal",
      amount: -Math.abs(amount),
      status: "Pending",
      reference: `WDR-${Date.now()}`,
    });

    return handleResponse(
      res,
      201,
      "Withdrawal request submitted successfully",
      withdrawal,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SELLER PROFILE (account + active store)
================================ */
export const getSellerProfile = async (req, res) => {
  try {
    const storeId = req.user.id;
    let store = await Store.findById(storeId).lean();

    let account = null;
    let stores = [];

    if (req.user.accountId) {
      account = await Seller.findById(req.user.accountId).lean();
      stores = await loadOwnerStores(req.user.accountId);
      if (!store && stores.length > 0) {
        store = stores.find((s) => String(s._id) === String(req.user.activeStoreId))
          || stores[0];
      }
    }

    if (!store && req.user.accountId && account) {
      return handleResponse(res, 200, "Seller profile fetched successfully", {
        ...account,
        account,
        stores,
        activeStoreId: req.user.activeStoreId || null,
        name: account.name,
        email: account.email,
        phone: account.phone,
        isAccountApproved: isOwnerAccountApproved(account),
        accountApplicationStatus: getOwnerAccountApplicationStatus(account),
        applicationStatus: getOwnerAccountApplicationStatus(account),
      });
    }

    if (!store) {
      return handleResponse(res, 404, "Store not found");
    }

    const result = {
      ...store,
      account,
      stores,
      activeStoreId: String(store._id),
      shopName: store.shopName,
      name: account?.name || store.shopName,
      isAccountApproved: isOwnerAccountApproved(account),
      accountApplicationStatus: getOwnerAccountApplicationStatus(account),
    };

    if (req.user.subSellerId) {
      const subSeller = await Seller.findById(req.user.subSellerId);
      if (subSeller) {
        result.subSeller = subSeller.toObject ? subSeller.toObject() : subSeller;
        result.allowedPermissions = subSeller.allowedPermissions || [];
        result.subRole = subSeller.role;
        result.subName = subSeller.name;
        result.subSellerId = subSeller._id;
        result.name = subSeller.name;
      }
    }

    return handleResponse(
      res,
      200,
      "Seller profile fetched successfully",
      result,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE SELLER PROFILE
================================ */
export const updateSellerProfile = async (req, res) => {
  try {
    const storeId = req.user.id;
    const store = await Store.findById(storeId);
    if (!store) {
      return handleResponse(res, 404, "Store not found");
    }

    const {
      name,
      shopName,
      phone,
      address,
      locality,
      pincode,
      city,
      state,
      lat,
      lng,
      radius,
      banners,
      storeVideo,
      description,
      isActive,
    } = req.body;

    if (req.user.accountId && name) {
      await Seller.findByIdAndUpdate(req.user.accountId, { name });
    }

    if (shopName) store.shopName = shopName;
    if (banners !== undefined) store.banners = banners;
    if (storeVideo !== undefined) store.storeVideo = storeVideo;
    if (description !== undefined) store.description = description;
    if (address !== undefined) store.address = address;
    if (locality !== undefined) store.locality = locality;
    if (pincode !== undefined) store.pincode = pincode;
    if (city !== undefined) store.city = city;
    if (state !== undefined) store.state = state;

    if (isActive !== undefined && store.isVerified && store.applicationStatus === "approved") {
      store.isActive = Boolean(isActive);
    }

    if (lat !== undefined && lng !== undefined) {
      if (lat < -90 || lat > 90) return handleResponse(res, 400, "Invalid latitude");
      if (lng < -180 || lng > 180) return handleResponse(res, 400, "Invalid longitude");
      store.location = {
        type: "Point",
        coordinates: [Number(lng), Number(lat)],
      };
    }

    if (radius !== undefined) {
      if (radius < 1 || radius > 100) {
        return handleResponse(res, 400, "Radius must be between 1 and 100 km");
      }
      store.serviceRadius = Number(radius);
    }

    const updatedStore = await store.save();

    invalidateSellerName(storeId).catch((err) => {
      console.warn("[Store] Name cache invalidation failed:", err.message);
    });

    return handleResponse(
      res,
      200,
      "Profile updated successfully",
      updatedStore,
    );
  } catch (error) {
    if (error.code === 11000) {
      return handleResponse(res, 400, "Phone number already in use");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET PUBLIC STORE PROFILE
================================ */
export const getPublicSellerProfile = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return handleResponse(res, 400, "Invalid store ID format");
    }

    const store = await Store.findById(id)
      .select("shopName category description banners storeVideo address locality pincode city state location serviceRadius isActive isVerified applicationStatus")
      .lean();

    if (!store || !store.isActive || !store.isVerified || store.applicationStatus !== "approved") {
      return handleResponse(res, 404, "Store not found or is currently inactive");
    }

    const signatureProducts = await Product.find({
      sellerId: id,
      isSignatureProduct: true,
      status: "active",
    }).lean();
    store.signatureProducts = signatureProducts || [];
    store.name = store.shopName;

    return handleResponse(
      res,
      200,
      "Store profile fetched successfully",
      store,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
