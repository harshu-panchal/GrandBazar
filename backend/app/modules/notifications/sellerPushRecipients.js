import Store from "../../models/store.js";

/**
 * Seller JWT / PushToken userId may be either a Store _id or the owner Seller _id
 * (and after store switches, tokens can linger on a sibling store id).
 * Expand a seller recipient so FCM delivery finds any of those tokens.
 */
export async function resolveSellerPushUserIds(recipientId) {
  const raw = recipientId != null ? String(recipientId).trim() : "";
  if (!raw) return [];

  const ids = new Set([raw]);

  try {
    const asStore = await Store.findById(raw).select("ownerId").lean();
    if (asStore?.ownerId) {
      const ownerId = String(asStore.ownerId);
      ids.add(ownerId);
      const siblings = await Store.find({ ownerId }).select("_id").lean();
      for (const store of siblings) {
        ids.add(String(store._id));
      }
      return [...ids];
    }

    const ownedStores = await Store.find({ ownerId: raw }).select("_id").lean();
    for (const store of ownedStores) {
      ids.add(String(store._id));
    }
  } catch {
    /* keep at least the original id */
  }

  return [...ids];
}

export default {
  resolveSellerPushUserIds,
};
