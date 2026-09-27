import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { BellRing, MapPin, Package, Navigation, RotateCcw, AlertCircle } from "lucide-react";
import { deliveryApi } from "../services/deliveryApi";
import { useAuth } from "@core/context/AuthContext";
import {
  getOrderSocket,
  onDeliveryBroadcast,
  onDeliveryBroadcastWithdrawn,
} from "@/core/services/orderSocket";
import {
  loadHandledIncomingOrderIds,
  markIncomingOrderHandled,
} from "../utils/deliveryHandledOrders";
import { saveDeliveryPartnerLocation } from "../utils/deliveryLastLocation";
import orderAlertSound from "@/assets/sounds/order_alert.mp3";

/** Match server `deliverySearchExpiresAt` — progress bar + countdown stay aligned when modal opens late. */
function secondsLeftUntilDeliveryExpiry(expiresAt) {
  if (!expiresAt) return 60;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

function formatFullAddress(addrObj) {
  if (!addrObj) return "";
  const base = typeof addrObj === "string" ? addrObj : (addrObj.address || "");
  const parts = [];
  if (base.trim()) parts.push(base.trim());
  const extraFields = [
    addrObj.locality,
    addrObj.landmark,
    addrObj.city,
    addrObj.state,
    addrObj.pincode,
  ].flatMap((p) => {
    if (!p || typeof p !== "string") return [];
    return p.split(",").map((s) => s.trim()).filter(Boolean);
  });

  for (const part of extraFields) {
    const combined = parts.join(", ").toLowerCase();
    if (!combined.includes(part.toLowerCase())) {
      parts.push(part);
    }
  }
  return parts.join(", ");
}

const DeliveryLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mainRef = useRef(null);

  useEffect(() => {
    // Reset both the internal scroll container and the window itself — on
    // some mobile viewports (dynamic browser-chrome height) the outer shell
    // ends up taller than the screen and the window scrolls instead of
    // `main`'s own overflow, so resetting only one of them left the page
    // opening mid-scroll.
    mainRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const [activeOrder, setActiveOrder] = useState(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [acceptWindowTotal, setAcceptWindowTotal] = useState(60);
  const shownOrderIdsRef = useRef(new Set());
  const activeOrderRef = useRef(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [availableOrdersCount, setAvailableOrdersCount] = useState(0);
  const [isAcceptingOrder, setIsAcceptingOrder] = useState(false);
  const acceptInFlightRef = useRef(false);
  const didInitialAvailableFetchRef = useRef(false);
  const didInitialNotificationsPollRef = useRef(false);
  const didInitialLocationSendRef = useRef(false);
  const availableOrdersRequestRef = useRef({ inFlight: false, controller: null });
  const notificationsRequestRef = useRef({ inFlight: false, controller: null });
  const locationRequestRef = useRef({ inFlight: false, controller: null });
  const orderRingtoneRef = useRef(null);
  const ringtoneRetryTimerRef = useRef(null);
  const ringtoneUnlockHandlerRef = useRef(null);

  const getOrderRingtone = () => {
    if (!orderRingtoneRef.current) {
      const audio = new Audio(orderAlertSound);
      audio.loop = true;
      audio.preload = "auto";
      orderRingtoneRef.current = audio;
    }
    return orderRingtoneRef.current;
  };

  const startOrderRingtone = () => {
    const audio = getOrderRingtone();
    audio.loop = true;
    audio.preload = "auto";
    audio.muted = false;
    audio.volume = 1;
    audio.play().catch(() => { });

    if (!ringtoneRetryTimerRef.current) {
      ringtoneRetryTimerRef.current = setInterval(() => {
        if (!activeOrderRef.current) return;
        const currentAudio = getOrderRingtone();
        if (!currentAudio.paused) return;
        currentAudio.play().catch(() => { });
      }, 1200);
    }

    if (
      !ringtoneUnlockHandlerRef.current &&
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    ) {
      const unlockPlayback = () => {
        if (!activeOrderRef.current) return;
        const currentAudio = getOrderRingtone();
        if (!currentAudio.paused) return;
        currentAudio.play().catch(() => { });
      };
      ringtoneUnlockHandlerRef.current = unlockPlayback;
      window.addEventListener("focus", unlockPlayback);
      document.addEventListener("visibilitychange", unlockPlayback);
      document.addEventListener("pointerdown", unlockPlayback);
      document.addEventListener("touchstart", unlockPlayback);
      document.addEventListener("keydown", unlockPlayback);
    }
  };

  const stopOrderRingtone = () => {
    const audio = orderRingtoneRef.current;
    if (ringtoneRetryTimerRef.current) {
      clearInterval(ringtoneRetryTimerRef.current);
      ringtoneRetryTimerRef.current = null;
    }
    if (
      ringtoneUnlockHandlerRef.current &&
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    ) {
      window.removeEventListener("focus", ringtoneUnlockHandlerRef.current);
      document.removeEventListener("visibilitychange", ringtoneUnlockHandlerRef.current);
      document.removeEventListener("pointerdown", ringtoneUnlockHandlerRef.current);
      document.removeEventListener("touchstart", ringtoneUnlockHandlerRef.current);
      document.removeEventListener("keydown", ringtoneUnlockHandlerRef.current);
      ringtoneUnlockHandlerRef.current = null;
    }
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  };

  useEffect(() => {
    activeOrderRef.current = activeOrder;
  }, [activeOrder]);

  /** While working an active order, do not stack the global incoming-offer modal (fixes refresh on order details). */
  const suppressIncomingModal = useMemo(
    () =>
      /\/delivery\/(confirm-delivery|navigation)/.test(location.pathname),
    [location.pathname],
  );

  useEffect(() => {
    loadHandledIncomingOrderIds().forEach((id) => shownOrderIdsRef.current.add(id));
  }, []);

  const applyFromBroadcastPayload = useCallback((payload) => {
    if (!payload?.orderId) return false;
    if (activeOrderRef.current) return true;

    const p = payload.preview || {};
    const isReturn = payload.type === "RETURN_PICKUP" || payload.isReturnPickup === true || p.isReturnPickup === true;

    // For return pickups: don't permanently block on shownOrderIdsRef — the same
    // orderId is reused across multiple "Notify Riders" / "Renotify Riders" calls.
    // For regular orders: dedup once per accept window to prevent double-modals.
    if (!isReturn && shownOrderIdsRef.current.has(payload.orderId)) return true;

    // Guard: preview must have a pickup string and a non-empty drop string.
    // For return pickups, fall back to safe defaults so a missing address field
    // never silently swallows the broadcast.
    const pickupRaw = p.pickup ?? "";
    const dropRaw   = p.drop   ?? "";
    if (
      (typeof pickupRaw !== "string" && !isReturn) ||
      (typeof dropRaw !== "string" && typeof dropRaw !== "number") ||
      String(dropRaw).trim() === ""
    ) {
      if (!isReturn) return false;
      // For return pickups keep going even with empty pickup/drop — we have fallback labels
    }
    // Non-return orders must still have a valid pickup string
    if (!isReturn && typeof pickupRaw !== "string") return false;

    const exp = payload.deliverySearchExpiresAt;
    // Return pickups are open until accepted — never block them on expiry.
    // Regular order broadcasts are time-boxed to the accept window.
    if (!isReturn && exp && secondsLeftUntilDeliveryExpiry(exp) <= 0) {
      return false;
    }
    shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(payload.orderId);
    const total = typeof p.total === "number" ? p.total : Number(p.total) || 0;
    const dropLabel = typeof p.drop === "string" ? p.drop : String(p.drop || "");
    const rawEarnings = typeof p.earnings === "number" ? p.earnings : Number(p.earnings);
    const earnings = Number.isFinite(rawEarnings) && rawEarnings > 0 ? rawEarnings : 30;
    const distanceKm = typeof p.distanceKm === "number" ? p.distanceKm : Number(p.distanceKm);
    const distanceText = p.distanceText || (Number.isFinite(distanceKm) && distanceKm > 0 ? `${distanceKm} km` : "Nearby");

    const pickupTitle = p.pickupTitle || (isReturn ? "Customer" : (p.pickup ? p.pickup.split(" - ")[0] : "Seller Store"));
    const pickupAddress = p.pickupAddress || (p.pickup && p.pickup.includes(" - ") ? p.pickup.split(" - ").slice(1).join(" - ") : p.pickup) || (isReturn ? "Customer Address" : "Seller Store");
    const dropTitle = p.dropTitle || (isReturn ? "Seller Store" : "Customer Drop");
    const dropAddress = p.dropAddress || dropLabel || (isReturn ? "Seller Store" : "Customer address");

    const items = Array.isArray(payload.items) && payload.items.length > 0
      ? payload.items
      : Array.isArray(p.items) && p.items.length > 0
        ? p.items
        : [];

    setActiveOrder({
      id: payload.orderId,
      mongoId: undefined,
      pickup: p.pickup || (isReturn ? "Customer Address" : "Seller Store"),
      pickupTitle,
      pickupAddress,
      drop: dropLabel || (isReturn ? "Seller Store" : "Customer"),
      dropTitle,
      dropAddress,
      distance: distanceText,
      value: total,
      earnings: earnings,
      expiresAt: payload.deliverySearchExpiresAt || null,
      isReturnPickup: isReturn,
      returnReason: p.returnReason || payload.returnReason || "",
      isPreAssigned: payload.type === "ADMIN_ASSIGNED",
      items,
    });
    return true;
  }, []);

  const applyAvailableOrdersList = useCallback((availableOrders) => {
    setAvailableOrdersCount(availableOrders.length);
    if (activeOrderRef.current) return;
    const newOrder = availableOrders.find((o) => {
      if (shownOrderIdsRef.current.has(o.orderId)) return false;
      // Return pickups stay open until a rider accepts — never expire them
      const isReturnOrder = o.isReturnPickup || false;
      if (
        !isReturnOrder &&
        o.deliverySearchExpiresAt &&
        secondsLeftUntilDeliveryExpiry(o.deliverySearchExpiresAt) <= 0
      ) {
        return false;
      }
      return true;
    });
    if (!newOrder) return;
    shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(newOrder.orderId);
    const total = newOrder.pricing?.total || newOrder.total || 0;
    const isReturnPickup = newOrder.isReturnPickup || false;
    const rawEarnings = typeof newOrder.riderEarnings === "number" ? newOrder.riderEarnings : Number(newOrder.riderEarnings);
    const earnings = Number.isFinite(rawEarnings) && rawEarnings > 0 ? rawEarnings : 30;
    const distanceKm = typeof newOrder.distanceKm === "number" ? newOrder.distanceKm : Number(newOrder.distanceKm);
    const distanceText = newOrder.distanceText || (Number.isFinite(distanceKm) && distanceKm > 0 ? `${distanceKm} km` : "Nearby");

    const sellerAddressStr = formatFullAddress(newOrder.seller);
    const custAddressStr = formatFullAddress(newOrder.address) || "Customer Address";

    const pickupTitle = isReturnPickup
      ? (newOrder.customer?.name || "Customer")
      : (newOrder.seller?.shopName || "Seller Store");
    const pickupAddress = isReturnPickup
      ? custAddressStr
      : (sellerAddressStr || newOrder.seller?.shopName || "Seller Store");

    const dropTitle = isReturnPickup
      ? (newOrder.seller?.shopName || "Seller Store")
      : (newOrder.customer?.name || newOrder.address?.name || "Customer");
    const dropAddress = isReturnPickup
      ? (sellerAddressStr || "Seller Store")
      : custAddressStr;

    const items = Array.isArray(newOrder.items) && newOrder.items.length > 0
      ? newOrder.items.map((i) => ({
          name: i.name || i.productName || "Product",
          image: i.image || i.productImage || (Array.isArray(i.images) ? i.images[0] : "") || "",
          quantity: Number(i.quantity) || 1,
          price: Number(i.price ?? i.unitPrice ?? 0),
        }))
      : [];

    setActiveOrder({
      id: newOrder.orderId,
      mongoId: newOrder._id,
      pickup: isReturnPickup
        ? custAddressStr
        : newOrder.seller?.shopName
          ? sellerAddressStr ? `${newOrder.seller.shopName} - ${sellerAddressStr}` : newOrder.seller.shopName
          : "Seller",
      pickupTitle,
      pickupAddress,
      drop: isReturnPickup
        ? sellerAddressStr || newOrder.seller?.shopName || "Seller Store"
        : custAddressStr,
      dropTitle,
      dropAddress,
      distance: distanceText,
      value: total,
      earnings: earnings,
      expiresAt: newOrder.deliverySearchExpiresAt || null,
      isReturnPickup,
      returnReason: newOrder.returnReason || "",
      items,
    });
  }, []);

  useEffect(() => {
    if (activeOrder) {
      startOrderRingtone();
      return undefined;
    }
    stopOrderRingtone();
    return undefined;
  }, [activeOrder]);

  useEffect(() => {
    return () => {
      stopOrderRingtone();
    };
  }, []);

  const hideBottomNavRoutes = [
    "/delivery/login",
    "/delivery/auth",
    "/delivery/splash",
    "/delivery/navigation",
    "/delivery/confirm-delivery",
    "/delivery/order-details",
  ];

  const shouldShowBottomNav = !hideBottomNavRoutes.some((route) =>
    location.pathname.includes(route),
  );

  const fetchAvailableOrders = useCallback(async () => {
    if (availableOrdersRequestRef.current.inFlight) return null;
    availableOrdersRequestRef.current.inFlight = true;

    if (availableOrdersRequestRef.current.controller) {
      availableOrdersRequestRef.current.controller.abort();
    }
    const controller = new AbortController();
    availableOrdersRequestRef.current.controller = controller;

    try {
      // type=all ensures both regular deliveries AND return pickups are returned
      return await deliveryApi.getAvailableOrders({ type: "all" }, {
        signal: controller.signal,
        timeout: 15000,
      });
    } catch (error) {
      if (
        error?.code === "ERR_CANCELED" ||
        error?.name === "CanceledError" ||
        error?.name === "AbortError"
      ) {
        return null;
      }
      throw error;
    } finally {
      if (availableOrdersRequestRef.current.controller === controller) {
        availableOrdersRequestRef.current.controller.abort();
        availableOrdersRequestRef.current.controller = null;
        availableOrdersRequestRef.current.inFlight = false;
      }
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (notificationsRequestRef.current.inFlight) return null;
    notificationsRequestRef.current.inFlight = true;

    if (notificationsRequestRef.current.controller) {
      notificationsRequestRef.current.controller.abort();
    }
    const controller = new AbortController();
    notificationsRequestRef.current.controller = controller;

    try {
      return await deliveryApi.getNotifications({
        signal: controller.signal,
        timeout: 15000,
      });
    } catch (error) {
      if (
        error?.code === "ERR_CANCELED" ||
        error?.name === "CanceledError" ||
        error?.name === "AbortError"
      ) {
        return null;
      }
      throw error;
    } finally {
      if (notificationsRequestRef.current.controller === controller) {
        notificationsRequestRef.current.controller = null;
        notificationsRequestRef.current.inFlight = false;
      }
    }
  }, []);

  const postLocationOnce = useCallback(async (lat, lng) => {
    if (locationRequestRef.current.inFlight) return;
    locationRequestRef.current.inFlight = true;

    if (locationRequestRef.current.controller) {
      locationRequestRef.current.controller.abort();
    }
    const controller = new AbortController();
    locationRequestRef.current.controller = controller;

    try {
      saveDeliveryPartnerLocation(lat, lng);
      await deliveryApi.postLocation(
        { lat, lng },
        { signal: controller.signal, timeout: 10000 },
      );
    } catch {
      /* ignore */
    } finally {
      if (locationRequestRef.current.controller === controller) {
        locationRequestRef.current.controller = null;
        locationRequestRef.current.inFlight = false;
      }
    }
  }, []);

  // Poll for available orders (deliveries + return pickups) on a regular
  // interval while the rider is online and idle. This is the primary recovery
  // path for any missed socket broadcast — socket is still the fastest path,
  // but polling guarantees the popup eventually appears even after a missed
  // or delayed socket event.
  useEffect(() => {
    if (!user?.isOnline) {
      didInitialAvailableFetchRef.current = false;
      if (availableOrdersRequestRef.current.controller) {
        availableOrdersRequestRef.current.controller.abort();
      }
      return undefined;
    }

    const runFetch = async () => {
      if (activeOrderRef.current || suppressIncomingModal) return;
      try {
        const res = await fetchAvailableOrders();
        if (!res) return;
        if (res.data.success) {
          const availableOrders = res.data.results || res.data.result || [];
          applyAvailableOrdersList(availableOrders);
        }
      } catch (error) {
        if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
          console.error("Delivery Polling Error:", error);
        }
      } finally {
        if (isFirstLoad) setIsFirstLoad(false);
      }
    };

    // Immediate fetch on going online
    if (!didInitialAvailableFetchRef.current) {
      didInitialAvailableFetchRef.current = true;
      runFetch();
    }

    // Then poll every 8 seconds to catch any missed broadcasts
    const intervalId = setInterval(runFetch, 8000);

    return () => {
      clearInterval(intervalId);
      if (availableOrdersRequestRef.current.controller) {
        availableOrdersRequestRef.current.controller.abort();
      }
    };
  }, [
    user?.isOnline,
    suppressIncomingModal,
    applyAvailableOrdersList,
    fetchAvailableOrders,
  ]);

  // Real-time location while online — required for seller service-radius matching on new orders
  useEffect(() => {
    if (!user?.isOnline || typeof navigator === "undefined" || !navigator.geolocation) {
      didInitialLocationSendRef.current = false;
      if (locationRequestRef.current.controller) {
        locationRequestRef.current.controller.abort();
      }
      return undefined;
    }

    if (didInitialLocationSendRef.current) return undefined;
    didInitialLocationSendRef.current = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        postLocationOnce(pos.coords.latitude, pos.coords.longitude);
      },
      () => { },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
    );

    return () => {
      if (locationRequestRef.current.controller) {
        locationRequestRef.current.controller.abort();
      }
    };
  }, [user?.isOnline, postLocationOnce]);

  useEffect(() => {
    if (!user?.isOnline) return undefined;
    const getToken = () => localStorage.getItem("auth_delivery");
    getOrderSocket(getToken);
    return onDeliveryBroadcast(getToken, (payload) => {
      if (activeOrderRef.current || suppressIncomingModal) return;
      const opened = applyFromBroadcastPayload(payload);
      if (opened) return;
      // Payload was rejected (e.g. missing preview fields) — fetch the full
      // order list including return pickups (type=all) as a safety fallback
      fetchAvailableOrders()
        .then((res) => {
          if (!res?.data?.success) return;
          const list = res.data.results || res.data.result || [];
          applyAvailableOrdersList(list);
        })
        .catch(() => { });
    });
  }, [
    user?.isOnline,
    applyAvailableOrdersList,
    applyFromBroadcastPayload,
    suppressIncomingModal,
    fetchAvailableOrders,
  ]);

  useEffect(() => {
    if (!user?.isOnline) return undefined;
    const getToken = () => localStorage.getItem("auth_delivery");
    return onDeliveryBroadcastWithdrawn(getToken, (payload) => {
      const orderId = payload?.orderId;
      if (!orderId) return;

      shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(orderId);
      markIncomingOrderHandled(orderId);

      if (activeOrderRef.current?.id === orderId) {
        acceptInFlightRef.current = false;
        setIsAcceptingOrder(false);
        stopOrderRingtone();
        setActiveOrder(null);
        toast.info("Another delivery partner accepted this order.");
      }
    });
  }, [user?.isOnline]);

  // When a new DB notification arrives (same row as bell list), open the same popup if socket was missed.
  // Runs once on going online — the 8s polling loop above is the primary recovery path.
  useEffect(() => {
    if (!user?.isOnline) {
      didInitialNotificationsPollRef.current = false;
      if (notificationsRequestRef.current.controller) {
        notificationsRequestRef.current.controller.abort();
      }
      return undefined;
    }

    // Only run once per online session — the interval poll handles subsequent checks
    if (didInitialNotificationsPollRef.current) return undefined;
    didInitialNotificationsPollRef.current = true;

    const poll = async () => {
      try {
        const res = await fetchNotifications();
        if (!res?.data?.success) return;
        const result = res.data.result || res.data.data;
        const notifications = result?.notifications || [];
        if (activeOrderRef.current) return;
        for (const n of notifications) {
          const isIncomingOrderType =
            n.type === "order" || n.type === "RETURN_PICKUP_ASSIGNED";
          if (!isIncomingOrderType || n.isRead || !n.data?.orderId) continue;
          const oid = n.data.orderId;
          if (shownOrderIdsRef.current.has(oid)) continue;
          const fromStored = applyFromBroadcastPayload({
            orderId: oid,
            preview: n.data.preview || {},
            deliverySearchExpiresAt: n.data.deliverySearchExpiresAt,
            type: n.data.type || (n.data.preview?.type),
            isReturnPickup: n.data.isReturnPickup || n.data.type === "RETURN_PICKUP" || n.data.preview?.isReturnPickup,
            items: n.data.items || n.data.preview?.items || [],
          });
          if (fromStored) return;
          const r2 = await fetchAvailableOrders();
          if (!r2?.data?.success) return;
          const list = r2.data.results || r2.data.result || [];
          applyAvailableOrdersList(list);
          return;
        }
      } catch {
        /* ignore */
      }
    };
    poll();
    return () => {
      if (notificationsRequestRef.current.controller) {
        notificationsRequestRef.current.controller.abort();
      }
    };
  }, [
    user?.isOnline,
    applyFromBroadcastPayload,
    applyAvailableOrdersList,
    suppressIncomingModal,
    fetchNotifications,
    fetchAvailableOrders,
  ]);

  const skipOrder = useCallback(async () => {
    const current = activeOrderRef.current;
    if (!current || acceptInFlightRef.current) return;
    if (current.isPreAssigned) {
      // Nothing to reject — an admin-assigned order isn't in the broadcast
      // pool. Just dismiss the alert; it stays visible in "My Orders".
      shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(current.id);
      markIncomingOrderHandled(current.id);
      stopOrderRingtone();
      setActiveOrder(null);
      return;
    }
    try {
      console.log("Delivery Alert - Skipping order:", current.id);
      if (current.isReturnPickup) {
        await deliveryApi.rejectReturnPickup(current.id);
      } else {
        await deliveryApi.skipOrder(current.id);
      }
      shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(current.id);
      markIncomingOrderHandled(current.id);
      stopOrderRingtone();
      setActiveOrder(null);
      toast.info("Order skipped");
    } catch (error) {
      console.error("Delivery Alert - Skip failed:", error);
      setActiveOrder(null);
    }
  }, []);

  // Countdown from server deadline (same idea as seller panel) — skipped for
  // admin-assigned orders, which have no accept-window to race against.
  useEffect(() => {
    if (!activeOrder || activeOrder.isPreAssigned) return undefined;
    const left = secondsLeftUntilDeliveryExpiry(activeOrder.expiresAt);
    if (left <= 0) {
      if (!acceptInFlightRef.current) {
        skipOrder();
        toast.error("Order request timed out");
      }
      return undefined;
    }
    setAcceptWindowTotal(left);
    setTimeLeft(left);
    const timer = setInterval(() => {
      const next = secondsLeftUntilDeliveryExpiry(activeOrderRef.current?.expiresAt);
      setTimeLeft(next);
      if (next <= 0) {
        clearInterval(timer);
        if (!acceptInFlightRef.current) {
          skipOrder();
          toast.error("Order request timed out");
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeOrder, skipOrder]);

  const handleAcceptOrder = async () => {
    if (!activeOrder || acceptInFlightRef.current) return;
    if (
      activeOrder.expiresAt &&
      secondsLeftUntilDeliveryExpiry(activeOrder.expiresAt) <= 0
    ) {
      toast.error("This request has expired. Try the next one.");
      setActiveOrder(null);
      return;
    }
    acceptInFlightRef.current = true;
    setIsAcceptingOrder(true);
    try {
      console.log("Delivery Alert - Accepting order:", activeOrder.id);
      const idem =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}`;
      if (activeOrder.isPreAssigned) {
        // Already assigned server-side by admin — nothing to accept, just
        // acknowledging. Calling the normal accept endpoint here would fail
        // (order is no longer in the open accept-window state).
      } else if (activeOrder.isReturnPickup) {
        await deliveryApi.acceptReturnPickup(activeOrder.id);
      } else {
        await deliveryApi.acceptOrder(activeOrder.id, idem);
      }
      toast.success(activeOrder.isPreAssigned ? "Order opened" : "Order accepted!");
      const orderId = activeOrder.id;
      shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(orderId);
      markIncomingOrderHandled(orderId);
      stopOrderRingtone();
      setActiveOrder(null);
      navigate(`/delivery/order-details/${orderId}`);
    } catch (error) {
      console.error("Delivery Alert - Accept failed:", error);
      const msg =
        error.response?.data?.message ||
        (typeof error.response?.data === "string" ? error.response.data : null);
      toast.error(msg || "Failed to accept order");
      setActiveOrder(null);
    } finally {
      acceptInFlightRef.current = false;
      setIsAcceptingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans max-w-md mx-auto relative shadow-2xl overflow-hidden border-x border-gray-100">
      {/* Full-screen order alert — portaled so it always stacks above nav/content */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {activeOrder && (
              <div
                className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/85 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delivery-order-alert-title"
              >
                <motion.div
                  key={activeOrder.id}
                  initial={{ scale: 0.92, opacity: 0, y: 24 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.96, opacity: 0, y: 16 }}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  className="bg-white rounded-[32px] p-5 sm:p-6 w-full max-w-[380px] shadow-2xl border-4 border-primary/20 max-h-[92vh] overflow-y-auto no-scrollbar"
                >
                  <div className="flex flex-col items-center w-full">
                    {/* ── Icon + title — return vs regular ── */}
                    {activeOrder.isReturnPickup ? (
                      <>
                        <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 animate-bounce">
                          <RotateCcw className="h-8 w-8 text-primary" />
                        </div>
                        <h2
                          id="delivery-order-alert-title"
                          className="text-xl font-black text-slate-900 mb-1"
                        >
                          New Return Pickup
                        </h2>
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-4">
                          Collect from customer · drop at seller
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 animate-bounce">
                          <BellRing className="h-8 w-8 text-primary" />
                        </div>
                        <h2
                          id="delivery-order-alert-title"
                          className="text-xl font-black text-slate-900 mb-1"
                        >
                          {activeOrder.isPreAssigned ? "New order assigned to you" : "New order request"}
                        </h2>
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-4">
                          {activeOrder.isPreAssigned ? "Assigned by admin" : "Accept or reject"}
                        </p>
                      </>
                    )}

                    {/* ── Earnings + distance ── */}
                    <div className="flex items-center gap-3 mb-5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-2xl font-black text-brand-600">
                          ₹{activeOrder.earnings != null && Number(activeOrder.earnings) > 0 ? Number(activeOrder.earnings).toFixed(2) : "30.00"}
                        </span>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Est. earnings
                        </span>
                      </div>
                      {activeOrder.distance && (
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200/60 px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0">
                          <Navigation className="w-3 h-3 text-primary inline" />
                          {activeOrder.distance}
                        </span>
                      )}
                    </div>

                    {/* ── Items + address cards ── */}
                    <div className="w-full space-y-3 mb-5">
                      {activeOrder.items?.length > 0 && (
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col gap-2">
                          <div className="flex items-center justify-between px-0.5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                              {activeOrder.isReturnPickup
                                ? `Return Items (${activeOrder.items.length})`
                                : `Order Items (${activeOrder.items.length})`}
                            </p>
                            {activeOrder.value > 0 && (
                              <span className="text-[10px] font-bold text-slate-500">
                                Order: ₹{Number(activeOrder.value).toFixed(0)}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5">
                            {activeOrder.items.map((item, idx) => (
                              <div key={idx} className="flex-shrink-0 flex items-center gap-2.5 bg-white p-2 rounded-xl border border-slate-200/80 shadow-xs min-w-[155px] max-w-[210px]">
                                <div className="h-10 w-10 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-100">
                                  {item.image ? (
                                    <img src={item.image} alt={item.name || "Product"} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center bg-slate-50">
                                      <Package className="w-4 h-4 text-slate-300" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-bold text-slate-900 truncate" title={item.name}>
                                    {item.name || "Product"}
                                  </p>
                                  <div className="flex items-center justify-between mt-0.5">
                                    <span className="text-[10px] font-extrabold text-primary">
                                      {item.quantity || 1} Unit{Number(item.quantity) > 1 ? "s" : ""}
                                    </span>
                                    {item.price > 0 && (
                                      <span className="text-[10px] font-semibold text-slate-500">
                                        ₹{Number(item.price).toFixed(0)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pickup address */}
                      <div className="flex items-start gap-2.5 bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center mt-0.5 shrink-0">
                          <div className="w-2 h-2 rounded-full bg-emerald-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider">
                            {activeOrder.isReturnPickup ? "Customer Pickup" : "Store Pickup"}
                          </p>
                          <p className="text-xs font-bold text-slate-900 leading-snug">
                            {activeOrder.pickupTitle || (activeOrder.pickup ? activeOrder.pickup.split(" - ")[0] : "Seller Store")}
                          </p>
                          <p className="text-[11px] font-medium text-slate-500 leading-tight mt-0.5 line-clamp-2">
                            {activeOrder.pickupAddress || activeOrder.pickup || "Store address"}
                          </p>
                        </div>
                      </div>

                      {/* Drop address */}
                      <div className="flex items-start gap-2.5 bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                        <MapPin className="h-5 w-5 text-rose-500 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-extrabold text-rose-700 uppercase tracking-wider">
                            {activeOrder.isReturnPickup ? "Return To Seller" : "Customer Drop"}
                          </p>
                          <p className="text-xs font-bold text-slate-900 leading-snug">
                            {activeOrder.dropTitle || (activeOrder.isReturnPickup ? "Seller Store" : "Customer")}
                          </p>
                          <p className="text-[11px] font-medium text-slate-500 leading-tight mt-0.5 line-clamp-2">
                            {activeOrder.dropAddress || activeOrder.drop || "Delivery address"}
                          </p>
                        </div>
                      </div>

                      {/* Return reason — only for return pickups */}
                      {activeOrder.isReturnPickup && activeOrder.returnReason && (
                        <div className="flex items-start gap-2.5 bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                          <AlertCircle className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Return Reason</p>
                            <p className="text-xs font-semibold text-slate-800 leading-snug mt-0.5 line-clamp-2">
                              {activeOrder.returnReason}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Countdown timer ── */}
                    {!activeOrder.isPreAssigned && (
                      <>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full mb-2 overflow-hidden">
                          <motion.div
                            key={`${activeOrder.id}-${acceptWindowTotal}`}
                            initial={{ width: "100%" }}
                            animate={{ width: "0%" }}
                            transition={{
                              duration: Math.max(1, acceptWindowTotal || 60),
                              ease: "linear",
                            }}
                            className={timeLeft < 10 ? "bg-rose-500 h-full" : "bg-primary h-full"}
                          />
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 mb-4 w-full text-center">
                          {timeLeft}s left to respond
                        </p>
                      </>
                    )}

                    {/* ── Action buttons ── */}
                    {activeOrder.isPreAssigned ? (
                      <button
                        type="button"
                        onClick={handleAcceptOrder}
                        disabled={isAcceptingOrder}
                        className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-wider shadow-lg shadow-primary/30 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
                      >
                        {isAcceptingOrder ? "Opening…" : "View Order"}
                      </button>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 w-full">
                        <button
                          type="button"
                          onClick={skipOrder}
                          disabled={isAcceptingOrder}
                          className="py-4 rounded-2xl bg-slate-100 text-slate-700 font-black text-xs uppercase tracking-wider hover:bg-slate-200/80 disabled:opacity-50 disabled:pointer-events-none"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={handleAcceptOrder}
                          disabled={isAcceptingOrder}
                          className="py-4 rounded-2xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-wider shadow-lg shadow-primary/30 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
                        >
                          {isAcceptingOrder ? "Accepting…" : "Accept"}
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      <main
        ref={mainRef}
        className={`h-full min-h-screen overflow-y-auto ${shouldShowBottomNav ? "pb-24" : ""} no-scrollbar`}>
        <Outlet />
      </main>

      {shouldShowBottomNav && <BottomNav />}
    </div>
  );
};

export default DeliveryLayout;
