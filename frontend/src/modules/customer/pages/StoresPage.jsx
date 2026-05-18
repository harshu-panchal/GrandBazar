import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Store, MapPin, Clock, ArrowRight, Search, 
  Sparkles, Phone, Mail, Compass, Shield, ArrowUpRight, HelpCircle
} from "lucide-react";
import { customerApi } from "../services/customerApi";
import { useLocation as useAppLocation } from "../context/LocationContext";
import Lottie from "lottie-react";

const STORE_THEMES = {
  grocery: {
    gradient: "from-emerald-50 to-teal-50/30",
    border: "border-emerald-100/80 hover:border-emerald-300",
    accent: "text-emerald-700 bg-emerald-50",
    badge: "bg-emerald-600",
    bannerBg: "bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800",
    dot: "bg-emerald-500",
    accentGlow: "shadow-emerald-100"
  },
  electronics: {
    gradient: "from-violet-50 to-indigo-50/30",
    border: "border-violet-100/80 hover:border-violet-300",
    accent: "text-violet-700 bg-violet-50",
    badge: "bg-violet-600",
    bannerBg: "bg-gradient-to-br from-violet-600 via-indigo-700 to-purple-800",
    dot: "bg-violet-500",
    accentGlow: "shadow-violet-100"
  },
  wedding: {
    gradient: "from-rose-50 to-pink-50/30",
    border: "border-rose-100/80 hover:border-rose-300",
    accent: "text-rose-700 bg-rose-50",
    badge: "bg-rose-600",
    bannerBg: "bg-gradient-to-br from-rose-600 via-pink-700 to-rose-800",
    dot: "bg-rose-500",
    accentGlow: "shadow-rose-100"
  },
  default: {
    gradient: "from-slate-50 to-zinc-50/30",
    border: "border-slate-100/80 hover:border-slate-300",
    accent: "text-slate-700 bg-slate-100",
    badge: "bg-slate-800",
    bannerBg: "bg-gradient-to-br from-slate-700 via-zinc-800 to-slate-900",
    dot: "bg-slate-500",
    accentGlow: "shadow-slate-100"
  }
};

const getStoreTheme = (category) => {
  const cat = String(category || "").toLowerCase();
  if (cat.includes("grocery") || cat.includes("fresh") || cat.includes("food") || cat.includes("dairy")) return STORE_THEMES.grocery;
  if (cat.includes("electronic") || cat.includes("phone") || cat.includes("tech")) return STORE_THEMES.electronics;
  if (cat.includes("wed") || cat.includes("gift") || cat.includes("jewel") || cat.includes("rose") || cat.includes("bliss")) return STORE_THEMES.wedding;
  return STORE_THEMES.default;
};

