import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Heart, Search, Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '@shared/components/ui/Toast';
import { cn } from '@/lib/utils';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';

import ProductCard from '../components/shared/ProductCard';
import ProductDetailSheet from '../components/shared/ProductDetailSheet';
import CategoryFilterBar from '../components/shared/CategoryFilterBar';
import { useProductDetail } from '../context/ProductDetailContext';
import { customerApi } from '../services/customerApi';
import MiniCart from '../components/shared/MiniCart';
import SectionRenderer from "../components/experience/SectionRenderer";
import { useLocation as useAppLocation } from '../context/LocationContext';
import { useSettings } from '@core/context/SettingsContext';
import Lottie from 'lottie-react';
import { useSeoMeta } from '@core/seo/useSeoMeta';
import { buildCategoryPath } from '@core/seo/url';

const CategoryProductsPage = () => {
    const { categoryName: catId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { currentLocation, hasHydratedLocation } = useAppLocation();
    const { settings } = useSettings();
    const initialSubcategoryId = location.state?.activeSubcategoryId || 'all';
    const { isOpen: isProductDetailOpen } = useProductDetail();
    const [selectedSubCategory, setSelectedSubCategory] = useState(initialSubcategoryId);
    const [category, setCategory] = useState(null);
    const [subCategories, setSubCategories] = useState([{ id: 'all', name: 'All', icon: 'https://cdn-icons-png.flaticon.com/128/2321/2321831.png' }]);
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [noServiceData, setNoServiceData] = useState(null);
    const [refreshTick, setRefreshTick] = useState(0);
    const [sortBy, setSortBy] = useState('newest');
    const [maxDistanceKm, setMaxDistanceKm] = useState(null);
    const [inStockOnly, setInStockOnly] = useState(false);
    const canonicalPath = category ? buildCategoryPath(category) : `/category/${catId || ""}`;
    const canonicalUrl = `${window.location.origin}${canonicalPath}`;

    useSeoMeta({
        title: category?.name ? `${category.name} | Grand Bazar` : "Category | Grand Bazar",
        description: category?.description || `Discover products in ${category?.name || "selected"} category.`,
        canonicalUrl,
        keywords: [category?.name, "category", "Grand Bazar"].filter(Boolean),
        ogImage: category?.image || "",
        jsonLdId: "category-page",
        jsonLd: category ? {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${category.name} collection`,
            description: category.description || "",
            url: canonicalUrl,
        } : null,
    });

    // Dynamically load no-service Lottie on mount
    useEffect(() => {
        import('@/assets/lottie/animation.json')
            .then((m) => setNoServiceData(m.default))
            .catch(() => {});
    }, []);

    // Category tree + subcategory chip list — only needs refetching when the
    // category itself changes, not on every subcategory tap.
    useEffect(() => {
        let cancelled = false;
        customerApi.getCategories({ tree: true })
            .then((catRes) => {
                if (cancelled || !catRes.data.success) return;
                const tree = catRes.data.results || catRes.data.result || [];
                let currentCat = null;
                for (const header of tree) {
                    const found = (header.children || []).find(c => c._id === catId);
                    if (found) {
                        currentCat = found;
                        break;
                    }
                }

                if (currentCat) {
                    setCategory(currentCat);
                    const subs = (currentCat.children || []).map(s => ({
                        id: s._id,
                        name: s.name,
                        icon: s.image || 'https://cdn-icons-png.flaticon.com/128/2321/2321801.png'
                    }));
                    setSubCategories([{ id: 'all', name: 'All', icon: 'https://cdn-icons-png.flaticon.com/128/2321/2321831.png' }, ...subs]);
                }
            })
            .catch((error) => console.error("Error fetching category tree:", error));
        return () => { cancelled = true; };
    }, [catId]);

    useEffect(() => {
        setSelectedSubCategory(location.state?.activeSubcategoryId || 'all');
    }, [catId, location.state?.activeSubcategoryId]);

    // Products — refetches from the server whenever the selected subcategory
    // changes, instead of client-filtering only the category's first page of
    // results (which silently missed products past the default page size).
    useEffect(() => {
        // Location hasn't finished restoring from storage/GPS yet — wait rather
        // than treating "not yet known" as "no service available" (that flashed
        // the Service Unavailable screen on every fresh mount).
        if (!hasHydratedLocation) {
            return;
        }

        let cancelled = false;
        const fetchProducts = async () => {
            setIsLoading(true);
            try {
                const hasValidLocation =
                    Number.isFinite(currentLocation?.latitude) &&
                    Number.isFinite(currentLocation?.longitude);

                if (!hasValidLocation) {
                    if (!cancelled) setProducts([]);
                    return;
                }

                const params = {
                    categoryId: catId,
                    lat: currentLocation.latitude,
                    lng: currentLocation.longitude,
                    limit: 100,
                    // "distance" isn't a DB-sortable field (computed per-seller after
                    // the query) — sorted client-side below instead.
                    sort: sortBy === 'distance' ? 'newest' : sortBy,
                };
                if (selectedSubCategory !== 'all') {
                    params.subcategoryId = selectedSubCategory;
                }

                const prodRes = await customerApi.getProducts(params);
                if (cancelled) return;

                if (prodRes.data.success) {
                    const rawResult = prodRes.data.result;
                    const dbProds = Array.isArray(prodRes.data.results)
                        ? prodRes.data.results
                        : Array.isArray(rawResult?.items)
                        ? rawResult.items
                        : Array.isArray(rawResult)
                        ? rawResult
                        : [];

                    const formattedProds = dbProds.map(p => ({
                        ...p,
                        id: p._id,
                        image:
                          p.mainImage ||
                          p.image ||
                          "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400",
                        price: p.customerSalePrice ?? p.customerPrice ?? p.salePrice ?? p.price,
                        originalPrice: p.customerPrice ?? p.price,
                        weight: p.weight || "1 unit",
                        deliveryTime: p.deliveryEta?.label || "8-15 mins"
                    }));
                    setProducts(Array.isArray(formattedProds) ? formattedProds : []);
                } else {
                    setProducts([]);
                }
            } catch (error) {
                console.error("Error fetching category products:", error);
                if (!cancelled) setProducts([]);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        fetchProducts();
        return () => { cancelled = true; };
    }, [catId, selectedSubCategory, currentLocation?.latitude, currentLocation?.longitude, hasHydratedLocation, refreshTick, sortBy]);

    const safeProducts = Array.isArray(products) ? products : [];

    // Subcategory + price/newest sort happen server-side (see the products
    // fetch effect above). Distance sort/filter and in-stock are applied here
    // since distance is computed per-seller after the DB query, not a stored field.
    const filteredProducts = React.useMemo(() => {
        let result = safeProducts;
        if (inStockOnly) {
            result = result.filter((p) => Number(p.stock) > 0);
        }
        if (Number.isFinite(maxDistanceKm)) {
            result = result.filter((p) => !Number.isFinite(p.distanceKm) || p.distanceKm <= maxDistanceKm);
        }
        if (sortBy === 'distance') {
            result = [...result].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
        }
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safeProducts, inStockOnly, maxDistanceKm, sortBy]);

    const productsById = React.useMemo(() => {
        const map = {};
        safeProducts.forEach(p => {
            map[p._id || p.id] = p;
        });
        return map;
    }, [safeProducts]);

    return (
        <div className="flex flex-col min-h-screen bg-white max-w-md mx-auto relative font-sans">
            {/* Header */}
            <header className={cn(
                "sticky top-0 z-50 bg-white border-b border-gray-50 px-4 py-4 flex items-center justify-between",
                isProductDetailOpen && "hidden md:flex"
            )}>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-1 hover:bg-gray-50 rounded-full transition-colors"
                    >
                        <ChevronLeft size={24} className="text-gray-900" />
                    </button>
                    <h1 className="text-[18px] font-bold text-gray-800 tracking-tight">
                        {category?.name || catId}
                    </h1>
                </div>

            </header>

            {!(safeProducts.length === 0 && !isLoading) && (
                <div className="sticky top-[60px] z-40">
                    <CategoryFilterBar
                        sortBy={sortBy}
                        onSortChange={setSortBy}
                        maxDistanceKm={maxDistanceKm}
                        onDistanceChange={setMaxDistanceKm}
                        inStockOnly={inStockOnly}
                        onInStockChange={setInStockOnly}
                    />
                </div>
            )}

            <div className="flex flex-1 relative items-start">
                {(safeProducts.length === 0 && !isLoading) ? (
                    <div className="w-full flex-1 py-20 px-8 flex flex-col items-center justify-center text-center">
                        <div className="w-64 h-64 mb-6">
                            {noServiceData ? (
                                <Lottie animationData={noServiceData} loop={true} />
                            ) : (
                                <div className="w-64 h-64" />
                            )}
                        </div>
                        <h3 className="text-3xl font-[1000] text-slate-800 tracking-tighter mb-4 uppercase">
                            Service <span className="text-primary">Unavailable</span>
                        </h3>
                        <p className="text-slate-500 font-bold text-sm max-w-[280px] mb-8 leading-relaxed">
                            {settings?.appName || 'Our service'} is not available in your area yet. We're expanding fast!
                        </p>
                        <button
                            onClick={() => setRefreshTick((t) => t + 1)}
                            className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 active:scale-95 transition-all shadow-xl shadow-black/10"
                        >
                            Try Refreshing
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Sidebar */}
                        <aside className="w-[70px] border-r border-gray-50 flex flex-col bg-white overflow-y-auto hide-scrollbar sticky top-[108px] h-[calc(100vh-108px)] pb-32 flex-shrink-0">
                            {subCategories.map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedSubCategory(cat.id)}
                                    className={cn(
                                        "flex flex-col items-center py-4 px-1 gap-2 transition-all relative border-l-4",
                                        selectedSubCategory === cat.id
                                            ? "bg-[#F7FCF5] border-primary"
                                            : "border-transparent hover:bg-gray-50"
                                    )}
                                >
                                    <div className={cn(
                                        "w-[50px] h-[50px] rounded-full overflow-hidden bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] border transition-all duration-300",
                                        selectedSubCategory === cat.id ? "scale-110 shadow-md border-primary ring-2 ring-primary/20" : "border-slate-100 opacity-90 hover:opacity-100"
                                    )}>
                                        <img src={applyCloudinaryTransform(cat.icon)} alt={cat.name} loading="lazy" className="w-full h-full object-cover" />
                                    </div>
                                    <span className={cn(
                                        "text-[10px] text-center font-bold font-sans leading-tight px-1",
                                        selectedSubCategory === cat.id ? "text-primary" : "text-gray-600"
                                    )}>
                                        {cat.name}
                                    </span>
                                </button>
                            ))}
                        </aside>

                        {/* Content */}
                        <main className="flex-1 p-2 pb-24 bg-white space-y-4 overflow-x-hidden">
                            {(filteredProducts.length === 0 && !isLoading && safeProducts.length > 0) ? (
                                <div className="py-16 px-4 flex flex-col items-center text-center">
                                    <p className="text-sm font-bold text-slate-600 mb-1">No products match your filters</p>
                                    <p className="text-xs text-slate-400 mb-4">Try widening the distance or clearing filters.</p>
                                    <button
                                        onClick={() => { setMaxDistanceKm(null); setInStockOnly(false); }}
                                        className="px-5 py-2 rounded-full bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
                                    >
                                        Clear filters
                                    </button>
                                </div>
                            ) : (
                                <div className={cn(
                                    "grid grid-cols-2 gap-x-2 gap-y-3 transition-opacity",
                                    isLoading && "opacity-40 pointer-events-none"
                                )}>
                                    {filteredProducts.map((product) => (
                                        <ProductCard key={product.id} product={product} compact={true} />
                                    ))}
                                </div>
                            )}
                        </main>
                    </>
                )}
            </div>

            <MiniCart />
            <ProductDetailSheet />

            <style dangerouslySetInnerHTML={{
                __html: `
                    .hide-scrollbar::-webkit-scrollbar {
                        display: none;
                    }
                    .hide-scrollbar {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                `}} />
        </div>
    );
};

export default CategoryProductsPage;

