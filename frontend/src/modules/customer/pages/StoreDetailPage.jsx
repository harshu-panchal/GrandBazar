import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ChevronLeft, MapPin, Clock, Search, Phone, 
  Mail, Shield, Sparkles, Compass, AlertCircle, Star
} from "lucide-react";
import { customerApi } from "../services/customerApi";
import { useLocation as useAppLocation } from "../context/LocationContext";
import ProductCard from "../components/shared/ProductCard";
import ProductDetailSheet from "../components/shared/ProductDetailSheet";
import MiniCart from "../components/shared/MiniCart";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const STORE_THEMES = {
  grocery: {
    accent: "text-emerald-700 bg-emerald-50",
    badge: "bg-emerald-600",
    bannerBg: "bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800",
    borderActive: "border-emerald-600 text-emerald-600 bg-emerald-50/50",
    accentText: "text-emerald-600"
  },
  electronics: {
    accent: "text-violet-700 bg-violet-50",
    badge: "bg-violet-600",
    bannerBg: "bg-gradient-to-br from-violet-600 via-indigo-700 to-purple-800",
    borderActive: "border-violet-600 text-violet-600 bg-violet-50/50",
    accentText: "text-violet-600"
  },
  wedding: {
    accent: "text-rose-700 bg-rose-50",
    badge: "bg-rose-600",
    bannerBg: "bg-gradient-to-br from-rose-600 via-pink-700 to-rose-800",
    borderActive: "border-rose-600 text-rose-600 bg-rose-50/50",
    accentText: "text-rose-600"
  },
  default: {
    accent: "text-amber-700 bg-amber-50",
    badge: "bg-amber-500",
    bannerBg: "bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400",
    borderActive: "border-amber-500 text-amber-600 bg-amber-50/50",
    accentText: "text-amber-600"
  }
};

const getStoreTheme = (category) => {
  const cat = String(category || "").toLowerCase();
  if (cat.includes("grocery") || cat.includes("fresh") || cat.includes("food") || cat.includes("dairy")) return STORE_THEMES.grocery;
  if (cat.includes("electronic") || cat.includes("phone") || cat.includes("tech")) return STORE_THEMES.electronics;
  if (cat.includes("wed") || cat.includes("gift") || cat.includes("jewel") || cat.includes("rose") || cat.includes("bliss")) return STORE_THEMES.wedding;
  return STORE_THEMES.default;
};