const StoresPage = () => {
  const navigate = useNavigate();
  const { currentLocation, refreshLocation, isFetchingLocation } = useAppLocation();
  const [sellers, setSellers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [expandedSellerId, setExpandedSellerId] = useState(null);
  const [noServiceData, setNoServiceData] = useState(null);

  // Dynamically load Lottie on mount
  useEffect(() => {
    import("@/assets/lottie/animation.json")
      .then((m) => setNoServiceData(m.default))
      .catch(() => {});
  }, []);

  const loadSellers = async () => {
    const hasValidLocation =
      Number.isFinite(currentLocation?.latitude) &&
      Number.isFinite(currentLocation?.longitude);
    
    if (!hasValidLocation) {
      setIsLoading(false);
      setSellers([]);
      return;
    }

    setIsLoading(true);
    try {
      const res = await customerApi.getNearbySellers({
        lat: currentLocation.latitude,
        lng: currentLocation.longitude
      });
      const list = res.data?.results || res.data?.result || res.data || [];
      setSellers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error("Failed to load nearby sellers", e);
      setSellers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSellers();
  }, [currentLocation?.latitude, currentLocation?.longitude]);

  // Unique categories of nearby stores for dynamic filters
  const categoriesList = useMemo(() => {
    const set = new Set();
    sellers.forEach(s => {
      if (s.category && String(s.category).trim()) {
        set.add(String(s.category).trim());
      }
    });
    return ["all", ...Array.from(set)];
  }, [sellers]);

  // Filtered sellers
  const filteredSellers = useMemo(() => {
    return sellers.filter(s => {
      const matchesSearch = 
        String(s.shopName || s.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(s.category || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(s.locality || "").toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTab = activeTab === "all" || s.category === activeTab;
      return matchesSearch && matchesTab;
    });
  }, [sellers, searchQuery, activeTab]);

  const toggleExpand = (e, sellerId) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedSellerId(prev => (prev === sellerId ? null : sellerId));
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-24 pt-[130px] md:pt-[160px]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-[50px]">
        
        {/* Main Hero Header Section */}
        <div className="relative mb-12 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-slate-900 via-zinc-900 to-slate-950 p-8 md:p-12 shadow-2xl text-white">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-400 via-rose-500 to-brand-500 blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl flex flex-col items-start gap-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-bold tracking-wider uppercase text-amber-300">
              <Sparkles size={12} className="animate-pulse" />
              <span>Hyperlocal Shopping</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-[1000] tracking-tighter leading-none">
              Discover Local <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-brand-200 to-pink-300">Artisans & Shops</span>
            </h1>
            <p className="text-slate-300 text-sm md:text-lg font-medium leading-relaxed">
              Explore hand-picked, verified shops in your neighborhood. Directly browse their products, add to your cart, and support local business with super-fast doorstep deliveries.
            </p>
            <div className="flex flex-wrap gap-3 mt-2">
              <div className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold text-slate-200">
                <Shield size={14} className="text-brand-400" />
                <span>100% Verified Sellers</span>
              </div>
              <div className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold text-slate-200">
                <MapPin size={14} className="text-emerald-400" />
                <span className="max-w-[200px] truncate">{currentLocation?.name || "Locating..."}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search Strip */}
        <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Categories Pill Nav */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 md:mx-0 md:px-0">
            {categoriesList.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`px-5 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-300 border-2 whitespace-nowrap active:scale-95 ${
                  activeTab === cat
                    ? "bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-900/10 scale-105"
                    : "bg-white border-slate-100 hover:border-slate-200 text-slate-600"
                }`}
              >
                {cat === "all" ? "🔥 All Shops" : cat}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shop name, category..."
              className="w-full bg-white border-2 border-slate-100 hover:border-slate-200 focus:border-slate-900 pl-11 pr-4 py-3.5 rounded-2xl text-sm font-semibold text-slate-800 transition-all outline-none"
            />
          </div>
        </div>

        {/* Sellers Grid */}
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-4">
            <div className="h-10 w-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">Searching nearby stores...</p>
          </div>
        ) : filteredSellers.length === 0 ? (
          <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 p-8 md:p-16 flex flex-col items-center text-center justify-center max-w-2xl mx-auto shadow-sm">
            <div className="w-64 h-64 mb-6">
              {noServiceData ? (
                <Lottie animationData={noServiceData} loop={true} />
              ) : (
                <div className="w-64 h-64 rounded-full bg-slate-50 animate-pulse" />
              )}
            </div>
            <h3 className="text-2xl md:text-3xl font-[1000] text-slate-800 tracking-tight leading-none mb-3">
              NO SHOPS <span className="text-brand-500">AVAILABLE</span>
            </h3>
            <p className="text-slate-500 font-bold text-sm md:text-base max-w-sm mb-8 leading-relaxed">
              We couldn't find any active sellers within coordinates range of your address. Try updating your delivery location!
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <button 
                onClick={refreshLocation}
                disabled={isFetchingLocation}
                className="flex-1 px-6 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 transition-all active:scale-95"
              >
                {isFetchingLocation ? "Locating..." : "Use Current GPS"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {filteredSellers.map(s => {
              const theme = getStoreTheme(s.category);
              const isExpanded = expandedSellerId === s._id;
              
              // Custom inline banner design
              const initialLetter = String(s.shopName || s.name || "S").charAt(0).toUpperCase();

              return (
                <div
                  key={s._id}
                  onClick={() => navigate(`/store/${s._id}`)}
                  className={`relative flex flex-col rounded-[2rem] border-2 bg-gradient-to-b ${theme.gradient} ${theme.border} transition-all duration-500 hover:-translate-y-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.02)] hover:shadow-xl cursor-pointer group overflow-hidden`}
                >
                  {/* Shop Banner Graphic Card */}
                  <div className={`h-32 w-full relative ${theme.bannerBg} flex items-center justify-center p-6 overflow-hidden`}>
                    <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent scale-150 pointer-events-none" />
                    
                    {/* Glowing Category Badge */}
                    <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/10 text-[9px] font-black uppercase tracking-widest text-white shadow-sm flex items-center gap-1.5">
                      <div className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
                      <span>{s.category || "General Store"}</span>
                    </div>

                    {/* Proximity / Distance Tag */}
                    {s.distance !== undefined && (
                      <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-slate-900/40 backdrop-blur-md border border-white/10 text-[9px] font-black uppercase tracking-widest text-amber-200">
                        📍 {s.distance < 0.1 ? "Very close" : `${s.distance.toFixed(1)} km`}
                      </div>
                    )}

                    {/* Large Background Watermark Initials */}
                    <span className="absolute right-0 bottom-0 text-[10rem] font-black text-white/5 leading-none select-none translate-y-10 translate-x-4">
                      {initialLetter}
                    </span>
                  </div>

                  {/* Shop Profile Icon (Floating overlay) */}
                  <div className="px-6 relative -mt-9 flex items-end justify-between">
                    <div className="h-18 w-18 rounded-[1.25rem] bg-white border-2 border-slate-100 flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform duration-300">
                      <div className={`h-full w-full rounded-2xl flex items-center justify-center font-black text-2xl text-white ${theme.badge}`}>
                        {initialLetter}
                      </div>
                    </div>

                    {/* Quick navigation handle */}
                    <div className="h-10 w-10 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-slate-800 hover:text-white hover:bg-slate-950 transition-all duration-300 group-hover:translate-x-1">
                      <ArrowRight size={16} />
                    </div>
                  </div>

                  {/* Shop Details */}
                  <div className="p-6 flex-1 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2 mt-1">
                      <h3 className="text-xl font-black text-slate-800 tracking-tight leading-tight group-hover:text-slate-900 transition-colors">
                        {s.shopName || s.name}
                      </h3>
                    </div>

                    <p className="text-slate-500 text-xs font-semibold line-clamp-2 leading-relaxed">
                      {s.description || `Fresh collections and quality products directly delivered from ${s.shopName || s.name}.`}
                    </p>

                    {/* Quick Stats Grid */}
                    <div className="mt-4 grid grid-cols-2 gap-3 pt-4 border-t border-slate-100/60">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-slate-100/80 flex items-center justify-center text-slate-500">
                          <Clock size={14} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Time</span>
                          <span className="text-xs font-black text-slate-700">{s.distance < 2 ? "10-15 mins" : "15-25 mins"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-slate-100/80 flex items-center justify-center text-slate-500">
                          <Compass size={14} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Service</span>
                          <span className="text-xs font-black text-slate-700">Within {s.serviceRadius || 5} km</span>
                        </div>
                      </div>
                    </div>

                    {/* Expandable details panel toggler */}
                    <div className="mt-4 pt-3 border-t border-slate-100/60 flex flex-col">
                      <button
                        onClick={(e) => toggleExpand(e, s._id)}
                        className="text-left text-[11px] font-black text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors uppercase tracking-wider py-1"
                      >
                        {isExpanded ? "Hide Store Info ▲" : "View Store Info ▼"}
                      </button>

                      {/* Expandable Details Container */}
                      {isExpanded && (
                        <div 
                          className="mt-3 space-y-2 text-xs text-slate-600 bg-slate-100/30 border border-slate-100/50 p-3 rounded-2xl animate-in slide-in-from-top-4 duration-300"
                          onClick={(e) => e.stopPropagation()} // block navigation
                        >
                          <div className="flex items-start gap-2">
                            <MapPin size={13} className="text-slate-400 mt-0.5 shrink-0" />
                            <span className="font-semibold leading-tight">{s.address || "Address details not available"}</span>
                          </div>
                          {s.locality && (
                            <div className="flex items-center gap-2 pl-5 text-[11px] text-slate-500 font-medium">
                              <span>Locality: {s.locality}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Phone size={13} className="text-slate-400 shrink-0" />
                            <span className="font-bold">{s.phone || "No contact phone"}</span>
                          </div>
                          {s.email && (
                            <div className="flex items-center gap-2">
                              <Mail size={13} className="text-slate-400 shrink-0" />
                              <span className="font-semibold truncate">{s.email}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
};

export default StoresPage;
