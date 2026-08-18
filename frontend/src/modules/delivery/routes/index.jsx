import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DeliveryLayout from "../layout/DeliveryLayout";

const Splash = React.lazy(() => import("../pages/Splash"));
const DeliveryAuth = React.lazy(() => import("../pages/DeliveryAuth"));
const Dashboard = React.lazy(() => import("../pages/Dashboard"));
const OrderDetails = React.lazy(() => import("../pages/OrderDetails"));
const Navigation = React.lazy(() => import("../pages/Navigation"));
const DeliveryConfirmation = React.lazy(() => import("../pages/DeliveryConfirmation"));
const EarningsPage = React.lazy(() => import("../pages/EarningsPage"));
const CodCash = React.lazy(() => import("../pages/CodCash"));
const OrderHistory = React.lazy(() => import("../pages/OrderHistory"));
const Profile = React.lazy(() => import("../pages/Profile"));
const PersonalDetails = React.lazy(() => import("../pages/profile/PersonalDetails"));
const VehicleInfo = React.lazy(() => import("../pages/profile/VehicleInfo"));
const BankAccount = React.lazy(() => import("../pages/profile/BankAccount"));
const Documents = React.lazy(() => import("../pages/profile/Documents"));
const SafetyPrivacy = React.lazy(() => import("../pages/profile/SafetyPrivacy"));
const Settings = React.lazy(() => import("../pages/profile/Settings"));
const HelpSupport = React.lazy(() => import("../pages/profile/HelpSupport"));
const Withdrawals = React.lazy(() => import("../pages/profile/Withdrawals"));
const Notifications = React.lazy(() => import("../pages/Notifications"));

const DeliveryRoutes = () => {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      }
    >
      <Routes>
        <Route element={<DeliveryLayout />}>
          <Route path="splash" element={<Splash />} />

          <Route path="auth" element={<DeliveryAuth />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="order-details/:orderId" element={<OrderDetails />} />
          <Route path="navigation" element={<Navigation />} />
          <Route path="confirm-delivery/:orderId" element={<DeliveryConfirmation />} />
          <Route path="earnings" element={<EarningsPage />} />
          <Route path="cod-cash" element={<CodCash />} />
          <Route path="history" element={<OrderHistory />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/personal-details" element={<PersonalDetails />} />
          <Route path="profile/vehicle-info" element={<VehicleInfo />} />
          <Route path="profile/bank-account" element={<BankAccount />} />
          <Route path="profile/documents" element={<Documents />} />
          <Route path="profile/safety-privacy" element={<SafetyPrivacy />} />
          <Route path="profile/settings" element={<Settings />} />
          <Route path="profile/help-support" element={<HelpSupport />} />
          <Route path="profile/withdrawals" element={<Withdrawals />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="/" element={<Navigate to="dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

export default DeliveryRoutes;
