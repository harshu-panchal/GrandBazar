import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@core/context/AuthContext';
import { sellerApi } from '@/modules/seller/services/sellerApi';
import { setRoleToken } from '@core/utils/authSession';
import { toast } from 'sonner';

const ACTIVE_STORE_KEY = 'seller_active_store';

const StoreContext = createContext(undefined);

export const StoreProvider = ({ children }) => {
  const { user, role, login, refreshUser } = useAuth();
  const [stores, setStores] = useState([]);
  const [activeStoreId, setActiveStoreId] = useState(
    () => localStorage.getItem(ACTIVE_STORE_KEY) || null,
  );
  const [isSwitching, setIsSwitching] = useState(false);

  const isOwner = Boolean(user && !user?.subSellerId);

  useEffect(() => {
    if (role !== 'seller' || !user) return;

    const profileStores = user.stores || [];
    if (profileStores.length > 0) {
      setStores(profileStores);
    }

    const resolvedId =
      user.activeStoreId ||
      profileStores[0]?._id ||
      null;

    if (!resolvedId) return;

    setActiveStoreId((current) => {
      if (String(resolvedId) === String(current)) {
        return current;
      }
      localStorage.setItem(ACTIVE_STORE_KEY, String(resolvedId));
      return String(resolvedId);
    });
  }, [user, role]);

  const refreshStores = useCallback(async () => {
    try {
      const response = await sellerApi.getStores();
      const list = response.data.results || response.data.result || [];
      if (Array.isArray(list)) {
        setStores(list);
      }
    } catch (error) {
      console.error('Failed to refresh stores:', error);
    }
  }, []);

  useEffect(() => {
    if (role !== 'seller' || !isOwner) return;
    refreshStores();
  }, [role, isOwner, refreshStores]);

  const activeStore = useMemo(
    () => stores.find((s) => String(s._id) === String(activeStoreId)) || null,
    [stores, activeStoreId],
  );

  const hasApprovedStore = useMemo(
    () =>
      stores.some(
        (s) =>
          s.isVerified === true &&
          s.isActive === true &&
          (s.applicationStatus === 'approved' || (!s.applicationStatus && s.isVerified)),
      ),
    [stores],
  );

  const switchStore = useCallback(
    async (storeId) => {
      if (!storeId || String(storeId) === String(activeStoreId)) return;
      setIsSwitching(true);
      try {
        const response = await sellerApi.switchStore(storeId);
        const { token, activeStoreId: newId, store } = response.data.result;

        if (token) {
          setRoleToken('seller', token);
        }
        localStorage.setItem(ACTIVE_STORE_KEY, String(newId || storeId));
        setActiveStoreId(String(newId || storeId));

        if (store) {
          setStores((prev) => {
            const exists = prev.some((s) => String(s._id) === String(store._id));
            if (exists) {
              return prev.map((s) => (String(s._id) === String(store._id) ? store : s));
            }
            return [...prev, store];
          });
        }

        await refreshUser();
        toast.success(`Switched to ${store?.shopName || 'store'}`);
        window.location.reload();
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to switch store');
      } finally {
        setIsSwitching(false);
      }
    },
    [activeStoreId, refreshUser],
  );

  const value = useMemo(
    () => ({
      stores,
      activeStoreId,
      activeStore,
      isOwner,
      hasApprovedStore,
      isSwitching,
      switchStore,
      refreshStores,
      setStores,
    }),
    [stores, activeStoreId, activeStore, isOwner, hasApprovedStore, isSwitching, switchStore, refreshStores],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStoreContext = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStoreContext must be used within a StoreProvider');
  }
  return context;
};

export const useOptionalStoreContext = () => useContext(StoreContext);
