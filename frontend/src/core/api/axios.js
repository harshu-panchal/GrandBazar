import axios from 'axios';
import { resolveApiBaseUrl } from './resolveApiBaseUrl';
import { getStoredAuthToken } from '@core/utils/authStorage';
import { getRoleToken } from '@core/utils/authSession';

const ROLE_STORAGE_KEYS = ['auth_seller', 'auth_admin', 'auth_delivery', 'auth_customer'];

const axiosInstance = axios.create({
    baseURL: resolveApiBaseUrl(),
});

function resolveTokenForRequest(pagePath, url) {
    if (pagePath.startsWith('/seller')) {
        return getRoleToken('seller');
    }
    if (pagePath.startsWith('/admin')) {
        return getRoleToken('admin');
    }
    if (pagePath.startsWith('/delivery')) {
        return getRoleToken('delivery');
    }
    if (pagePath.startsWith('/customer')) {
        return getRoleToken('customer');
    }

    if (typeof url === 'string') {
        if (url.startsWith('/seller')) return getRoleToken('seller');
        if (url.startsWith('/admin')) return getRoleToken('admin');
        if (url.startsWith('/delivery')) return getRoleToken('delivery');
        if (
            url.startsWith('/customer') ||
            url.startsWith('/cart') ||
            url.startsWith('/wishlist') ||
            url.startsWith('/categories') ||
            url.startsWith('/products') ||
            url.startsWith('/payments')
        ) {
            return getRoleToken('customer');
        }
    }

    if (
        !pagePath.startsWith('/admin') &&
        !pagePath.startsWith('/seller') &&
        !pagePath.startsWith('/delivery')
    ) {
        return getRoleToken('customer');
    }

    return getStoredAuthToken('token');
}

// Request interceptor for API calls
axiosInstance.interceptors.request.use(
    (config) => {
        let token = null;
        const url = config.url;
        const pagePath = window.location.pathname;
        const isMultipartRequest =
            typeof FormData !== 'undefined' && config.data instanceof FormData;

        if (isMultipartRequest) {
            // Let the browser set the multipart boundary for FormData uploads.
            if (typeof config.headers?.delete === 'function') {
                config.headers.delete('Content-Type');
            } else if (config.headers) {
                delete config.headers['Content-Type'];
            }
        }

        token = resolveTokenForRequest(pagePath, url);

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        const isSellerRequest =
            pagePath.startsWith('/seller') ||
            (typeof url === 'string' && (
                url.startsWith('/seller') ||
                url.startsWith('/orders') ||
                url.startsWith('/notifications') ||
                url.startsWith('/products') ||
                url.startsWith('/catalog')
            ));

        if (isSellerRequest) {
            const activeStoreId = localStorage.getItem('seller_active_store');
            if (activeStoreId) {
                config.headers['X-Active-Store-Id'] = activeStoreId;
            }
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for API calls
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // The backend's verifyToken middleware returns 403 with this message when a
        // customer has been deactivated (blocked/suspended) by an admin. The JWT itself
        // is still technically valid, so without handling it here the customer stays
        // logged in indefinitely despite every authenticated request failing.
        const status = error.response?.status;
        const message = error.response?.data?.message || error.response?.data?.error || '';
        const isSuspendedAccount =
            status === 403 &&
            typeof message === 'string' &&
            message.toLowerCase().includes('suspended or restricted');

        if (isSuspendedAccount && !originalRequest._blockedSessionCleared) {
            originalRequest._blockedSessionCleared = true;
            try {
                const { clearRoleToken } = await import('@core/utils/authSession');
                const pagePath = window.location.pathname;
                const role = pagePath.startsWith('/seller')
                    ? 'seller'
                    : pagePath.startsWith('/admin')
                        ? 'admin'
                        : pagePath.startsWith('/delivery')
                            ? 'delivery'
                            : 'customer';
                // Only force a logout when the suspended account matches the role whose
                // request failed — never clear unrelated role sessions.
                const failedToken = resolveTokenForRequest(pagePath, originalRequest?.url || '');
                const roleToken = localStorage.getItem(`auth_${role}`);
                if (failedToken && failedToken === roleToken) {
                    clearRoleToken(role);
                    sessionStorage.removeItem(`push:registered:${role}`);
                    sessionStorage.removeItem('auth_customer_profile_snapshot');
                    if (!window.location.pathname.startsWith('/login')) {
                        window.location.href = '/login';
                    }
                }
            } catch (cleanupError) {
                console.error('[axios] Failed to clear suspended-account session:', cleanupError);
            }
        }

        if (status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            const hasStoredRoleToken = ROLE_STORAGE_KEYS.some((key) => localStorage.getItem(key));
            if (hasStoredRoleToken) {
                console.warn(
                    '[axios] Received 401 response. Preserving stored auth tokens; session data is only cleared by explicit logout.',
                    {
                        url: originalRequest?.url,
                        method: originalRequest?.method,
                    }
                );
            }
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;
