import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Heart, Search, Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '@shared/components/ui/Toast';
import { cn } from '@/lib/utils';
import { applyCloudinaryTransform, getCategoryImageUrl, CATEGORY_PLACEHOLDER_IMAGE, handleCategoryImageError } from '@/core/utils/imageUtils';

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
    const [subCategories, setSubCategories] = useState([{ id: 'all', name: 'All', icon: CATEGORY_PLACEHOLDER_IMAGE }]);
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [noServiceData, setNoServiceData] = useState(null);
    const [refreshTick, setRefreshTick] = useState(0);
    const [sortBy, setSortBy] = useState('newest');
    const [maxDistanceKm, setMaxDistanceKm] = useState(null);
    const [inStockOnly, setInStockOnly] = useState(false);
    const [priceRange, setPriceRange] = useState({ min: null, max: null });
    const [selectedBrand, setSelectedBrand] = useState('');
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
            .then(async (catRes) => {
                if (cancelled || !catRes.data.success) return;
                const tree = catRes.data.results || catRes.data.result || [];
                const target = String(catId || "").trim().toLowerCase();

                const isMatch = (item) => {
                    if (!item) return false;
                    const itemId = String(item._id || item.id || "").toLowerCase();
                    const itemSlug = String(item.slug || "").toLowerCase();
                    const itemName = String(item.name || "").toLowerCase();
                    return itemId === target || itemSlug === target || itemName === target;
                };

                let currentCat = null;
                // 1. Search in header.children (Level 2 categories)
                for (const header of tree) {
                    const found = (header.children || []).find(isMatch);
                    if (found) {
                        currentCat = found;
                        break;
                    }
                }

                // 2. Check headers (Level 1)
                if (!currentCat) {
                    const matchedHeader = tree.find(isMatch);
                    if (matchedHeader) {
                        currentCat = matchedHeader;
                    }
                }

                // 3. Check subcategories (Level 3)
                if (!currentCat) {
                    for (const header of tree) {
                        for (const cat of (header.children || [])) {
                            const foundSub = (cat.children || []).find(isMatch);
                            if (foundSub) {
                                currentCat = cat;
                                setSelectedSubCategory(foundSub._id || foundSub.id);
                                break;
                            }
                        }
                        if (currentCat) break;
                    }
                }

                if (currentCat) {
                    setCategory(currentCat);
                    let subs = (currentCat.children || []).map(s => ({
                        id: s._id || s.id,
                        name: s.name,
                        icon: getCategoryImageUrl(s.image)
                    }));

                    // Fallback: If currentCat.children in tree is empty, fetch direct subcategories by parentId
                    if (subs.length === 0 && (currentCat._id || currentCat.id)) {
                        try {
                            const parentId = currentCat._id || currentCat.id;
                            const subRes = await customerApi.getCategories({ parentId, limit: 100 });
                            const items = subRes.data?.results?.items || subRes.data?.result?.items || subRes.data?.results || subRes.data?.result || [];
                            if (Array.isArray(items) && items.length > 0) {
                                subs = items.map(s => ({
                                    id: s._id || s.id,
                                    name: s.name,
                                    icon: getCategoryImageUrl(s.image)
                                }));
                            }
                        } catch {
                            // ignore fallback error
                        }
                    }

                    if (!cancelled) {
                        setSubCategories([{ id: 'all', name: 'All', icon: CATEGORY_PLACEHOLDER_IMAGE }, ...subs]);
                    }
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

                const resolvedCategoryId = category?._id || category?.id || catId;
                const params = {
                    categoryId: resolvedCategoryId,
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
    }, [catId, category?._id, selectedSubCategory, currentLocation?.latitude, currentLocation?.longitude, hasHydratedLocation, refreshTick, sortBy]);

    const safeProducts = Array.isArray(products) ? products : [];

    const availableBrands = React.useMemo(() => {
        return Array.from(new Set(safeProducts.map((p) => p.brand).filter(Boolean))).sort();
    }, [safeProducts]);

    // Subcategory + price/newest sort happen server-side (see the products
    // fetch effect above). Distance sort/filter, price range, brand and in-stock are applied here
    // since distance is computed per-seller after the DB query, not a stored field.
    const filteredProducts = React.useMemo(() => {
        let result = safeProducts;
        if (inStockOnly) {
            result = result.filter((p) => Number(p.stock) > 0);
        }
        if (Number.isFinite(maxDistanceKm)) {
            result = result.filter((p) => !Number.isFinite(p.distanceKm) || p.distanceKm <= maxDistanceKm);
        }
        if (priceRange.min != null) {
            result = result.filter((p) => (Number(p.price) || 0) >= priceRange.min);
        }
        if (priceRange.max != null) {
            result = result.filter((p) => (Number(p.price) || 0) <= priceRange.max);
        }
        if (selectedBrand) {
            result = result.filter((p) => String(p.brand || "").toLowerCase() === selectedBrand.toLowerCase());
        }
        if (sortBy === 'price-asc') {
            result = [...result].sort((a, b) => (Number(a.price) || 0) - (Number(a.price) || 0));
        } else if (sortBy === 'price-desc') {
            result = [...result].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
        } else if (sortBy === 'distance') {
            result = [...result].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
        } else if (sortBy === 'newest') {
            result = [...result].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        }
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safeProducts, inStockOnly, maxDistanceKm, sortBy, priceRange, selectedBrand]);

    const productsById = React.useMemo(() => {
        const map = {};
        safeProducts.forEach(p => {
            map[p._id || p.id] = p;
        });
        return map;
    }, [safeProducts]);

    const realSubCategories = React.useMemo(() => {
        return subCategories.filter(s => s.id !== 'all');
    }, [subCategories]);
    const hasSubCategories = realSubCategories.length > 0;
    const currentSubCategoryObj = subCategories.find(s => s.id === selectedSubCategory);
    const currentSubCategoryName = currentSubCategoryObj && currentSubCategoryObj.id !== 'all' ? currentSubCategoryObj.name : null;

    return (
        <div className="flex flex-col min-h-screen bg-white max-w-md mx-auto relative font-sans">
            {/* Header */}
            <header className={cn(
                "sticky top-0 z-[70] bg-white border-b border-gray-50 px-4 py-4 flex items-center justify-between",
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
                <div className="sticky top-[60px] z-[60] bg-white">
                    <CategoryFilterBar
                        sortBy={sortBy}
                        onSortChange={setSortBy}
                        maxDistanceKm={maxDistanceKm}
                        onDistanceChange={setMaxDistanceKm}
                        inStockOnly={inStockOnly}
                        onInStockChange={setInStockOnly}
                        priceRange={priceRange}
                        onPriceRangeChange={setPriceRange}
                        brands={availableBrands}
                        selectedBrand={selectedBrand}
                        onBrandChange={setSelectedBrand}
                    />
                </div>
            )}

            <div className="flex flex-1 relative items-start z-10">
                {/* Sidebar: Show whenever real subcategories exist */}
                {hasSubCategories && (
                    <aside
                        className="w-[74px] border-r border-gray-100 flex flex-col bg-white overflow-y-auto hide-scrollbar sticky pb-32 flex-shrink-0"
                        style={{
                            top: !(safeProducts.length === 0 && !isLoading) ? '108px' : '60px',
                            height: !(safeProducts.length === 0 && !isLoading) ? 'calc(100vh - 108px)' : 'calc(100vh - 60px)'
                        }}
                    >
                        {subCategories.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedSubCategory(cat.id)}
                                className={cn(
                                    "flex flex-col items-center py-3.5 px-1 gap-1.5 transition-all relative border-l-4",
                                    selectedSubCategory === cat.id
                                        ? "bg-[#F7FCF5] border-primary"
                                        : "border-transparent hover:bg-gray-50"
                                )}
                            >
                                <div className={cn(
                                    "w-[48px] h-[48px] rounded-full overflow-hidden bg-white shadow-sm border transition-all duration-300 flex items-center justify-center",
                                    selectedSubCategory === cat.id ? "scale-105 shadow-md border-primary ring-2 ring-primary/20" : "border-slate-100 opacity-90 hover:opacity-100"
                                )}>
                                    <img src={applyCloudinaryTransform(cat.icon)} alt={cat.name} loading="lazy" onError={handleCategoryImageError} className="w-full h-full object-cover" />
                                </div>
                                <span className={cn(
                                    "text-[10px] text-center font-bold font-sans leading-tight px-1 line-clamp-2",
                                    selectedSubCategory === cat.id ? "text-primary" : "text-gray-600"
                                )}>
                                    {cat.name}
                                </span>
                            </button>
                        ))}
                    </aside>
                )}

                {/* Content */}
                <main className={cn(
                    "flex-1 p-3 pb-24 bg-white space-y-4 overflow-x-hidden min-w-0",
                    !hasSubCategories && "w-full"
                )}>
                    {isLoading ? (
                        <div className="grid grid-cols-2 gap-2.5">
                            {[1, 2, 3, 4, 5, 6].map((n) => (
                                <div key={n} className="h-44 rounded-2xl bg-slate-100 animate-pulse" />
                            ))}
                        </div>
                    ) : safeProducts.length > 0 ? (
                        filteredProducts.length === 0 ? (
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
                            <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                                {filteredProducts.map((product) => (
                                    <ProductCard key={product.id} product={product} compact={true} />
                                ))}
                            </div>
                        )
                    ) : (
                        /* Empty state: No products for this category/subcategory */
                        <div className="flex flex-col items-center justify-center text-center py-4 px-1">
                            {/* If main category has subcategories, display them as cards in the main section too! */}
                            {hasSubCategories && selectedSubCategory === 'all' && (
                                <div className="w-full mb-6 text-left">
                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
                                            Subcategories
                                        </h2>
                                        <span className="text-[11px] font-semibold text-slate-400">
                                            {realSubCategories.length} categories
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                        {realSubCategories.map((sub) => (
                                            <button
                                                key={sub.id}
                                                onClick={() => setSelectedSubCategory(sub.id)}
                                                className="flex flex-col items-center p-3 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-white hover:border-primary/40 hover:shadow-sm active:scale-95 transition-all text-center group"
                                            >
                                                <div className="w-14 h-14 rounded-full overflow-hidden bg-white shadow-sm border border-slate-100 mb-2 p-0.5 flex items-center justify-center">
                                                    <img
                                                        src={applyCloudinaryTransform(sub.icon)}
                                                        alt={sub.name}
                                                        onError={handleCategoryImageError}
                                                        className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform"
                                                    />
                                                </div>
                                                <span className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight">
                                                    {sub.name}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Coming Soon Notice */}
                            <div className={cn(
                                "flex flex-col items-center text-center w-full",
                                hasSubCategories ? "p-5 rounded-3xl bg-slate-50/70 border border-slate-100" : "py-16 px-4"
                            )}>
                                <div className={cn("mb-3", hasSubCategories ? "w-36 h-36" : "w-56 h-56")}>
                                    {noServiceData ? (
                                        <Lottie animationData={noServiceData} loop={true} />
                                    ) : (
                                        <div className={cn(hasSubCategories ? "w-36 h-36" : "w-56 h-56")} />
                                    )}
                                </div>
                                <h3 className={cn(
                                    "font-[1000] text-slate-800 tracking-tight mb-1 uppercase",
                                    hasSubCategories ? "text-lg" : "text-2xl"
                                )}>
                                    Not Available <span className="text-primary">In Your Area</span>
                                </h3>
                                <p className="text-slate-500 font-bold text-xs max-w-[260px] mb-5 leading-relaxed">
                                    {currentSubCategoryName || category?.name || 'This category'} is not available in your area yet. We're expanding fast!
                                </p>
                                <button
                                    onClick={() => setRefreshTick((t) => t + 1)}
                                    className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-slate-800 active:scale-95 transition-all shadow-md shadow-black/10"
                                >
                                    Try Refreshing
                                </button>
                            </div>
                        </div>
                    )}
                </main>
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

