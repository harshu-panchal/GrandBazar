import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "@shared/layout/DashboardLayout";
import ScrollToTop from "@shared/components/ScrollToTop";
import { useSupportUnread } from "@core/context/SupportUnreadContext";
import { useAuth } from "@core/context/AuthContext";
import { adminApi } from "../services/adminApi";
import {
  LayoutDashboard,
  Tag,
  Box,
  Building2,
  Truck,
  Wallet,
  Banknote,
  Receipt,
  CircleDollarSign,
  Users,
  HelpCircle,
  ClipboardList,
  RotateCcw,
  Settings,
  Terminal,
  Sparkles,
  User,
  Activity,
  Library,
} from "lucide-react";

const Dashboard = React.lazy(() => import("../pages/Dashboard"));
const SessionMonitor = React.lazy(() => import("../pages/SessionMonitor"));
const HeaderCategories = React.lazy(
  () => import("../pages/categories/HeaderCategories"),
);
const Level2Categories = React.lazy(
  () => import("../pages/categories/Level2Categories"),
);
const SubCategories = React.lazy(
  () => import("../pages/categories/SubCategories"),
);
const CategoryHierarchy = React.lazy(
  () => import("../pages/categories/CategoryHierarchy"),
);
const ProductManagement = React.lazy(
  () => import("../pages/ProductManagement"),
);
const CatalogManagement = React.lazy(
  () => import("../pages/CatalogManagement"),
);
const CatalogBundleManagement = React.lazy(
  () => import("../pages/CatalogBundleManagement"),
);
const ActiveSellers = React.lazy(() => import("../pages/ActiveSellers"));
const PendingSellers = React.lazy(() => import("../pages/PendingSellers"));
const SellerLocations = React.lazy(() => import("../pages/SellerLocations"));
const ActiveDeliveryBoys = React.lazy(
  () => import("../pages/ActiveDeliveryBoys"),
);
const PendingDeliveryBoys = React.lazy(
  () => import("../pages/PendingDeliveryBoys"),
);
const DeliveryFunds = React.lazy(() => import("../pages/DeliveryFunds"));
const AdminWallet = React.lazy(() => import("../pages/AdminWallet"));
const BulkSettlements = React.lazy(() => import("../pages/BulkSettlements"));
const WithdrawalRequests = React.lazy(
  () => import("../pages/WithdrawalRequests"),
);
const SellerTransactions = React.lazy(
  () => import("../pages/SellerTransactions"),
);
const CashCollection = React.lazy(() => import("../pages/CashCollection"));
const CustomerManagement = React.lazy(
  () => import("../pages/CustomerManagement"),
);
const CustomerDetail = React.lazy(() => import("../pages/CustomerDetail"));
const UserManagement = React.lazy(() => import("../pages/UserManagement"));
const Profile = React.lazy(() => import("@/pages/Profile"));
const FAQManagement = React.lazy(() => import("../pages/FAQManagement"));
const OrdersList = React.lazy(() => import("../pages/OrdersList"));
const OrderDetail = React.lazy(() => import("../pages/OrderDetail"));
const DisputeConsolePage = React.lazy(() => import("../pages/DisputeConsolePage"));
const Returns = React.lazy(() => import("../pages/Returns"));
const Refunds = React.lazy(() => import("../pages/Refunds"));
const SellerDetail = React.lazy(() => import("../pages/SellerDetail"));
const SubscriptionManagement = React.lazy(() => import("../pages/SubscriptionManagement"));
const SupportTickets = React.lazy(() => import("../pages/SupportTickets"));
const ReviewModeration = React.lazy(() => import("../pages/ReviewModeration"));
const FleetTracking = React.lazy(() => import("../pages/FleetTracking"));
const CouponManagement = React.lazy(() => import("../pages/CouponManagement"));
const RewardCampaigns = React.lazy(() => import("../pages/RewardCampaigns"));
const RewardAnalytics = React.lazy(() => import("../pages/RewardAnalytics"));
const AdvanceBookingCampaigns = React.lazy(() => import("../pages/AdvanceBookingCampaigns"));
const ContentManager = React.lazy(() => import("../pages/ContentManager"));
const HeroCategoriesPerPage = React.lazy(() => import("../pages/HeroCategoriesPerPage"));
const NotificationComposer = React.lazy(
  () => import("../pages/NotificationComposer"),
);
const OffersManagement = React.lazy(
  () => import("../pages/OffersManagement"),
);
const OfferSectionsManagement = React.lazy(
  () => import("../pages/OfferSectionsManagement"),
);
const ShopByStoreManagement = React.lazy(
  () => import("../pages/ShopByStoreManagement"),
);
const AdminSettings = React.lazy(() => import("../pages/AdminSettings"));
const EnvSettings = React.lazy(() => import("../pages/EnvSettings"));
const AdminProfile = React.lazy(() => import("../pages/AdminProfile"));

