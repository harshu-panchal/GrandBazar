import axiosInstance from '@core/api/axios';

export const sellerApi = {
    login: (data) => axiosInstance.post('/seller/login', data),
    signup: (data) => {
        if (data instanceof FormData) {
            return axiosInstance.post('/seller/signup', data);
        }
        return axiosInstance.post('/seller/signup', data);
    },
    sendVerificationOtp: (data) => axiosInstance.post('/seller/verification/send-otp', data),
    verifyVerificationOtp: (data) => axiosInstance.post('/seller/verification/verify-otp', data),
    // Products
    getProducts: (params) => axiosInstance.get('/products/seller/me', { params }),
    getProductById: (id) => axiosInstance.get(`/products/${id}`),
    createProduct: (data) => axiosInstance.post('/products', data),
    updateProduct: (id, data) => axiosInstance.put(`/products/${id}`, data),
    deleteProduct: (id) => axiosInstance.delete(`/products/${id}`),

    // Catalog
    getCatalogProducts: (params) => axiosInstance.get('/catalog', { params }),
    getCatalogProductById: (id) => axiosInstance.get(`/catalog/${id}`),
    claimCatalogProduct: (data) => axiosInstance.post('/catalog/claim', data),
    bulkClaimCatalogProducts: (data) => axiosInstance.post('/catalog/claim-bulk', data),
    getAvailableCatalogBundles: () => axiosInstance.get('/catalog/bundles/available'),
    importCatalogBundles: (data) => axiosInstance.post('/catalog/bundles/import', data),
    getUnpublishedProducts: () => axiosInstance.get('/products/seller/unpublished'),
    publishProductPricing: (id, data) => axiosInstance.patch(`/products/seller/${id}/publish`, data),
    bulkPublishProductPricing: (data) => axiosInstance.patch('/products/seller/publish-bulk', data),

    // Categories (Public)
    getCategories: (params) => axiosInstance.get('/admin/categories', { params }),
    getCategoryTree: () => axiosInstance.get('/admin/categories', { params: { tree: true } }),

    // Stores (multi-shop owner)
    getStores: () => axiosInstance.get('/seller/stores'),
    createStore: (data) => axiosInstance.post('/seller/stores', data),
    resubmitStoreKyc: (storeId, data) =>
        axiosInstance.patch(`/seller/stores/${storeId}/kyc-resubmit`, data),
    switchStore: (storeId) => axiosInstance.post('/seller/stores/switch', { storeId }),
    toggleStoreActive: (storeId) => axiosInstance.patch(`/seller/stores/${storeId}/toggle-active`),

    // Others
    getStats: (range) => axiosInstance.get('/seller/stats', { params: { range } }),
    getOrders: (params) => axiosInstance.get('/orders/seller-orders', { params }),
    updateOrderStatus: (orderId, data) => axiosInstance.put(`/orders/status/${orderId}`, data),
    getEarnings: () => axiosInstance.get('/seller/earnings'),
    getWalletSummary: () => axiosInstance.get('/seller/wallet/summary'),
    getProfile: () => axiosInstance.get('/seller/profile'),
    getDeliverySettings: () => axiosInstance.get('/seller/delivery-settings'),
    updateProfile: (data) => axiosInstance.put('/seller/profile', data),

    // Stock
    adjustStock: (data) => axiosInstance.post('/products/adjust-stock', data),
    getStockHistory: () => axiosInstance.get('/products/stock-history'),

    // Notifications
    getNotifications: () => axiosInstance.get('/notifications'),
    markNotificationRead: (id) => axiosInstance.put(`/notifications/${id}/read`),
    markAllNotificationsRead: () => axiosInstance.put('/notifications/mark-all-read'),

    // Money Requests
    requestWithdrawal: (data) => axiosInstance.post('/seller/request-withdrawal', data),

    // Returns
    getReturns: (params) => axiosInstance.get('/orders/seller-returns', { params }),
    getReturnDetails: (orderId) => axiosInstance.get(`/orders/${orderId}/returns`),
    approveReturn: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/approve`, data),
    rejectReturn: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/reject`, data),
    assignReturnDelivery: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/assign-delivery`, data),

    // Coupons
    getCoupons: () => axiosInstance.get('/seller/coupons'),
    createCoupon: (data) => axiosInstance.post('/seller/coupons', data),
    updateCoupon: (id, data) => axiosInstance.put(`/seller/coupons/${id}`, data),
    deleteCoupon: (id) => axiosInstance.delete(`/seller/coupons/${id}`),

    // Sub-Seller/Staff Management
    getStaffList: () => axiosInstance.get('/seller/staff'),
    getStaffOverview: () => axiosInstance.get('/seller/staff/overview'),
    createStaff: (data) => axiosInstance.post('/seller/staff', data),
    updateStaff: (id, data) => axiosInstance.put(`/seller/staff/${id}`, data),
    deleteStaff: (id) => axiosInstance.delete(`/seller/staff/${id}`),

    // Business model
    getBusinessModel: () => axiosInstance.get('/seller/business-model'),
    chooseBusinessModel: (data) => axiosInstance.post('/seller/business-model/choose', data),
    requestBusinessModelSwitch: (data) => axiosInstance.post('/seller/business-model/request-switch', data),
    previewCommission: (params) => axiosInstance.get('/seller/commission-preview', { params }),

    getSubscriptionPlans: () => axiosInstance.get('/seller/subscription/plans'),
    getSubscriptionStatus: () => axiosInstance.get('/seller/subscription/status'),
    initiateSubscriptionPayment: (data) => axiosInstance.post('/seller/subscription/pay', data),
    verifySubscriptionPayment: (merchantOrderId) =>
        axiosInstance.get('/seller/subscription/payment/verify', { params: { merchantOrderId } }),
    submitSubscriptionPayment: (formData) =>
        axiosInstance.post('/seller/subscription/payment-request', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
};
