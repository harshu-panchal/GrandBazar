import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { customerApi } from "../services/customerApi";
import { useAuth } from "../../../core/context/AuthContext";

// Survive Vite HMR: re-evaluating this module must not create a new context
// identity, or consumers throw against the still-mounted Provider's old one.
const FavoriteStoresContext =
  globalThis.__zintoFavoriteStoresContext ??
  (globalThis.__zintoFavoriteStoresContext = createContext());

export const useFavoriteStores = () => useContext(FavoriteStoresContext);

const STORAGE_KEY = "favorite_stores";

export const FavoriteStoresProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [favoriteStores, setFavoriteStores] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [isFullDataFetched, setIsFullDataFetched] = useState(false);

  const fetchFavoriteIds = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const response = await customerApi.getFavoriteStores({ idsOnly: true });
      const stores = response.data?.result?.stores || [];
      setFavoriteStores(
        stores.map((id) => ({
          id: String(id),
          _id: String(id),
        })),
      );
      setIsFullDataFetched(false);
    } catch (error) {
      console.error("Failed to fetch favorite stores", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFullFavoriteStores = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const response = await customerApi.getFavoriteStores({ idsOnly: false });
      const stores = response.data?.result?.stores || [];
      setFavoriteStores(
        stores.map((store) => ({
          ...store,
          id: store._id,
          name: store.shopName || store.name,
        })),
      );
      setIsFullDataFetched(true);
    } catch (error) {
      console.error("Failed to fetch favorite stores", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchFavoriteIds();
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        setFavoriteStores(saved ? JSON.parse(saved) : []);
        setIsFullDataFetched(true);
      } catch {
        setFavoriteStores([]);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favoriteStores));
    }
  }, [favoriteStores, isAuthenticated]);

  const isFavoriteStore = (storeId) => {
    const id = String(storeId || "");
    return favoriteStores.some((store) => String(store.id || store._id) === id);
  };

  const toggleFavoriteStore = async (store) => {
    const storeId = String(store?.id || store?._id || "");
    if (!storeId) return null;

    if (isAuthenticated) {
      const response = await customerApi.toggleFavoriteStore({ storeId });
      const result = response.data?.result || {};
      const isFavorite = result.isFavorite === true;
      const stores = Array.isArray(result.stores) ? result.stores : [];

      // Always sync local heart state from server toggle result (like + unlike).
      if (stores.length > 0 && typeof stores[0] === "object" && stores[0]?._id) {
        setFavoriteStores(
          stores.map((item) => ({
            ...item,
            id: String(item._id),
            _id: String(item._id),
            name: item.shopName || item.name,
          })),
        );
        setIsFullDataFetched(true);
      } else if (isFavorite) {
        setFavoriteStores((prev) => {
          if (prev.some((item) => String(item.id || item._id) === storeId)) {
            return prev;
          }
          return [
            ...prev,
            {
              ...store,
              id: storeId,
              _id: storeId,
              name: store.shopName || store.name,
            },
          ];
        });
      } else {
        // Unlike: drop this store from local favorites immediately
        setFavoriteStores((prev) =>
          prev.filter((item) => String(item.id || item._id) !== storeId),
        );
      }

      return {
        ...result,
        isFavorite,
        storeId,
        favoriteCount: Number(result.favoriteCount || 0),
      };
    }

    if (isFavoriteStore(storeId)) {
      setFavoriteStores((prev) =>
        prev.filter((item) => String(item.id || item._id) !== storeId),
      );
      return { isFavorite: false, storeId, favoriteCount: 0 };
    }

    setFavoriteStores((prev) => [
      ...prev,
      {
        ...store,
        id: storeId,
        _id: storeId,
        name: store.shopName || store.name,
      },
    ]);
    return { isFavorite: true, storeId, favoriteCount: 0 };
  };

  const value = useMemo(
    () => ({
      favoriteStores,
      toggleFavoriteStore,
      isFavoriteStore,
      fetchFullFavoriteStores,
      isFullDataFetched,
      count: favoriteStores.length,
      loading,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [favoriteStores, isFullDataFetched, loading],
  );

  return (
    <FavoriteStoresContext.Provider value={value}>
      {children}
    </FavoriteStoresContext.Provider>
  );
};