const getEmbedUrl = (url) => {
  if (!url) return "";
  
  // Handle YouTube Shorts
  const shortsMatch = url.match(/\/shorts\/([^&?#]+)/);
  if (shortsMatch && shortsMatch[1]) {
    return `https://www.youtube.com/embed/${shortsMatch[1]}`;
  }

  // Handle standard YouTube links
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match && match[1] ? `https://www.youtube.com/embed/${match[1]}` : url;
};

const StoreDetailPage = () => {
  const { sellerId } = useParams();
  const navigate = useNavigate();
  const { currentLocation } = useAppLocation();
  
  const [seller, setSeller] = useState(null);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  const theme = useMemo(() => getStoreTheme(seller?.category), [seller?.category]);

  useEffect(() => {
    if (!seller?.banners || seller.banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % seller.banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [seller?.banners]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const hasValidLocation =
        Number.isFinite(currentLocation?.latitude) &&
        Number.isFinite(currentLocation?.longitude);

      // 1. Fetch public profile and products in parallel
      const [profileRes, productsRes] = await Promise.all([
        customerApi.getSellerPublicProfile(sellerId),
        hasValidLocation
          ? customerApi.getProducts({
              sellerId,
              lat: currentLocation.latitude,
              lng: currentLocation.longitude
            })
          : Promise.resolve({ data: { success: true, result: { items: [] } } })
      ]);

      if (profileRes.data?.success) {
        setSeller(profileRes.data.results || profileRes.data.result || profileRes.data.data);
      }

      if (productsRes.data?.success) {
        const rawResult = productsRes.data.result;
        const dbProds = Array.isArray(productsRes.data.results)
          ? productsRes.data.results
          : Array.isArray(rawResult?.items)
          ? rawResult.items
          : Array.isArray(rawResult)
          ? rawResult
          : [];

        const formattedProds = dbProds.map(p => ({
          ...p,
          id: p._id,
          image: p.mainImage || p.image || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400",
          price: p.salePrice || p.price,
          originalPrice: p.price,
          weight: p.weight || "1 unit",
          deliveryTime: "10-15 mins"
        }));

        setProducts(formattedProds);
      }
    } catch (e) {
      console.error("Failed to load storefront detail data", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (sellerId) {
      fetchData();
    }
  }, [sellerId, currentLocation?.latitude, currentLocation?.longitude]);

  // Dynamically compile categories matching active products
  const dynamicCategories = useMemo(() => {
    const catMap = {};
    products.forEach(p => {
      const catId = p.categoryId?._id || p.categoryId || "general";
      const catName = p.categoryId?.name || "General";
      if (!catMap[catId]) {
        catMap[catId] = {
          id: catId,
          name: catName,
          count: 0
        };
      }
      catMap[catId].count += 1;
    });

    return [
      { id: "all", name: "All Items", count: products.length },
      ...Object.values(catMap)
    ];
  }, [products]);

  // Filtered and Searched products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        String(p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(p.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      
      const catId = p.categoryId?._id || p.categoryId || "general";
      const matchesCategory = selectedCategory === "all" || catId === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [products, selectedCategory, searchQuery]);

  const initialLetter = String(seller?.shopName || seller?.name || "S").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 pb-24 pt-[24px] md:pt-[40px]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-[50px]">
        
        {/* Navigation Back Header */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate("/stores")}
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ChevronLeft size={16} strokeWidth={3} />
            <span>Back to Stores</span>
          </button>
          
          {seller?.phone && (
            <a
              href={`tel:${seller.phone}`}
              className="h-10 px-4 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm gap-2"
            >
              <Phone size={14} className="text-emerald-500 fill-current" />
              <span>Call Shop</span>
            </a>
          )}
        </div>

        {/* Loading Spinner */}
        {isLoading ? (
          <div className="py-32 flex flex-col items-center justify-center gap-4">
            <div className="h-10 w-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">Entering Shop...</p>
          </div>
        ) : !seller ? (
          <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 p-12 text-center flex flex-col items-center max-w-md mx-auto shadow-sm">
            <AlertCircle size={48} className="text-red-500 mb-4 animate-bounce" />
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-wider mb-2">Shop Not Found</h3>
            <p className="text-slate-500 text-xs font-bold max-w-[280px] mb-6">
              The requested store profile either doesn't exist, is inactive, or has been temporarily de-listed.
            </p>
            <button
              onClick={() => navigate("/stores")}
              className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all"
            >
              Go to Directory
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            
            {/* Store Branding Banner */}
            <div className="relative overflow-hidden rounded-[2.5rem] bg-white/70 border border-white/90 backdrop-blur-md p-6 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.03)] text-slate-800">
              
              {/* Ultra-Premium Floating Welcome Banner */}
              <div className="mb-6 -mx-6 md:-mx-8 -mt-6 md:-mt-8 px-6 md:px-8 py-4 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-transparent border-b border-slate-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none relative overflow-hidden group hover:from-amber-500/15 hover:via-rose-500/15 hover:to-violet-500/15 transition-all duration-500">
                {/* Glowing shimmer stroke line */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                
                <div className="flex items-center gap-3.5 z-10">
                  <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-white shadow-[0_4px_15px_rgba(244,63,94,0.25)] group-hover:scale-110 transition-transform duration-300">
                    <Sparkles size={16} className="animate-pulse" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-slate-800 leading-none">
                        Welcome to our store
                      </span>
                      <span className="inline-block animate-bounce text-xs leading-none select-none">👋</span>
                      <span className="text-[9px] font-black uppercase tracking-widest bg-gradient-to-r from-amber-600 to-rose-600 bg-clip-text text-transparent px-2 py-0.5 rounded-md bg-amber-50/50 border border-amber-100/40 shadow-[0_2px_8px_rgba(245,158,11,0.05)]">
                        {seller.shopName || seller.name}
                      </span>
                    </div>
                    <span className="text-[9px] md:text-[10px] font-bold text-slate-500 mt-1 flex items-center gap-1">
                      <span>✨</span>
                      <span>Discover handpicked premium selections curated fresh for you daily.</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 z-10 sm:self-center bg-white/60 border border-white/80 px-3.5 py-1.5 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.01)] hover:scale-105 transition-transform duration-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.7)]" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                    Open & Ready to Serve
                  </span>
                </div>
              </div>

              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-200 via-rose-200 to-violet-200 blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                
                {/* Logo & Info Group */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                  {/* Circular Avatar */}
                  <div className={cn(
                    "h-16 w-16 md:h-20 md:w-20 rounded-2xl flex items-center justify-center shrink-0 shadow-lg text-white font-black text-2xl md:text-3xl",
                    theme.badge === "bg-amber-500" ? "bg-gradient-to-br from-amber-400 to-rose-400" : theme.badge
                  )}>
                    <span className="leading-none">
                      {initialLetter}
                    </span>
                  </div>
                  
                  {/* Shop Text */}
                  <div className="flex flex-col gap-1.5 leading-none">
                    <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest w-fit border border-slate-100/50 shadow-sm", theme.accent)}>
                      <Sparkles size={10} className="animate-pulse" />
                      <span>{seller.category || "Verified Shop"}</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-[1000] tracking-tight text-slate-900 mt-1">
                      {seller.shopName || seller.name}
                    </h1>
                    <p className="text-slate-500 text-[11px] md:text-xs font-semibold max-w-xl leading-relaxed mt-1.5">
                      {seller.description || `Browse clean and premium inventory directly stocked and delivered from ${seller.shopName || seller.name}.`}
                    </p>
                  </div>
                </div>

                {/* Logistics Stats overlay */}
                <div className="flex flex-wrap gap-4 shrink-0 bg-slate-50/80 border border-slate-100/80 p-4 rounded-[1.5rem] shadow-sm backdrop-blur-sm">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Delivery in</span>
                    <span className={cn("text-base font-black", theme.accentText)}>10-15 Mins</span>
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Radius Limit</span>
                    <span className={cn("text-base font-black", theme.accentText)}>{seller.serviceRadius || 5} km</span>
                  </div>
                  {seller.locality && (
                    <>
                      <div className="h-8 w-px bg-slate-200" />
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Locality</span>
                        <span className="text-base font-black text-slate-700 truncate max-w-[120px]">{seller.locality}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Store Video Section */}
            {seller.storeVideo && (
              <div className="w-full bg-slate-900 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-xl relative overflow-hidden mt-2">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 px-2 md:px-4 mt-1">
                    <Sparkles size={18} className="text-brand-400 animate-pulse" />
                    <h3 className="text-lg md:text-xl font-[900] text-white uppercase tracking-widest">Store Spotlight</h3>
                  </div>
                  <div className="w-full max-w-2xl mx-auto aspect-video rounded-xl md:rounded-2xl overflow-hidden bg-black relative border-4 border-slate-800 shadow-2xl">
                    {seller.storeVideo.includes("youtube.com") || seller.storeVideo.includes("youtu.be") ? (
                      <iframe
                        className="w-full h-full absolute inset-0"
                        src={getEmbedUrl(seller.storeVideo)}
                        title="Store Spotlight Video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    ) : (
                      <video src={seller.storeVideo} controls className="w-full h-full object-contain absolute inset-0" />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Signature Products Section */}
            {seller.signatureProducts && Array.isArray(seller.signatureProducts) && seller.signatureProducts.length > 0 && (
              <div className="w-full bg-gradient-to-br from-[#FAF6F0] via-[#F8F3E8] to-[#F3EBE0] rounded-[1.5rem] md:rounded-3xl p-6 shadow-sm border border-[#E8DEC9] mt-2 mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Star size={18} className="text-amber-600 fill-amber-600" />
                  <h3 className="text-lg md:text-xl font-[900] text-amber-955 uppercase tracking-widest">Signature Products</h3>
                </div>
                <div className="flex flex-wrap gap-3 sm:gap-4 md:gap-5">
                  {seller.signatureProducts.map(sigProd => (
                    <div key={sigProd._id} className="w-[calc(50%-6px)] sm:w-[190px] md:w-[210px] lg:w-[220px] shrink-0">
                      <ProductCard 
                        product={{
                          ...sigProd,
                          id: sigProd._id,
                          image: sigProd.mainImage || sigProd.image || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400",
                          price: sigProd.salePrice || sigProd.price,
                          originalPrice: sigProd.price,
                          weight: sigProd.weight || "1 unit"
                        }} 
                        compact={true}
                        neutralBg={true}
                        isSignature={true}
                        className="hover:scale-[1.03]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Split layout: Sidebar for Category (Desktop) or Horizontal topbar (Mobile) + Main Product Grid */}
            <div className="flex flex-col md:flex-row items-start gap-8">
              
              {/* Category selector */}
              {/* Desktop Left Sidebar */}
              <aside className="hidden md:flex flex-col gap-2 w-[240px] bg-white border border-slate-100 rounded-3xl p-4 shrink-0 sticky top-[160px] max-h-[calc(100vh-200px)] overflow-y-auto hide-scrollbar shadow-[0_8px_30px_rgba(0,0,0,0.01)]">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 mb-2">Categories</span>
                {dynamicCategories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={cn(
                      "w-full text-left px-4 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-between border transition-all active:scale-98",
                      selectedCategory === cat.id
                        ? cn("border-transparent font-black shadow-inner shadow-black/5", theme.borderActive)
                        : "bg-white border-transparent hover:bg-slate-50 text-slate-600 hover:text-slate-800"
                    )}
                  >
                    <span className="truncate mr-2">{cat.name}</span>
                    <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full shrink-0">{cat.count}</span>
                  </button>
                ))}
              </aside>

              {/* Mobile Horizontal Topbar swipe navigation */}
              <div className="md:hidden w-full sticky top-0 z-[90] bg-slate-50 py-3 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6 border-b border-slate-100/50 shadow-sm">
                {dynamicCategories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={cn(
                      "px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 border whitespace-nowrap active:scale-95",
                      selectedCategory === cat.id
                        ? cn("border-transparent shadow-sm", theme.borderActive)
                        : "bg-white border-slate-100 text-slate-600"
                    )}
                  >
                    <span>{cat.name}</span>
                    <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">{cat.count}</span>
                  </button>
                ))}
              </div>

              {/* Product Grid & Search */}
              <main className="flex-1 space-y-6 w-full">
                
                {/* Search products bar */}
                <div className="flex items-center justify-between gap-4 flex-wrap bg-white border border-slate-100 p-3 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.01)]">
                  <div className="relative w-full max-w-sm">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={`Search products in this store...`}
                      className="w-full bg-slate-50 border border-transparent hover:border-slate-100 focus:border-slate-200 pl-11 pr-4 py-2.5 rounded-2xl text-xs font-bold text-slate-800 transition-all outline-none"
                    />
                  </div>
                  
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2">
                    Showing {filteredProducts.length} of {products.length} Products
                  </span>
                </div>

                {/* Products Grid list */}
                {filteredProducts.length === 0 ? (
                  <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center flex flex-col items-center justify-center shadow-sm">
                    <Compass size={36} className="text-slate-400 mb-3 animate-pulse" />
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-1">No items found</h4>
                    <p className="text-slate-400 text-xs font-semibold max-w-[240px]">
                      No items match your selected filter or search term in this seller's catalog.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
                    {filteredProducts.map(p => (
                      <ProductCard 
                        key={p.id} 
                        product={p} 
                        compact={true} 
                        neutralBg={true} 
                        className="hover:scale-[1.03]"
                      />
                    ))}
                  </div>
                )}

              </main>

            </div>

          </div>
        )}

      </div>

      {/* GrandBazar existing buy-loop overlay systems */}
      <MiniCart />
      <ProductDetailSheet />

      {/* Welcome Splash overlay */}


      <style dangerouslySetInnerHTML={{
        __html: `
          .hide-scrollbar::-webkit-scrollbar {
            display: none;
          }
          .hide-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}} 
      />
    </div>
  );
};

export default StoreDetailPage;