const navItems = [
  {
    label: "Dashboard",
    path: "/admin",
    icon: LayoutDashboard,
    color: "indigo",
    end: true,
    permission: "dashboard",
  },
  {
    label: "Categories",
    icon: Tag,
    color: "rose",
    permission: "categories",
    children: [
      { label: "All Categories", path: "/admin/categories/hierarchy", permission: "categories.all" },
      { label: "Header Categories", path: "/admin/categories/header", permission: "categories.header" },
      { label: "Main Categories", path: "/admin/categories/level2", permission: "categories.level2" },
      { label: "Sub-Categories", path: "/admin/categories/sub", permission: "categories.sub" },
    ],
  },
  {
    label: "Products",
    path: "/admin/products",
    icon: Box,
    color: "amber",
    permission: "products.list",
  },
  {
    label: "Master Catalog",
    path: "/admin/catalog",
    end: true,
    icon: Library,
    color: "violet",
    permission: "products.catalog",
  },
  {
    label: "Catalog Bundles",
    path: "/admin/catalog/bundles",
    icon: Library,
    color: "violet",
    permission: "products.bundles",
  },
  {
    label: "Marketing Tools",
    icon: Sparkles,
    color: "amber",
    permission: "marketing",
    children: [
      { label: "Create Sections", path: "/admin/experience-studio", permission: "marketing.sections" },
      { label: "Hero & categories per page", path: "/admin/hero-categories", permission: "marketing.hero" },
      { label: "Send Notifications", path: "/admin/notifications", permission: "marketing.notifications" },
      { label: "Coupons & Promos", path: "/admin/coupons", permission: "marketing.coupons" },
      { label: "Reward Campaigns", path: "/admin/reward-campaigns", permission: "marketing.reward_campaigns" },
      { label: "Advance Booking", path: "/admin/advance-bookings", permission: "marketing.advance_booking" },
      { label: "Reward Analytics", path: "/admin/reward-analytics", permission: "marketing.reward_analytics" },
      { label: "Offer Sections", path: "/admin/offer-sections", permission: "marketing.offer_sections" },
      { label: "Shop by Store", path: "/admin/shop-by-store", permission: "marketing.shop_by_store" },
    ],
  },
  {
    label: "Customer Support",
    icon: Receipt,
    color: "emerald",
    permission: "support",
    children: [
      { label: "Help Tickets", path: "/admin/support-tickets", permission: "support.tickets" },
      { label: "Review Content", path: "/admin/moderation", permission: "support.moderation" },
    ],
  },
  {
    label: "Sellers",
    icon: Building2,
    color: "blue",
    permission: "sellers",
    children: [
      { label: "Active Sellers", path: "/admin/sellers/active", permission: "sellers.active" },
      { label: "Seller Applications", path: "/admin/sellers/pending", permission: "sellers.pending" },
      { label: "Subscriptions", path: "/admin/subscriptions", permission: "sellers.subscriptions" },
      { label: "Seller Locations", path: "/admin/seller-locations", permission: "sellers.locations" },
    ],
  },
  {
    label: "Delivery Drivers",
    icon: Truck,
    color: "emerald",
    permission: "delivery",
    children: [
      { label: "Active Drivers", path: "/admin/delivery-boys/active", permission: "delivery.active" },
      { label: "Waiting for Review", path: "/admin/delivery-boys/pending", permission: "delivery.pending" },
      { label: "Track Drivers", path: "/admin/tracking", permission: "delivery.tracking" },
      { label: "Send Money", path: "/admin/delivery-funds", permission: "delivery.funds" },
    ],
  },
  { 
    label: "Wallet", 
    path: "/admin/wallet", 
    icon: Wallet, 
    color: "violet",
    permission: "wallet",
  },
  {
    label: "Money Requests",
    path: "/admin/withdrawals",
    icon: Banknote,
    color: "cyan",
    permission: "withdrawals",
  },
  {
    label: "Seller Payments",
    path: "/admin/seller-transactions",
    icon: Receipt,
    color: "orange",
    permission: "seller_payments",
  },
  {
    label: "Bulk Settlements",
    path: "/admin/bulk-settlements",
    icon: Library,
    color: "amber",
    permission: "bulk_settlements",
  },
  {
    label: "Collect Cash",
    path: "/admin/cash-collection",
    icon: CircleDollarSign,
    color: "green",
    permission: "cash_collection",
  },
  { 
    label: "Customers", 
    path: "/admin/customers", 
    icon: Users, 
    color: "sky",
    permission: "customers",
  },
  { 
    label: "FAQs", 
    path: "/admin/faqs", 
    icon: HelpCircle, 
    color: "pink",
    permission: "faqs",
  },
  {
    label: "Orders",
    icon: ClipboardList,
    color: "fuchsia",
    permission: "orders",
    children: [
      { label: "All Orders", path: "/admin/orders/all", permission: "orders.all" },
      { label: "New Orders", path: "/admin/orders/pending", permission: "orders.pending" },
      { label: "Being Prepared", path: "/admin/orders/processed", permission: "orders.processed" },
      { label: "On the Way", path: "/admin/orders/out-for-delivery", permission: "orders.out_for_delivery" },
      { label: "Delivered", path: "/admin/orders/delivered", permission: "orders.delivered" },
      { label: "Cancelled", path: "/admin/orders/cancelled", permission: "orders.cancelled" },
      { label: "Returned", path: "/admin/orders/returned", permission: "orders.returned" },
      { label: "Return Requests", path: "/admin/returns", permission: "orders.returns" },
      { label: "Refund Ledger", path: "/admin/refunds", permission: "orders.refunds" },
    ],
  },
  {
    label: "Fees & Charges",
    path: "/admin/billing",
    icon: RotateCcw,
    color: "red",
    permission: "billing.fees",
  },
  {
    label: "City Commissions",
    path: "/admin/city-commissions",
    icon: RotateCcw,
    color: "red",
    permission: "billing.city_commissions",
  },
  {
    label: "Settings",
    path: "/admin/settings",
    icon: Settings,
    color: "slate",
    permission: "settings",
  },
  {
    label: "Staff Management",
    path: "/admin/users",
    icon: Users,
    color: "indigo",
    permission: "staff",
  },
  {
    label: "Active Sessions",
    path: "/admin/sessions",
    icon: Activity,
    color: "violet",
    permission: "staff",
  },
  { 
    label: "My Profile", 
    path: "/admin/profile", 
    icon: User, 
    color: "indigo" 
  },
  { 
    label: "System Settings", 
    path: "/admin/env", 
    icon: Terminal, 
    color: "dark",
    permission: "system",
  },
];

