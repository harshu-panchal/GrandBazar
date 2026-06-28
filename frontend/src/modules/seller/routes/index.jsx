import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "@shared/layout/DashboardLayout";
import Orders from "../pages/Orders";
import { useAuth } from "@core/context/AuthContext";
import {
  HiOutlineSquares2X2,
  HiOutlineCube,
  HiOutlineCurrencyDollar,
  HiOutlineUser,
  HiOutlineTruck,
  HiOutlineArchiveBox,
  HiOutlineChartBarSquare,
  HiOutlineCreditCard,
  HiOutlineMapPin,
  HiOutlinePhoto,
  HiOutlineTag,
  HiOutlineUserGroup,
  HiOutlineInboxStack,
} from "react-icons/hi2";

const Dashboard = React.lazy(() => import("../pages/Dashboard"));
const ProductManagement = React.lazy(
  () => import("../pages/ProductManagement"),
);
const BrowseCatalog = React.lazy(() => import("../pages/BrowseCatalog"));
const StockManagement = React.lazy(() => import("../pages/StockManagement"));
const AddProduct = React.lazy(() => import("../pages/AddProduct"));
const Returns = React.lazy(() => import("../pages/Returns"));
const Earnings = React.lazy(() => import("../pages/Earnings"));
const Analytics = React.lazy(() => import("../pages/Analytics"));
const Transactions = React.lazy(() => import("../pages/Transactions"));
const DeliveryTracking = React.lazy(() => import("../pages/DeliveryTracking"));
const Profile = React.lazy(() => import("../pages/Profile"));
const Withdrawals = React.lazy(() => import("../pages/Withdrawals"));
const Storefront = React.lazy(() => import("../pages/Storefront"));
const SellerCoupons = React.lazy(() => import("../pages/SellerCoupons"));
const StaffManagement = React.lazy(() => import("../pages/StaffManagement"));

const navItems = [
  { label: "Dashboard", path: "/seller", icon: HiOutlineSquares2X2, end: true },
  { label: "Store Design", path: "/seller/storefront", icon: HiOutlinePhoto, permission: "storefront" },
  { label: "Products", path: "/seller/products", icon: HiOutlineCube, permission: "products", end: true },
  { label: "Browse Catalog", path: "/seller/products/catalog", icon: HiOutlineInboxStack, permission: "products" },
  { label: "Stock", path: "/seller/inventory", icon: HiOutlineArchiveBox, permission: "inventory" },
  { label: "Orders", path: "/seller/orders", icon: HiOutlineTruck, permission: "orders" },
  { label: "Returns", path: "/seller/returns", icon: HiOutlineArchiveBox, permission: "returns" },
  { label: "Track Orders", path: "/seller/tracking", icon: HiOutlineMapPin, permission: "tracking" },
  { label: "Offers & Coupons", path: "/seller/coupons", icon: HiOutlineTag, permission: "coupons" },
  {
    label: "Sales Reports",
    path: "/seller/analytics",
    icon: HiOutlineChartBarSquare,
    permission: "analytics",
  },
  {
    label: "Money Request",
    path: "/seller/withdrawals",
    icon: HiOutlineCurrencyDollar,
    permission: "withdrawals",
  },
  {
    label: "Payment History",
    path: "/seller/transactions",
    icon: HiOutlineCreditCard,
    permission: "withdrawals",
  },
  {
    label: "Earnings",
    path: "/seller/earnings",
    icon: HiOutlineCurrencyDollar,
    permission: "withdrawals",
  },
  {
    label: "Staff Management",
    path: "/seller/staff",
    icon: HiOutlineUserGroup,
    permission: "staff",
  },
  { label: "Profile", path: "/seller/profile", icon: HiOutlineUser },
];

const SellerRoutes = () => {
  const { user } = useAuth();

  const isOwner = React.useMemo(() => {
    return user?.role === 'seller' && !user?.subSellerId;
  }, [user]);

  const hasPermission = React.useCallback((permissionKey) => {
    if (isOwner) return true;
    return user?.allowedPermissions?.includes(permissionKey);
  }, [isOwner, user]);

  const filteredNavItems = React.useMemo(() => {
    return navItems.filter((item) => {
      if (item.path === "/seller" || item.path === "/seller/profile") return true;
      if (item.permission === "staff") return isOwner;
      if (isOwner) return true;
      return user?.allowedPermissions?.includes(item.permission);
    });
  }, [user, isOwner]);

  return (
    <DashboardLayout navItems={filteredNavItems} title="Seller Panel">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        {hasPermission("storefront") && <Route path="/storefront" element={<Storefront />} />}
        {hasPermission("products") && (
          <>
            <Route path="/products" element={<ProductManagement />} />
            <Route path="/products/catalog" element={<BrowseCatalog />} />
            <Route path="/products/add" element={<AddProduct />} />
          </>
        )}
        {hasPermission("inventory") && <Route path="/inventory" element={<StockManagement />} />}
        {hasPermission("orders") && <Route path="/orders" element={<Orders />} />}
        {hasPermission("returns") && <Route path="/returns" element={<Returns />} />}
        {hasPermission("tracking") && <Route path="/tracking" element={<DeliveryTracking />} />}
        {hasPermission("coupons") && <Route path="/coupons" element={<SellerCoupons />} />}
        {hasPermission("analytics") && <Route path="/analytics" element={<Analytics />} />}
        {hasPermission("withdrawals") && (
          <>
            <Route path="/withdrawals" element={<Withdrawals />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/earnings" element={<Earnings />} />
          </>
        )}
        <Route path="/profile" element={<Profile />} />
        {isOwner && <Route path="/staff" element={<StaffManagement />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DashboardLayout>
  );
};

export default SellerRoutes;
