import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';

const isStoreApproved = (store) => {
  if (!store) return false;
  const status = store.applicationStatus || (store.isVerified ? 'approved' : 'pending');
  return store.isVerified === true && store.isActive === true && status === 'approved';
};

const isOwnerAccountApproved = (user) => {
  if (!user || user.subSellerId) return true;
  if (user.isAccountApproved === true) return true;
  if (user.isAccountApproved === false) return false;

  const accountStatus =
    user.accountApplicationStatus ||
    user.applicationStatus ||
    (user.isVerified ? 'approved' : 'pending');

  return user.isVerified === true && accountStatus === 'approved';
};

const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, isLoading, user } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        if (location.pathname.startsWith('/admin')) {
            return <Navigate to="/admin/auth" state={{ from: location }} replace />;
        }
        if (location.pathname.startsWith('/seller')) {
            return <Navigate to="/seller/auth" state={{ from: location }} replace />;
        }
        if (location.pathname.startsWith('/delivery')) {
            return <Navigate to="/delivery/auth" state={{ from: location }} replace />;
        }
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (location.pathname.startsWith('/seller')) {
        const isStoresPage = location.pathname.startsWith('/seller/stores');
        const isChooseModelPage = location.pathname.startsWith('/seller/choose-model');
        const isSubscriptionPage = location.pathname.startsWith('/seller/subscription');
        const isOwner = Boolean(user && !user?.subSellerId);
        const stores = user?.stores || [];

        if (isOwner) {
            const accountStatus =
                user?.accountApplicationStatus ||
                user?.applicationStatus ||
                (user?.isVerified ? 'approved' : 'pending');

            if (!isOwnerAccountApproved(user)) {
                return (
                    <Navigate
                        to="/seller/pending-approval"
                        state={{
                            approvalRequired: true,
                            applicationStatus: accountStatus,
                            rejectionReason: user?.rejectionReason || '',
                        }}
                        replace
                    />
                );
            }

            if (!user?.businessModel && !isChooseModelPage && !isSubscriptionPage) {
                return <Navigate to="/seller/choose-model" replace />;
            }

            if (
                user?.businessModel === 'subscription'
                && !user?.hasActiveSubscription
                && !isSubscriptionPage
                && !isStoresPage
                && !isChooseModelPage
                && location.pathname !== '/seller/profile'
            ) {
                return <Navigate to="/seller/subscription" replace />;
            }

            const hasApprovedStore = stores.some(isStoreApproved);
            if (!hasApprovedStore && !isStoresPage && !isChooseModelPage && !isSubscriptionPage) {
                return <Navigate to="/seller/stores" replace />;
            }
        } else if (user?.subSellerId) {
            const applicationStatus =
                user?.applicationStatus || (user?.isVerified ? 'approved' : 'pending');
            const isApprovedSeller =
                Boolean(user) &&
                user.isVerified === true &&
                user.isActive === true &&
                applicationStatus === 'approved';

            if (!isApprovedSeller) {
                return (
                    <Navigate
                        to="/seller/pending-approval"
                        state={{
                            approvalRequired: true,
                            applicationStatus,
                            rejectionReason: user?.rejectionReason || '',
                        }}
                        replace
                    />
                );
            }
        }
    }

    return <>{children}</>;
};

export default ProtectedRoute;
