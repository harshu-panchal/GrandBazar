import Store from "../../models/store.js";

/**
 * Seller JWT / PushToken userId may be either a Store _id or the owner
 * Seller _id — expand a seller recipient so FCM delivery finds tokens
 * registered under either form for THIS SAME STORE.
 *
 * Deliberately does NOT fan out to sibling stores under the same owner
 * (it previously did) — an assistant's device token is registered under
 * the one store they're scoped to, and a notification raised for a
 * DIFFERENT store owned by the same person must not reach it. The owner's
 * own account id is still included so the owner (who can act across all
 * their stores) is reachable regardless of which store token they're on.
 */
export async function resolveSellerPushUserIds(recipientId) {
  const raw = recipientId != null ? String(recipientId).trim() : "";
  if (!raw) return [];

  const ids = new Set([raw]);

  try {
    const asStore = await Store.findById(raw).select("ownerId").lean();
    if (asStore?.ownerId) {
      // recipientId is a specific store — reach the owner too, but never a
      // sibling store (that's the assistant-scoping leak this used to have).
      ids.add(String(asStore.ownerId));
      return [...ids];
    }

    // recipientId is the owner's own account id (not a store) — an
    // owner-level notification legitimately needs to reach whichever store
    // token the owner's device last registered under, since an owner (not
    // an assistant) can act across every store they own.
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
