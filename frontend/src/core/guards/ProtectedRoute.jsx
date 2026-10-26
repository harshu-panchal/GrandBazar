import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';
import Loader from '@shared/components/ui/Loader';

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
        return <Loader fullScreen />;
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
        // Both now live under /seller/stores/:storeId/... — isStoresPage already
        // covers them; kept as their own flags for clarity at the call site below.
        const isChooseModelPage = /\/seller\/stores\/[^/]+\/choose-model/.test(location.pathname);
        const isSubscriptionPage = /\/seller\/stores\/[^/]+\/subscription/.test(location.pathname);
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

            // Business model is chosen PER SHOP now (see MyStores.jsx), not as an
            // account-wide gate before anything else — a seller with zero shops
            // has nothing to choose a model for yet. The old forced redirect to
            // /seller/choose-model is removed; "no approved store yet" below
            // sends them to add one instead, and each shop's own model/subscription
            // status is surfaced from MyStores.jsx itself.

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
