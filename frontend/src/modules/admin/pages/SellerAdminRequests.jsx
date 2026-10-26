import React from 'react';
import PendingSellers from './PendingSellers';

// Owner-account registrations only — a brand new seller signing up for an
// admin account, as opposed to an approved seller applying to open another
// shop. Both kinds still appear together on Seller Applications; this screen
// exists so new sellers waiting on approval are not buried among shop
// requests. The review/approve/reject flow is PendingSellers' own.
const SellerAdminRequests = () => (
    <PendingSellers
        applicationType="seller_admin"
        title="Seller Admin Requests"
        description="New sellers waiting for their admin account to be approved. Once approved they can sign in and add their first shop."
        rejectedDescription="Seller admin accounts you rejected or deactivated. Reactivate one to restore its dashboard access."
    />
);

export default SellerAdminRequests;
