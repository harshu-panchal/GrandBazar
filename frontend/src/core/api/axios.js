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
        if (error.response?.status === 401 && !originalRequest._retry) {
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