const BillingCharges = React.lazy(() => import("../pages/BillingCharges"));
const CityCommissions = React.lazy(() => import("../pages/CityCommissions"));

const AdminRoutes = () => {
  const { totalUnread } = useSupportUnread();
  const { user } = useAuth();
  const [pendingDeliveryCount, setPendingDeliveryCount] = React.useState(0);
  const [pendingSellerCount, setPendingSellerCount] = React.useState(0);
  const [pendingReturnCount, setPendingReturnCount] = React.useState(0);

  const isSuperAdminOrAdmin = React.useMemo(() => {
    const r = user?.role;
    return r === "superadmin" || r === "admin" || !r;
  }, [user]);

  const hasPermission = React.useCallback((permissionKey) => {
    if (isSuperAdminOrAdmin) return true;
    if (!permissionKey) return true;
    const allowed = user?.allowedPermissions || [];
    if (allowed.includes(permissionKey)) return true;
    // A child key implicitly matches a parent grant — if the admin granted
    // the whole module (e.g. "orders") the staff gets every sub-page too.
    const parent = permissionKey.includes('.') ? permissionKey.split('.')[0] : null;
    if (parent && allowed.includes(parent)) return true;
    return false;
  }, [isSuperAdminOrAdmin, user]);

  React.useEffect(() => {
    if (!hasPermission("delivery")) return undefined;
    let cancelled = false;
    const fetchPendingCount = async () => {
      try {
        const res = await adminApi.getDeliveryPartners({ verified: "false", limit: 1 });
        const total = Number(res?.data?.result?.total ?? 0);
        if (!cancelled) setPendingDeliveryCount(Number.isFinite(total) ? total : 0);
      } catch {
        // Non-fatal — badge just stays at its last known value.
      }
    };
    fetchPendingCount();
    const poll = setInterval(fetchPendingCount, 60000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdminOrAdmin]);

  React.useEffect(() => {
    if (!hasPermission("sellers")) return undefined;
    let cancelled = false;
    const fetchPendingSellerCount = async () => {
      try {
        const res = await adminApi.getPendingSellers({ limit: 1 });
        const total = Number(res?.data?.result?.total ?? 0);
        if (!cancelled) setPendingSellerCount(Number.isFinite(total) ? total : 0);
      } catch {
        // Non-fatal — badge just stays at its last known value.
      }
    };
    fetchPendingSellerCount();
    const poll = setInterval(fetchPendingSellerCount, 60000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdminOrAdmin]);

  React.useEffect(() => {
    if (!hasPermission("orders")) return undefined;
    let cancelled = false;
    const fetchPendingReturnCount = async () => {
      try {
        const res = await adminApi.getReturns();
        const payload = res?.data?.result || {};
        const items = Array.isArray(payload.items)
          ? payload.items
          : res?.data?.results || [];
        const count = items.filter(
          (r) => r.returnStatus === "return_requested" || r.returnStatus === "returned"
        ).length;
        if (!cancelled) setPendingReturnCount(count);
      } catch {
        // Non-fatal — badge just stays at its last known value.
      }
    };
    fetchPendingReturnCount();
    const poll = setInterval(fetchPendingReturnCount, 60000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdminOrAdmin]);

  const navItemsWithBadges = React.useMemo(() => {
    const allowed = user?.allowedPermissions || [];
    const permitted = (key) => {
      if (!key) return true;
      if (allowed.includes(key)) return true;
      const parent = key.includes('.') ? key.split('.')[0] : null;
      return !!(parent && allowed.includes(parent));
    };

    const filteredItems = navItems
      .filter((item) => {
        if (item.label === "My Profile") return true;
        if (item.permission === "staff") return isSuperAdminOrAdmin;
        if (isSuperAdminOrAdmin) return true;
        return permitted(item.permission);
      })
      .map((item) => {
        // Hide sidebar children the staff isn't allowed to see so the group
        // doesn't advertise sections they can't open.
        if (!isSuperAdminOrAdmin && Array.isArray(item.children)) {
          const visibleChildren = item.children.filter((c) => permitted(c.permission));
          if (visibleChildren.length === 0) return null;
          return { ...item, children: visibleChildren };
        }
        return item;
      })
      .filter(Boolean);

    const supportCount = Number.isFinite(totalUnread) ? totalUnread : 0;
    const deliveryCount = Number.isFinite(pendingDeliveryCount) ? pendingDeliveryCount : 0;
    const sellerCount = Number.isFinite(pendingSellerCount) ? pendingSellerCount : 0;
    const returnCount = Number.isFinite(pendingReturnCount) ? pendingReturnCount : 0;

    return filteredItems.map((item) => {
      if (item?.label === "Customer Support" && supportCount > 0) {
        return { ...item, badgeCount: supportCount };
      }
      if (item?.label === "Delivery Drivers" && deliveryCount > 0) {
        return { ...item, badgeCount: deliveryCount, badgePath: "/admin/delivery-boys/pending" };
      }
      if (item?.label === "Sellers" && sellerCount > 0) {
        return { ...item, badgeCount: sellerCount, badgePath: "/admin/sellers/pending" };
      }
      if (item?.label === "Orders" && returnCount > 0) {
        return {
          ...item,
          badgeCount: returnCount,
          badgePath: "/admin/returns",
          children: item.children?.map((child) =>
            child.label === "Return Requests"
              ? { ...child, badgeCount: returnCount }
              : child
          ),
        };
      }
      return item;
    });
  }, [totalUnread, pendingDeliveryCount, pendingSellerCount, pendingReturnCount, user, isSuperAdminOrAdmin]);

  return (
    <DashboardLayout navItems={navItemsWithBadges} title="Admin Center">
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        {hasPermission("staff") && <Route path="/users" element={<UserManagement />} />}
        {hasPermission("staff") && <Route path="/sessions" element={<SessionMonitor />} />}
        <Route path="/profile" element={<AdminProfile />} />
        
        {hasPermission("categories") && (
          <>
            <Route
              path="/categories"
              element={<Navigate to="/admin/categories/header" replace />}
            />
            <Route path="/categories/header" element={<HeaderCategories />} />
            <Route path="/categories/level2" element={<Level2Categories />} />
            <Route path="/categories/sub" element={<SubCategories />} />
            <Route path="/categories/hierarchy" element={<CategoryHierarchy />} />
          </>
        )}
        
        {hasPermission("products") && <Route path="/products" element={<ProductManagement />} />}
        {hasPermission("products") && <Route path="/catalog/bundles" element={<CatalogBundleManagement />} />}
        {hasPermission("products") && <Route path="/catalog" element={<CatalogManagement />} />}
        {hasPermission("sellers") && (
          <>
            <Route path="/sellers/active" element={<ActiveSellers />} />
            <Route path="/sellers/active/:id" element={<SellerDetail />} />
            <Route path="/sellers/pending" element={<PendingSellers />} />
            <Route path="/subscriptions" element={<SubscriptionManagement />} />
            <Route path="/seller-locations" element={<SellerLocations />} />
          </>
        )}
        
        {hasPermission("support") && (
          <>
            <Route path="/support-tickets" element={<SupportTickets />} />
            <Route path="/moderation" element={<ReviewModeration />} />
          </>
        )}
        
        {hasPermission("marketing") && (
          <>
            <Route path="/experience-studio" element={<ContentManager />} />
            <Route path="/hero-categories" element={<HeroCategoriesPerPage />} />
            <Route path="/notifications" element={<NotificationComposer />} />
            <Route path="/offers" element={<OffersManagement />} />
            <Route path="/offer-sections" element={<OfferSectionsManagement />} />
            <Route path="/shop-by-store" element={<ShopByStoreManagement />} />
            <Route path="/coupons" element={<CouponManagement />} />
            <Route path="/reward-campaigns" element={<RewardCampaigns />} />
            <Route path="/advance-bookings" element={<AdvanceBookingCampaigns />} />
            <Route path="/reward-analytics" element={<RewardAnalytics />} />
          </>
        )}
        
        {hasPermission("delivery") && (
          <>
            <Route path="/delivery-boys/active" element={<ActiveDeliveryBoys />} />
            <Route path="/delivery-boys/pending" element={<PendingDeliveryBoys />} />
            <Route path="/tracking" element={<FleetTracking />} />
            <Route path="/delivery-funds" element={<DeliveryFunds />} />
          </>
        )}
        
        {hasPermission("wallet") && <Route path="/wallet" element={<AdminWallet />} />}
        {hasPermission("withdrawals") && <Route path="/withdrawals" element={<WithdrawalRequests />} />}
        {hasPermission("seller_payments") && <Route path="/seller-transactions" element={<SellerTransactions />} />}
        {hasPermission("bulk_settlements") && <Route path="/bulk-settlements" element={<BulkSettlements />} />}
        {hasPermission("cash_collection") && <Route path="/cash-collection" element={<CashCollection />} />}
        {hasPermission("customers") && (
          <>
            <Route path="/customers" element={<CustomerManagement />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
          </>
        )}
        
        {hasPermission("faqs") && <Route path="/faqs" element={<FAQManagement />} />}
        
        {hasPermission("orders") && (
          <>
            <Route path="/orders/:status" element={<OrdersList />} />
            <Route path="/orders/view/:orderId" element={<OrderDetail />} />
            <Route path="/disputes" element={<DisputeConsolePage />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/refunds" element={<Refunds />} />
          </>
        )}
        
        {hasPermission("billing") && <Route path="/billing" element={<BillingCharges />} />}
        {hasPermission("billing") && <Route path="/city-commissions" element={<CityCommissions />} />}
        {hasPermission("settings") && <Route path="/settings" element={<AdminSettings />} />}
        {hasPermission("system") && <Route path="/env" element={<EnvSettings />} />}
        
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </DashboardLayout>
  );
};

export default AdminRoutes;
