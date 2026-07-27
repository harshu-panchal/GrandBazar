import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Heart, MapPin, Sparkles, Store } from "lucide-react";
import { useFavoriteStores } from "../context/FavoriteStoresContext";
import { cn } from "@/lib/utils";
import { buildStorePath } from "@core/seo/url";

const FavoriteStoresPage = () => {
  const navigate = useNavigate();
  const {
    favoriteStores,
    fetchFullFavoriteStores,
    isFullDataFetched,
    loading,
    toggleFavoriteStore,
  } = useFavoriteStores();

  React.useEffect(() => {
    if (!isFullDataFetched) {
      fetchFullFavoriteStores();
    }
  }, [isFullDataFetched, fetchFullFavoriteStores]);

  if (loading && !isFullDataFetched) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
        >
          <ChevronLeft size={22} className="text-slate-800" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Favorite Sellers
          </h1>
          <p className="text-xs text-slate-500">
            {favoriteStores.length}{" "}
            {favoriteStores.length === 1 ? "store" : "stores"} you follow
          </p>
        </div>
      </div>

      <div className="px-4">
        {favoriteStores.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {favoriteStores.map((store) => {
              const storeId = store.id || store._id;
              const initial = String(store.shopName || store.name || "S")
                .charAt(0)
                .toUpperCase();
              const favorites = Number(store.favoriteCount || 0);
              return (
                <div
                  key={storeId}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex gap-3"
                >
                  <button
                    type="button"
                    onClick={() => navigate(buildStorePath({ ...store, _id: storeId }))}
                    className="flex flex-1 items-center gap-3 text-left min-w-0"
                  >
                    <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 text-white font-black text-xl flex items-center justify-center shrink-0">
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 truncate">
                        {store.shopName || store.name}
                      </h3>
                      <p className="text-xs text-slate-500 truncate">
                        {store.category || "Store"}
                        {store.locality ? ` · ${store.locality}` : ""}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <span className="inline-flex items-center gap-1 text-rose-500">
                          <Heart size={12} className="fill-current" />
                          {favorites} {favorites === 1 ? "favorite" : "favorites"}
                        </span>
                        {favorites >= 5 ? (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <Sparkles size={12} />
                            Popular
                          </span>
                        ) : null}
                        {store.city ? (
                          <span className="inline-flex items-center gap-1 text-slate-400 truncate">
                            <MapPin size={12} />
                            {store.city}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavoriteStore(store)}
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                      "bg-rose-50 text-rose-500 hover:bg-rose-100",
                    )}
                    aria-label="Remove from favorites"
                  >
                    <Heart size={18} className="fill-current" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <div className="h-14 w-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Store size={26} className="text-slate-500" strokeWidth={1.8} />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-1">
              No favorite sellers yet
            </h2>
            <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">
              Tap the heart on a store to follow it. More favorites make a seller more popular.
            </p>
            <Link
              to="/stores"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold"
            >
              Browse stores
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default FavoriteStoresPage;
