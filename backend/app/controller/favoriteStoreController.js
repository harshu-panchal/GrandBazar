import FavoriteStore from "../models/favoriteStore.js";
import Store from "../models/store.js";
import handleResponse from "../utils/helper.js";

const CUSTOMER_VISIBLE_STORE_MATCH = {
  isActive: true,
  isVerified: true,
  applicationStatus: "approved",
};

function sanitizeFavorites(doc) {
  if (!doc || !Array.isArray(doc.stores)) return doc;
  doc.stores = doc.stores.filter(Boolean);
  return doc;
}

async function findVisibleStoreById(storeId) {
  if (!storeId) return null;
  return Store.findOne({
    _id: storeId,
    ...CUSTOMER_VISIBLE_STORE_MATCH,
  })
    .select("_id favoriteCount")
    .lean();
}

async function adjustFavoriteCount(storeId, delta) {
  if (!storeId || !delta) return;
  await Store.findByIdAndUpdate(storeId, {
    $inc: { favoriteCount: delta },
  });
  // Keep count from going negative
  await Store.updateOne(
    { _id: storeId, favoriteCount: { $lt: 0 } },
    { $set: { favoriteCount: 0 } },
  );
}

async function fetchPopulatedFavorites(favoriteId) {
  const favorites = await FavoriteStore.findById(favoriteId)
    .populate({
      path: "stores",
      select:
        "shopName category description banners locality city address isOpen favoriteCount avgRating reviewCount isActive isVerified applicationStatus",
      match: CUSTOMER_VISIBLE_STORE_MATCH,
    })
    .lean();

  return sanitizeFavorites(favorites);
}

export const getFavoriteStores = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { idsOnly } = req.query;

    const query = FavoriteStore.findOne({ customerId });

    if (idsOnly === "true") {
      const favorites = await query.select("stores").lean();
      const rawIds = Array.isArray(favorites?.stores) ? favorites.stores : [];
      const visibleStores = await Store.find({
        _id: { $in: rawIds },
        ...CUSTOMER_VISIBLE_STORE_MATCH,
      })
        .select("_id")
        .lean();
      return handleResponse(res, 200, "Favorite store IDs fetched", {
        stores: visibleStores.map((store) => String(store._id)),
      });
    }

    const favoriteDoc = await query.select("_id").lean();
    if (!favoriteDoc?._id) {
      const created = await FavoriteStore.create({ customerId, stores: [] });
      return handleResponse(res, 200, "Favorite stores fetched", created);
    }

    const favorites = await fetchPopulatedFavorites(favoriteDoc._id);
    return handleResponse(res, 200, "Favorite stores fetched", favorites);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const toggleFavoriteStore = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { storeId } = req.body;

    if (!storeId) {
      return handleResponse(res, 400, "storeId is required");
    }

    const store = await findVisibleStoreById(storeId);
    let favorites = await FavoriteStore.findOne({ customerId });
    if (!favorites) {
      favorites = new FavoriteStore({ customerId, stores: [] });
    }

    const index = favorites.stores.findIndex(
      (id) => String(id) === String(storeId),
    );
    let isFavorite = false;
    let message = "";

    if (index > -1) {
      // Unlike
      favorites.stores = favorites.stores.filter(
        (id) => String(id) !== String(storeId),
      );
      await favorites.save();
      await adjustFavoriteCount(storeId, -1);
      isFavorite = false;
      message = "Store removed from favorites";
    } else {
      // Like
      if (!store) {
        return handleResponse(res, 404, "Store is not available to favorite");
      }
      const already = favorites.stores.some(
        (id) => String(id) === String(storeId),
      );
      if (!already) {
        favorites.stores.push(storeId);
        await favorites.save();
        await adjustFavoriteCount(storeId, 1);
      }
      isFavorite = true;
      message = "Store added to favorites";
    }

    const updated = await fetchPopulatedFavorites(favorites._id);
    const freshStore = await Store.findById(storeId)
      .select("favoriteCount")
      .lean();

    return handleResponse(res, 200, message, {
      ...updated,
      isFavorite,
      storeId: String(storeId),
      favoriteCount: Number(freshStore?.favoriteCount || 0),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const removeFavoriteStore = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { storeId } = req.params;

    const favorites = await FavoriteStore.findOne({ customerId });
    if (!favorites) {
      return handleResponse(res, 404, "Favorite stores not found");
    }

    const existed = favorites.stores.some(
      (id) => String(id) === String(storeId),
    );
    favorites.stores = favorites.stores.filter(
      (id) => String(id) !== String(storeId),
    );
    await favorites.save();

    if (existed) {
      await adjustFavoriteCount(storeId, -1);
    }

    const updated = await fetchPopulatedFavorites(favorites._id);
    return handleResponse(res, 200, "Store removed from favorites", updated);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
