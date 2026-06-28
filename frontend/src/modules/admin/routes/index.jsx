import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "@shared/layout/DashboardLayout";
import { useSupportUnread } from "@core/context/SupportUnreadContext";
import { useAuth } from "@core/context/AuthContext";
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
const CategoryManagement = React.lazy(
  () => import("../pages/CategoryManagement"),
);
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
const Returns = React.lazy(() => import("../pages/Returns"));
const SellerDetail = React.lazy(() => import("../pages/SellerDetail"));
const SubscriptionManagement = React.lazy(() => import("../pages/SubscriptionManagement"));
const SupportTickets = React.lazy(() => import("../pages/SupportTickets"));
const ReviewModeration = React.lazy(() => import("../pages/ReviewModeration"));
const FleetTracking = React.lazy(() => import("../pages/FleetTracking"));
const CouponManagement = React.lazy(() => import("../pages/CouponManagement"));
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
      { label: "All Categories", path: "/admin/categories/hierarchy" },
      { label: "Header Categories", path: "/admin/categories/header" },
      { label: "Main Categories", path: "/admin/categories/level2" },
      { label: "Sub-Categories", path: "/admin/categories/sub" },
    ],
  },
  { 
    label: "Products", 
    path: "/admin/products", 
    icon: Box, 
    color: "amber",
    permission: "products",
  },
  {
    label: "Master Catalog", 
    path: "/admin/catalog", 
    icon: Library, 
    color: "violet",
    permission: "products",
  },
  {
    label: "Catalog Bundles",
    path: "/admin/catalog/bundles",
    icon: Library,
    color: "violet",
    permission: "products",
  },
  {
    label: "Marketing Tools",
    icon: Sparkles,
    color: "amber",
    permission: "marketing",
    children: [
      { label: "Create Sections", path: "/admin/experience-studio" },
      { label: "Hero & categories per page", path: "/admin/hero-categories" },
      { label: "Send Notifications", path: "/admin/notifications" },
      { label: "Coupons & Promos", path: "/admin/coupons" },
      { label: "Offer Sections", path: "/admin/offer-sections" },
      { label: "Shop by Store", path: "/admin/shop-by-store" },
    ],
  },
  {
    label: "Customer Support",
    icon: Receipt,
    color: "emerald",
    permission: "support",
    children: [
      { label: "Help Tickets", path: "/admin/support-tickets" },
      { label: "Review Content", path: "/admin/moderation" },
    ],
  },
  {
    label: "Sellers",
    icon: Building2,
    color: "blue",
    permission: "sellers",
    children: [
      { label: "Active Sellers", path: "/admin/sellers/active" },
      { label: "Waiting for Review", path: "/admin/sellers/pending" },
      { label: "Subscriptions", path: "/admin/subscriptions" },
      { label: "Seller Locations", path: "/admin/seller-locations" },
    ],
  },
  {
    label: "Delivery Drivers",
    icon: Truck,
    color: "emerald",
    permission: "delivery",
    children: [
      { label: "Active Drivers", path: "/admin/delivery-boys/active" },
      { label: "Waiting for Review", path: "/admin/delivery-boys/pending" },
      { label: "Track Drivers", path: "/admin/tracking" },
      { label: "Send Money", path: "/admin/delivery-funds" },
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
      { label: "All Orders", path: "/admin/orders/all" },
      { label: "New Orders", path: "/admin/orders/pending" },
      { label: "Being Prepared", path: "/admin/orders/processed" },
      { label: "On the Way", path: "/admin/orders/out-for-delivery" },
      { label: "Delivered", path: "/admin/orders/delivered" },
      { label: "Cancelled", path: "/admin/orders/cancelled" },
      { label: "Returned", path: "/admin/orders/returned" },
      { label: "Return Requests", path: "/admin/returns" },
    ],
  },
  {
    label: "Fees & Charges",
    path: "/admin/billing",
    icon: RotateCcw,
    color: "red",
    permission: "billing",
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

const AdminRoutes = () => {
  const { totalUnread } = useSupportUnread();
  const { user } = useAuth();

  const isSuperAdminOrAdmin = React.useMemo(() => {
    const r = user?.role;
    return r === "superadmin" || r === "admin" || !r;
  }, [user]);

  const hasPermission = React.useCallback((permissionKey) => {
    if (isSuperAdminOrAdmin) return true;
    return user?.allowedPermissions?.includes(permissionKey);
  }, [isSuperAdminOrAdmin, user]);

  const navItemsWithBadges = React.useMemo(() => {
    const filteredItems = navItems.filter((item) => {
      if (item.label === "My Profile") return true;
      if (item.permission === "staff") return isSuperAdminOrAdmin;
      if (isSuperAdminOrAdmin) return true;
      return user?.allowedPermissions?.includes(item.permission);
    });

    const count = Number.isFinite(totalUnread) ? totalUnread : 0;
    if (count <= 0) return filteredItems;
    return filteredItems.map((item) => {
      if (item?.label !== "Customer Support") return item;
      return { ...item, badgeCount: count };
    });
  }, [totalUnread, user, isSuperAdminOrAdmin]);

  return (
    <DashboardLayout navItems={navItemsWithBadges} title="Admin Center">
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
            <Route path="/returns" element={<Returns />} />
          </>
        )}
        
        {hasPermission("billing") && <Route path="/billing" element={<BillingCharges />} />}
        {hasPermission("settings") && <Route path="/settings" element={<AdminSettings />} />}
        {hasPermission("system") && <Route path="/env" element={<EnvSettings />} />}
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DashboardLayout>
  );
};

export default AdminRoutes;
