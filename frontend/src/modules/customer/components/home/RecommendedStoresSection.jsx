import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Star, Sparkles } from "lucide-react";
import { buildStorePath } from "@core/seo/url";

const RecommendedStoresSection = ({ stores }) => {
  const navigate = useNavigate();
  if (!stores || stores.length === 0) return null;

  return (
    <div className="container mx-auto px-4 md:px-8 lg:px-[50px] py-6 md:py-10">
      <div className="flex justify-between items-center mb-5 md:mb-8 px-1">
        <div className="flex flex-col">
          <h3 className="text-base md:text-xl font-black text-[#1A1A1A] tracking-tight uppercase leading-none flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            Recommended for you
          </h3>
        </div>
        <button
          onClick={() => navigate("/stores")}
          className="flex items-center gap-1 bg-slate-50 px-2.5 py-1 md:px-4 md:py-2 rounded-full text-primary font-bold text-[11px] md:text-sm cursor-pointer border border-slate-100 transition-all whitespace-nowrap active:scale-95"
        >
          See all
          <ChevronRight size={12} className="ml-0.5" strokeWidth={3} />
        </button>
      </div>

      <div className="flex overflow-x-auto gap-3 md:gap-5 pb-2 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scroll-smooth">
        {stores.slice(0, 10).map((store) => {
          const initialLetter = String(store.shopName || "S").charAt(0).toUpperCase();
          const bannerUrl = (Array.isArray(store.banners) && store.banners.length > 0 && store.banners[0]) || store.bannerImage || store.banner || "";
          const logoUrl = store.logoUrl || store.logo || store.shopLogo || store.avatarImage || store.avatar || "";

          return (
            <div
              key={store._id}
              onClick={() => navigate(buildStorePath(store))}
              className="w-[160px] md:w-[190px] shrink-0 snap-start rounded-2xl border border-slate-100 bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)] cursor-pointer active:scale-95 transition-transform overflow-hidden group"
            >
              <div className="h-16 w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative overflow-hidden">
                {bannerUrl ? (
                  <img
                    src={bannerUrl}
                    alt={store.shopName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={store.shopName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-2xl font-black text-primary/70">{initialLetter}</span>
                )}
                {Number(store.avgRating || 0) > 0 && (
                  <div className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/90 backdrop-blur-md text-[10px] font-black text-amber-600 shadow-sm z-10">
                    <Star size={9} className="fill-amber-500 text-amber-500" />
                    {Number(store.avgRating).toFixed(1)}
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="text-xs font-bold text-slate-900 truncate">{store.shopName}</p>
                <p className="text-[10px] font-semibold text-slate-400 truncate mt-0.5">{store.category || "General Store"}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(RecommendedStoresSection);
