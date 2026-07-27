import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axiosInstance from '@core/api/axios';
import { getWithDedupe, invalidateCache } from '@core/api/dedupe';
import { getStoredAuthToken } from '@core/utils/authStorage';
import { setRoleToken, clearRoleToken, syncRoleTokensFromStorage, getRoleToken } from '@core/utils/authSession';

const AuthContext = createContext(undefined);

const ROLE_STORAGE_KEYS = {
    customer: 'auth_customer',
    seller: 'auth_seller',
    admin: 'auth_admin',
    delivery: 'auth_delivery'
};

const LEGACY_TOKEN_KEY = 'token';
const CUSTOMER_PROFILE_SNAPSHOT_KEY = 'auth_customer_profile_snapshot';

function loadCustomerProfileSnapshot() {
    try {
        const raw = sessionStorage.getItem(CUSTOMER_PROFILE_SNAPSHOT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveCustomerProfileSnapshot(profile) {
    if (!profile) return;
    try {
        sessionStorage.setItem(
            CUSTOMER_PROFILE_SNAPSHOT_KEY,
            JSON.stringify({
                _id: profile._id || profile.id,
                name: profile.name || '',
                phone: profile.phone || profile.mobile || '',
                email: profile.email || '',
            }),
        );
    } catch {
        // Ignore storage failures.
    }
}

function clearCustomerProfileSnapshot() {
    sessionStorage.removeItem(CUSTOMER_PROFILE_SNAPSHOT_KEY);
}

function mergeAuthUser(previousUser, profile, { role, token }) {
    if (!profile || typeof profile !== 'object') {
        return previousUser;
    }

    const merged = {
        ...(previousUser || {}),
        ...profile,
        role: profile.role || previousUser?.role || role,
        token: previousUser?.token || token || profile.token,
    };

    if (role === 'customer') {
        saveCustomerProfileSnapshot(merged);
    }

    return merged;
}

function isNotFoundError(error) {
    return Number(error?.response?.status || 0) === 404;
}

export const AuthProvider = ({ children }) => {
    // Current role based on URL
    const getCurrentRoleFromUrl = () => {
        const path = window.location.pathname;
        if (path.startsWith('/seller')) return 'seller';
        if (path.startsWith('/admin')) return 'admin';
        if (path.startsWith('/delivery')) return 'delivery';
        return 'customer';
    };

    const getSafeToken = (key) => getRoleToken(key) || getStoredAuthToken(ROLE_STORAGE_KEYS[key]);

    const [authData, setAuthData] = useState(() => {
        syncRoleTokensFromStorage();
        return {
            customer: getRoleToken('customer') || getStoredAuthToken(ROLE_STORAGE_KEYS.customer),
            seller: getRoleToken('seller') || getStoredAuthToken(ROLE_STORAGE_KEYS.seller),
            admin: getRoleToken('admin') || getStoredAuthToken(ROLE_STORAGE_KEYS.admin),
            delivery: getRoleToken('delivery') || getStoredAuthToken(ROLE_STORAGE_KEYS.delivery),
        };
    });

    const currentRole = getCurrentRoleFromUrl();
    const [user, setUser] = useState(() => {
        const role = getCurrentRoleFromUrl();
        const initialToken = getRoleToken(role) || getStoredAuthToken(ROLE_STORAGE_KEYS[role]);
        if (role === 'customer' && initialToken) {
            return loadCustomerProfileSnapshot();
        }
        return null;
    });
    const [isLoading, setIsLoading] = useState(true);
    const hasLoadedProfileRef = useRef(false);
    const token = authData[currentRole];
    const isAuthenticated = !!token;

    useEffect(() => {
        const syncStoredTokens = () => {
            syncRoleTokensFromStorage();
            setAuthData({
                customer: getSafeToken('customer'),
                seller: getSafeToken('seller'),
                admin: getSafeToken('admin'),
                delivery: getSafeToken('delivery'),
            });
        };

        window.addEventListener('focus', syncStoredTokens);
        window.addEventListener('storage', syncStoredTokens);
        document.addEventListener('visibilitychange', syncStoredTokens);

        return () => {
            window.removeEventListener('focus', syncStoredTokens);
            window.removeEventListener('storage', syncStoredTokens);
            document.removeEventListener('visibilitychange', syncStoredTokens);
        };
    }, []);

    // Register FCM token after login (non-blocking).
    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        let cleanupDeferredRegistration = null;

        // Fire-and-forget; never block auth/profile load.
        setTimeout(() => {
            import('@core/firebase/pushClient')
                .then(async ({
                    ensureFcmTokenRegistered,
                    hasRegisteredFcmToken,
                    startForegroundPushListener,
                    scheduleFcmRegistrationOnUserGesture
                }) => {
                    if (cancelled) return;
                    await startForegroundPushListener();
                    // Always upsert on JWT change so seller store-switch updates PushToken.userId.
                    const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
                    if (permission === 'granted' || hasRegisteredFcmToken(currentRole)) {
                        await ensureFcmTokenRegistered({
                            role: currentRole,
                            platform: 'web'
                        });
                        return;
                    }

                    cleanupDeferredRegistration = scheduleFcmRegistrationOnUserGesture({
                        role: currentRole,
                        platform: 'web',
                        onError: (error) => {
                            console.warn('[push] Deferred registration failed:', error?.message || error);
                        },
                    });
                })
                .catch((error) => {
                    // Permission denied / unsupported / any error: user can retry later from push-enabled actions.
                    console.warn('[push] Auto-registration skipped:', error?.message || error);
                });
        }, 0);

        return () => {
            cancelled = true;
            if (typeof cleanupDeferredRegistration === 'function') {
                cleanupDeferredRegistration();
            }
        };
    }, [token, currentRole]);

    // Fetch user profile on mount or token change
    useEffect(() => {
        const fetchProfile = async () => {
            if (token) {
                try {
                    if (!hasLoadedProfileRef.current) {
                        setIsLoading(true);
                    }
                    const endpoint = `/${currentRole}/profile`;
                    const response = await getWithDedupe(endpoint, {}, { ttl: 5000 });
                    const profile = response.data?.result;
                    setUser((previousUser) => mergeAuthUser(previousUser, profile, {
                        role: currentRole,
                        token,
                    }));
                } catch (error) {
                    if (!isNotFoundError(error)) {
                        console.error('Failed to fetch profile:', error);
                    }
                    setUser((previousUser) => previousUser || (currentRole === 'customer' ? loadCustomerProfileSnapshot() : null));
                } finally {
                    setIsLoading(false);
                    hasLoadedProfileRef.current = true;
                }
            } else {
                setUser(null);
                setIsLoading(false);
                hasLoadedProfileRef.current = false;
            }
        };

        fetchProfile();
    }, [token, currentRole]);

    const login = (userData) => {
        const role = userData.role?.toLowerCase() || 'customer';
        const storageKey = ROLE_STORAGE_KEYS[role];

        if (storageKey && userData.token) {
            setRoleToken(role, userData.token);
            setAuthData(prev => ({ ...prev, [role]: userData.token }));
            setUser((previousUser) => mergeAuthUser(previousUser, userData, {
                role,
                token: userData.token,
            }));
        } else if (userData && Object.keys(userData).length > 0) {
            setUser((previousUser) => mergeAuthUser(previousUser, userData, {
                role: userData.role?.toLowerCase() || currentRole,
                token: previousUser?.token || token,
            }));
        } else {
            console.error('Invalid role or missing token for login:', role);
        }
    };

    const updateUser = (partialUser = {}) => {
        setUser((previousUser) => mergeAuthUser(previousUser, partialUser, {
            role: partialUser.role?.toLowerCase() || previousUser?.role || currentRole,
            token: partialUser.token || previousUser?.token || token,
        }));
    };

    const logout = async () => {
        const storageKey = ROLE_STORAGE_KEYS[currentRole];

        try {
            const { removeStoredFcmToken } = await import('@core/firebase/pushClient');
            await removeStoredFcmToken({ role: currentRole });
        } catch (error) {
            console.warn('Failed to remove push token during logout:', error);
        }

        if (storageKey) {
            clearRoleToken(currentRole);
        }

        // Remove the legacy shared token only when it belongs to the current role session.
        if (token && localStorage.getItem(LEGACY_TOKEN_KEY) === token) {
            localStorage.removeItem(LEGACY_TOKEN_KEY);
        }

        sessionStorage.removeItem(`push:registered:${currentRole}`);
        localStorage.removeItem(`push:fcm-token:${currentRole}`);

        setAuthData((prev) => ({
            ...prev,
            [currentRole]: null,
        }));

        hasLoadedProfileRef.current = false;

        if (currentRole === 'customer') {
            clearCustomerProfileSnapshot();
        }

        // Clear the current user profile from memory
        setUser(null);

        // Final fallback: redirect based on current path if needed
        // (ProtectedRoute usually handles this, but explicit navigation is safer for some UI edge cases)
        const path = window.location.pathname;
        if (path.startsWith('/admin')) window.location.href = '/admin/auth';
        else if (path.startsWith('/seller')) window.location.href = '/seller/auth';
        else if (path.startsWith('/delivery')) window.location.href = '/delivery/auth';
        else window.location.href = '/login';
    };

    const refreshUser = useCallback(async (options = {}) => {
        if (!token) return null;

        try {
            const endpoint = `/${currentRole}/profile`;
            if (options.forceRefresh) {
                invalidateCache(endpoint);
            }
            const response = options.forceRefresh
                ? await axiosInstance.get(endpoint)
                : await getWithDedupe(endpoint, {}, { ttl: 5000 });
            const profile = response.data?.result;
            let mergedProfile = null;
            setUser((previousUser) => {
                mergedProfile = mergeAuthUser(previousUser, profile, {
                    role: currentRole,
                    token,
                });
                return mergedProfile;
            });
            return mergedProfile;
        } catch (error) {
            if (!isNotFoundError(error)) {
                console.error('Failed to refresh profile:', error);
            }
            return null;
        }
    }, [token, currentRole]);

    const value = useMemo(() => ({
        user,
        token,
        role: currentRole,
        isAuthenticated,
        isLoading,
        authData,
        login,
        logout,
        refreshUser,
        updateUser
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [user, token, currentRole, isAuthenticated, isLoading, authData]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
