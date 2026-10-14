import React from 'react';
import AdminAuth from './AdminAuth';

// Separate URL (and copy/branding) for staff accounts — Accountant, Operator
// L1-L4, Assistant, any custom AdminRole — created via Staff Management.
// Same form, same backend login endpoint as the owner/superadmin portal
// (AdminAuth.jsx): every Admin document authenticates identically, this is
// just a distinct front door so staff aren't landing on a page branded
// "Login as the platform owner".
const StaffAuth = () => <AdminAuth portal="staff" />;

export default StaffAuth;
