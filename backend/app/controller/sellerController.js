import Seller from "../models/seller.js";
import Transaction from "../models/transaction.js";
import Product from "../models/product.js";
import { handleResponse, calculateDistance } from "../utils/helper.js";
import mongoose from "mongoose";
import { invalidateSellerName } from "../services/entityNameCache.js";

/* ===============================
   GET NEARBY SELLERS
================================ */
export const getNearbySellers = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return handleResponse(res, 400, "Latitude and longitude are required");
    }

    const customerLat = Number(lat);
    const customerLng = Number(lng);

    // Fetch all active/verified sellers
    // We could use $geoNear, but to strictly follow the requirement of individual radii,
    // we'll fetch sellers within a reasonable max distance (e.g. 100km) and then filter.
    const sellers = await Seller.find({
      isActive: true,
      isVerified: true,
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [customerLng, customerLat],
          },
          $maxDistance: 100000, // 100km max search area for performance
        },
      },
    }).lean();

    // Filter based on individual service radius
    const nearbySellers = sellers.filter((seller) => {
      const sellerLng = seller.location.coordinates[0];
      const sellerLat = seller.location.coordinates[1];
      const distance = calculateDistance(
        customerLat,
        customerLng,
        sellerLat,
        sellerLng,
      );

      // Add distance to seller object for frontend
      seller.distance = distance;

      return distance <= (seller.serviceRadius || 5);
    });

    // Populate categories based on active products for each nearby seller
    if (nearbySellers.length > 0) {
      const sellerIds = nearbySellers.map(s => s._id);
      
      const activeProducts = await Product.find({
        sellerId: { $in: sellerIds },
        status: "active",
      })
      .select("sellerId headerId categoryId")
      .populate("headerId", "name")
      .populate("categoryId", "name")
      .lean();

      const sellerCategoryMap = {};
      nearbySellers.forEach(s => {
        sellerCategoryMap[s._id.toString()] = new Set();
        // optionally keep their main category as well
        if (s.category) {
          sellerCategoryMap[s._id.toString()].add(s.category);
        }
      });

      activeProducts.forEach(p => {
        if (p.headerId && p.headerId.name) {
          sellerCategoryMap[p.sellerId.toString()].add(p.headerId.name);
        }
        if (p.categoryId && p.categoryId.name) {
          sellerCategoryMap[p.sellerId.toString()].add(p.categoryId.name);
        }
      });

      nearbySellers.forEach(s => {
        s.productCategories = Array.from(sellerCategoryMap[s._id.toString()]);
      });

      const signatureProducts = await Product.find({
        sellerId: { $in: sellerIds },
        isSignatureProduct: true,
        status: "active",
      }).lean();

      nearbySellers.forEach(s => {
        s.signatureProduct = signatureProducts.find(p => p.sellerId.toString() === s._id.toString()) || null;
      });
    }

    return handleResponse(
      res,
      200,
      "Nearby sellers fetched successfully",
      nearbySellers,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REQUEST WITHDRAWAL (Seller)
================================ */
export const requestWithdrawal = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return handleResponse(res, 400, "Please enter a valid amount");
    }

    // 1. Calculate current available balance
    // Consistent with getSellerEarnings logic in sellerStatsController.js
    const transactions = await Transaction.find({
      user: sellerId,
      userModel: "Seller",
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

    // 2. Create Withdrawal Transaction
    // Withdrawals have negative amounts per the model comment
    const withdrawal = await Transaction.create({
      user: sellerId,
      userModel: "Seller",
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
   GET SELLER PROFILE
================================ */
export const getSellerProfile = async (req, res) => {
  try {
    const seller = await Seller.findById(req.user.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }
    
    const result = seller.toObject ? seller.toObject() : seller;
    
    if (req.user.subSellerId) {
      const subSeller = await Seller.findById(req.user.subSellerId);
      if (subSeller) {
        result.subSeller = subSeller.toObject ? subSeller.toObject() : subSeller;
        result.allowedPermissions = subSeller.allowedPermissions || [];
        result.subRole = subSeller.role;
        result.subName = subSeller.name;
        result.subSellerId = subSeller._id;
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
    const { name, shopName, phone, address, locality, pincode, city, state, lat, lng, radius, banners, storeVideo, description } = req.body;

    // Find seller
    const seller = await Seller.findById(req.user.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    // Update fields if provided
    if (name) seller.name = name;
    if (shopName) seller.shopName = shopName;
    if (phone) seller.phone = phone;
    if (banners !== undefined) seller.banners = banners;
    if (storeVideo !== undefined) seller.storeVideo = storeVideo;
    if (description !== undefined) seller.description = description;
    if (address !== undefined) seller.address = address;
    if (locality !== undefined) seller.locality = locality;
    if (pincode !== undefined) seller.pincode = pincode;
    if (city !== undefined) seller.city = city;
    if (state !== undefined) seller.state = state;

    // Validate and update geo data
    if (lat !== undefined && lng !== undefined) {
      if (lat < -90 || lat > 90)
        return handleResponse(res, 400, "Invalid latitude");
      if (lng < -180 || lng > 180)
        return handleResponse(res, 400, "Invalid longitude");

      seller.location = {
        type: "Point",
        coordinates: [Number(lng), Number(lat)],
      };
    }

    if (radius !== undefined) {
      if (radius < 1 || radius > 100)
        return handleResponse(res, 400, "Radius must be between 1 and 100 km");
      seller.serviceRadius = Number(radius);
    }

    const updatedSeller = await seller.save();

    // Invalidate cached seller name in case shopName changed
    invalidateSellerName(req.user.id).catch((err) => {
      console.warn("[Seller] Name cache invalidation failed:", err.message);
    });

    return handleResponse(
      res,
      200,
      "Profile updated successfully",
      updatedSeller,
    );
  } catch (error) {
    // Handle duplicate phone error
    if (error.code === 11000) {
      return handleResponse(res, 400, "Phone number already in use");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET PUBLIC SELLER PROFILE
================================ */
export const getPublicSellerProfile = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return handleResponse(res, 400, "Invalid seller ID format");
    }

    const seller = await Seller.findById(id)
      .select("name shopName category description banners storeVideo address locality pincode city state location serviceRadius isActive isVerified")
      .lean();

    if (!seller || !seller.isActive || !seller.isVerified) {
      return handleResponse(res, 404, "Seller not found or is currently inactive");
    }

    const signatureProducts = await Product.find({ sellerId: id, isSignatureProduct: true, status: "active" }).lean();
    seller.signatureProducts = signatureProducts || [];

    return handleResponse(
      res,
      200,
      "Seller profile fetched successfully",
      seller,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

