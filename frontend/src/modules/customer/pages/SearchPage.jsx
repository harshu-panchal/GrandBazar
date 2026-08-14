import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation as useRouterLocation } from 'react-router-dom';
import { Search, Mic, ArrowLeft, X, TrendingUp, ChevronRight, History } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { customerApi } from '../services/customerApi';
import ProductCard from '../components/shared/ProductCard';
import { useProductDetail } from '../context/ProductDetailContext';
import { useSettings } from '@core/context/SettingsContext';
import { cn } from '@/lib/utils';
import { useLocation as useAppLocation } from '../context/LocationContext';
import Lottie from 'lottie-react';
import { buildStorePath } from '@core/seo/url';

const SearchPage = () => {
    const navigate = useNavigate();
    const location = useRouterLocation();
    const { isOpen: isProductDetailOpen } = useProductDetail();
    const { settings } = useSettings();
    const { currentLocation } = useAppLocation();
    const appName = settings?.appName || 'App';

    // Get initial query from URL state or params
    const initialQuery = location.state?.query || new URLSearchParams(location.search).get('q') || '';

    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [allSellers, setAllSellers] = useState([]);
    const [sellerResults, setSellerResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
    const [noServiceData, setNoServiceData] = useState(null);
    const [listeningData, setListeningData] = useState(null);
    const recognitionRef = useRef(null);

    // Manage Recent Searches with LocalStorage
    const [pastSearches, setPastSearches] = useState(() => {
        const saved = localStorage.getItem('appzeto_recent_searches');
        return saved ? JSON.parse(saved) : [];
    });

    const [trendingSearches, setTrendingSearches] = useState([]);
    useEffect(() => {
        customerApi.getTrendingSearches()
            .then((res) => {
                const items = res?.data?.result?.items;
                setTrendingSearches(Array.isArray(items) ? items : []);
            })
            .catch(() => setTrendingSearches([]));
    }, []);

    // Category filter chips
    const [categories, setCategories] = useState([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState('all');
    useEffect(() => {
        customerApi.getCategories()
            .then((res) => {
                const dbCats = res?.data?.results || res?.data?.result || [];
                setCategories(Array.isArray(dbCats) ? dbCats.filter((c) => c.type === 'category') : []);
            })
            .catch(() => setCategories([]));
    }, []);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Debounce Logic
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query);
        }, 400); 
        return () => clearTimeout(timer);
    }, [query]);

    // Dynamically load the "listening" Lottie the first time voice search is used
    const ensureListeningAnimation = () => {
        if (listeningData) return;
        import('@/assets/lottie/listening.json')
            .then((m) => setListeningData(m.default))
            .catch(() => {});
    };

    // Voice Search Logic (Enhanced)
    const handleVoiceSearch = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Voice search is not supported in your browser. Please try Chrome.');
            return;
        }

        ensureListeningAnimation();

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-IN';
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
            setIsListening(true);
            setQuery(''); // Clear previous search if starting fresh
        };

        recognition.onend = () => {
            setIsListening(false);
            recognitionRef.current = null;
        };

        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                transcript += event.results[i][0].transcript;
            }

            if (transcript) {
                setQuery(transcript);
                // Save to history only if it's the final result
                if (event.results[event.results.length - 1].isFinal) {
                    saveSearch(transcript);
                }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setIsListening(false);
            recognitionRef.current = null;
            if (event.error === 'not-allowed') {
                alert('Microphone access denied. Please enable it in your browser settings.');
            } else {
                console.warn('Voice recognition stopped due to error:', event.error);
            }
        };

        try {
            recognition.start();
            recognitionRef.current = recognition;
        } catch (e) {
            console.error('Recognition start error:', e);
            setIsListening(false);
        }
    };

    // Fetch products
    // Fetch products and sellers
    useEffect(() => {
        const fetchData = async () => {
            const hasValidLocation =
                Number.isFinite(currentLocation?.latitude) &&
                Number.isFinite(currentLocation?.longitude);
            if (!hasValidLocation) {
                setAllProducts([]);
                setAllSellers([]);
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            try {
                const [prodRes, sellRes] = await Promise.all([
                    customerApi.getProducts({
                        limit: 100,
                        lat: currentLocation.latitude,
                        lng: currentLocation.longitude,
                    }),
                    customerApi.getNearbySellers({
                        lat: currentLocation.latitude,
                        lng: currentLocation.longitude,
                    })
                ]);
                
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
                        price: p.salePrice || p.price,
                        originalPrice: p.price,
                        weight: p.weight || '1 unit',
                        deliveryTime: p.deliveryEta?.label || '8-15 mins',
                        distance: p.distance ?? p.distanceKm,
                        distanceKm: p.distanceKm ?? p.distance,
                    }));
                    setAllProducts(formattedProds);
                }
                
                const dbSellers = sellRes.data?.results || sellRes.data?.result || sellRes.data || [];
                setAllSellers(Array.isArray(dbSellers) ? dbSellers : []);
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [currentLocation?.latitude, currentLocation?.longitude]);

    // Save search term to history
    const saveSearch = (term) => {
        if (!term.trim()) return;
        const updated = [term, ...pastSearches.filter(s => s !== term)].slice(0, 10);
        setPastSearches(updated);
        localStorage.setItem('appzeto_recent_searches', JSON.stringify(updated));
    };

    // Remove specific search term
    const handleRemoveSearch = (e, term) => {
        e.stopPropagation();
        const updated = pastSearches.filter(s => s !== term);
        setPastSearches(updated);
        localStorage.setItem('appzeto_recent_searches', JSON.stringify(updated));
    };

    // Trigger save on Enter or clicking a result
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && query.trim()) {
            saveSearch(query);
        }
    };

    const filteredSellerResults = useMemo(() => {
        if (!debouncedQuery.trim()) return [];
        return allSellers.filter(s =>
            String(s.shopName || s.name || "").toLowerCase().includes(debouncedQuery.toLowerCase()) ||
            String(s.category || "").toLowerCase().includes(debouncedQuery.toLowerCase()) ||
            String(s.locality || "").toLowerCase().includes(debouncedQuery.toLowerCase())
        );
    }, [debouncedQuery, allSellers]);

    // Real-time backend search fetch combined with local matches for instant response
    // A category can be selected on its own (no text query) to browse that category.
    useEffect(() => {
        const fetchResults = async () => {
            if (!debouncedQuery.trim() && selectedCategoryId === 'all') {
                setResults([]);
                return;
            }

            // First set results to local matches for instant feedback
            const localMatches = allProducts.filter(p => {
                const matchesText = !debouncedQuery.trim() ||
                    p.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
                    p.categoryId?.name?.toLowerCase().includes(debouncedQuery.toLowerCase());
                const matchesCategory = selectedCategoryId === 'all' ||
                    String(p.categoryId?._id || p.categoryId || '') === selectedCategoryId;
                return matchesText && matchesCategory;
            });
            setResults(localMatches);

            const hasValidLocation =
                Number.isFinite(currentLocation?.latitude) &&
                Number.isFinite(currentLocation?.longitude);
            if (!hasValidLocation) return;

            setIsLoading(true);
            try {
                const prodRes = await customerApi.getProducts({
                    ...(debouncedQuery.trim() ? { search: debouncedQuery } : {}),
                    ...(selectedCategoryId !== 'all' ? { category: selectedCategoryId } : {}),
                    limit: 100,
                    lat: currentLocation.latitude,
                    lng: currentLocation.longitude,
                });
                
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
                        price: p.salePrice || p.price,
                        originalPrice: p.price,
                        weight: p.weight || '1 unit',
                        deliveryTime: p.deliveryEta?.label || '8-15 mins',
                        distance: p.distance ?? p.distanceKm,
                        distanceKm: p.distanceKm ?? p.distance,
                    }));
                    
                    // Merge local and backend matches to avoid duplicates (by ID)
                    setResults(prev => {
                        const mergedMap = new Map();
                        // Put local matches first
                        localMatches.forEach(item => {
                            const idKey = item.id || item._id;
                            if (idKey) mergedMap.set(idKey, item);
                        });
                        // Overwrite/add backend matches
                        formattedProds.forEach(item => {
                            const idKey = item.id || item._id;
                            if (idKey) mergedMap.set(idKey, item);
                        });
                        return Array.from(mergedMap.values());
                    });
                }
            } catch (error) {
                console.error('Error fetching search results:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchResults();
    }, [debouncedQuery, selectedCategoryId, allProducts, currentLocation?.latitude, currentLocation?.longitude]);

    useEffect(() => {
        setSellerResults(filteredSellerResults);
    }, [filteredSellerResults]);

    // Dynamically load no-service Lottie when results are empty
    useEffect(() => {
        if (!isLoading) {
            import('@/assets/lottie/animation.json')
                .then((m) => setNoServiceData(m.default))
                .catch(() => {});
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Lowest Price Section
    const lowestPriceProducts = useMemo(() => {
        return [...allProducts]
            .sort((a, b) => a.price - b.price)
            .slice(0, 10);
    }, [allProducts]);

    const handleClear = () => {
        setQuery('');
        setResults([]);
    };

    return (
        <div className="min-h-screen bg-white font-outfit">
            {/* Header / Search Input */}
            <div className={cn(
                "sticky top-0 z-50 bg-linear-to-r from-primary to-[var(--brand-400)] shadow-[0_4px_20px_rgba(0,0,0,0.12)] relative overflow-hidden",
                isProductDetailOpen && "hidden md:block"
            )}>
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12 blur-xl pointer-events-none" />

                <div className="px-4 pt-5 pb-6 flex items-center md:justify-center gap-3 relative z-10">
                        <button
                            onClick={() => navigate(-1)}
                            className="flex items-center justify-center w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full text-white backdrop-blur-md border border-white/10 transition-all flex-shrink-0 shadow-sm active:scale-90"
                        >
                            <ArrowLeft size={22} strokeWidth={2.5} />
                        </button>

                        <div className="flex-1 relative md:flex-none md:w-[500px] lg:w-[600px]">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                                <Search size={18} strokeWidth={3} className="text-slate-400" />
                            </div>
                            <input
                                autoFocus
                                type="text"
                                placeholder='Search items, categories...'
                                value={query}
                                onKeyDown={handleKeyDown}
                                onChange={(e) => setQuery(e.target.value)}
                                className="w-full h-12 bg-white rounded-2xl pl-11 pr-14 shadow-xl shadow-black/10 border-none outline-none text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-medium focus:ring-4 focus:ring-white/20 transition-all"
                            />
                            
                            {/* Integrated Actions inside Search Input */}
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1">
                                {query && (
                                    <button
                                        onClick={handleClear}
                                        className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
                                    >
                                        <X size={12} strokeWidth={3} className="text-slate-600" />
                                    </button>
                                )}
                                <div className="w-[1px] h-6 bg-slate-100 mx-1" />
                                <button 
                                    onClick={handleVoiceSearch}
                                    className={cn(
                                        "p-2 transition-all rounded-full relative",
                                        isListening ? "text-red-500 bg-red-50 scale-110" : "text-slate-400 hover:text-primary hover:bg-slate-50"
                                    )}
                                >
                                    <Mic size={20} strokeWidth={2.5} className={cn(isListening && "animate-pulse")} />
                                    {isListening && (
                                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <AnimatePresence>
                    {isListening && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center px-6"
                            onClick={() => recognitionRef.current?.stop()}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-white rounded-3xl w-full max-w-xs p-8 flex flex-col items-center text-center shadow-2xl"
                            >
                                <div className="w-44 h-44 -my-4">
                                    {listeningData ? (
                                        <Lottie animationData={listeningData} loop={true} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Mic size={56} strokeWidth={2} className="text-primary animate-pulse" />
                                        </div>
                                    )}
                                </div>
                                <h3 className="text-lg font-black text-slate-900">Listening…</h3>
                                <p className="text-sm text-slate-500 font-semibold mt-1 min-h-[20px] line-clamp-2">
                                    {query ? `"${query}"` : 'Say something to search'}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => recognitionRef.current?.stop()}
                                    className="mt-6 px-6 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors active:scale-95"
                                >
                                    Tap to stop
                                </button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {categories.length > 0 && (
                    <div className="px-5 pt-4 flex gap-2 overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => setSelectedCategoryId('all')}
                            className={cn(
                                "px-3.5 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all border",
                                selectedCategoryId === 'all'
                                    ? "bg-primary text-white border-primary"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-primary/40"
                            )}
                        >
                            All
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat._id}
                                onClick={() => setSelectedCategoryId((prev) => (prev === cat._id ? 'all' : cat._id))}
                                className={cn(
                                    "px-3.5 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all border",
                                    selectedCategoryId === cat._id
                                        ? "bg-primary text-white border-primary"
                                        : "bg-white text-slate-600 border-slate-200 hover:border-primary/40"
                                )}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                )}

                <div className="p-5 space-y-10 pb-24">
                {/* Search Results List */}
                {(query || selectedCategoryId !== 'all') ? (
                    <div className="space-y-10">
                        {/* Sellers Results */}
                        {sellerResults.length > 0 && (
                            <section>
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-lg font-black text-slate-800 tracking-tight">
                                        Shops & Stores
                                    </h2>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{sellerResults.length} found</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {sellerResults.map(s => {
                                        const logoUrl = s.logoUrl || s.logo || s.shopLogo || s.avatarImage || s.avatar || "";
                                        return (
                                            <div key={s._id} onClick={() => { saveSearch(query); navigate(buildStorePath(s)); }} className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md cursor-pointer transition-all">
                                                <div className="h-14 w-14 rounded-xl bg-slate-100 flex items-center justify-center font-black text-xl text-slate-400 overflow-hidden shrink-0 border border-slate-100">
                                                    {logoUrl ? (
                                                        <img
                                                            src={logoUrl}
                                                            alt={s.shopName || s.name}
                                                            className="w-full h-full object-cover bg-white"
                                                            onError={(e) => {
                                                                e.currentTarget.style.display = "none";
                                                                const fallback = e.currentTarget.nextElementSibling;
                                                                if (fallback) fallback.style.display = "inline";
                                                            }}
                                                        />
                                                    ) : null}
                                                    <span style={{ display: logoUrl ? "none" : "inline" }}>
                                                        {String(s.shopName || s.name || "S").charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            <div className="flex-1">
                                                <h3 className="font-bold text-slate-800 line-clamp-1">{s.shopName || s.name}</h3>
                                                <p className="text-xs text-slate-500 line-clamp-1">
                                                    {s.category || "Store"} • {s.locality || s.address || "Nearby"}
                                                    {s.distance !== undefined && (
                                                        <span className="ml-1 font-bold text-brand-600"> • {s.distance < 0.1 ? "Very close" : `${s.distance.toFixed(1)} km away`}</span>
                                                    )}
                                                </p>
                                            </div>
                                            <ChevronRight className="text-slate-300" size={20} />
                                        </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* Products Results */}
                        {(results.length > 0 || sellerResults.length === 0) && (
                            <section>
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-black text-slate-800 tracking-tight">
                                        Products
                                    </h2>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{results.length} found</span>
                                </div>

                                {results.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-3 md:gap-x-4 gap-y-6 md:gap-y-10">
                                        {results.map((product) => (
                                            <div key={product.id} onClick={() => saveSearch(query)} className="flex justify-center">
                                                <ProductCard product={product} compact={true} neutralBg={true} />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    sellerResults.length === 0 && (
                                        <div className="py-16 flex flex-col items-center text-center">
                                            <div className="w-48 h-48 md:w-64 md:h-64 mb-6">
                                                {noServiceData ? (
                                                    <Lottie animationData={noServiceData} loop={true} />
                                                ) : (
                                                    <div className="w-48 h-48 md:w-64 md:h-64" />
                                                )}
                                            </div>
                                            <h3 className="text-xl font-black text-slate-800 tracking-tight mb-2">No items found</h3>
                                            <p className="text-slate-500 font-medium max-w-xs">
                                                {query
                                                    ? `We couldn't find anything for "${query}". Try different keywords!`
                                                    : "No products found in this category nearby."}
                                            </p>
                                        </div>
                                    )
                                )}
                            </section>
                        )}
                    </div>
                ) : (
                    <>
                        {/* 1. Recently Searched Item Section */}
                        {pastSearches.length > 0 && (
                            <section>
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Recently Searched</h3>
                                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                                    {pastSearches.map((term) => (
                                        <div
                                            key={term}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 shadow-sm rounded-full whitespace-nowrap active:scale-95 transition-transform cursor-pointer"
                                            onClick={() => setQuery(term)}
                                        >
                                            <div className="h-5 w-5 rounded flex items-center justify-center" style={{ backgroundColor: (settings?.primaryColor || 'var(--primary)') + '20' }}>
                                                <History size={12} style={{ color: settings?.primaryColor || 'var(--primary)' }} />
                                            </div>
                                            <span className="text-sm font-bold text-slate-700">{term}</span>
                                            <button
                                                onClick={(e) => handleRemoveSearch(e, term)}
                                                className="ml-1 p-0.5 hover:bg-slate-100 rounded-full transition-colors"
                                            >
                                                <X size={12} className="text-slate-400 hover:text-red-500" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* 1b. Trending Searches Section */}
                        {trendingSearches.length > 0 && (
                            <section>
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Trending Searches</h3>
                                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                                    {trendingSearches.map((item) => (
                                        <div
                                            key={item.query}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 shadow-sm rounded-full whitespace-nowrap active:scale-95 transition-transform cursor-pointer"
                                            onClick={() => setQuery(item.query)}
                                        >
                                            <div className="h-5 w-5 rounded flex items-center justify-center" style={{ backgroundColor: (settings?.primaryColor || 'var(--primary)') + '20' }}>
                                                <TrendingUp size={12} style={{ color: settings?.primaryColor || 'var(--primary)' }} />
                                            </div>
                                            <span className="text-sm font-bold text-slate-700">{item.query}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* 2. Lowest Price Ever Section */}
                        <section>
                            <div className="flex justify-between items-center mb-5">
                                <h2 className="text-xl font-black text-slate-800 tracking-tight">Lowest Price Ever!</h2>
                                <button 
                                    className="flex items-center gap-1 md:gap-1.5 px-3 py-1 md:px-4 md:py-1.5 bg-slate-50 hover:bg-slate-100 rounded-full text-xs md:text-sm font-black transition-all" 
                                    style={{ color: settings?.primaryColor || 'var(--primary)' }}
                                    onClick={() => navigate('/category/all')}
                                >
                                    See All <ChevronRight size={14} strokeWidth={3} />
                                </button>
                            </div>
                            <div className="flex gap-2 md:gap-4 overflow-x-auto no-scrollbar -mx-5 px-5 pb-3 snap-x">
                                {isLoading && allProducts.length === 0 ? (
                                    [...Array(4)].map((_, i) => (
                                        <div key={i} className="min-w-[126px] sm:min-w-[136px] md:min-w-[148px] h-52 md:h-64 bg-slate-50 rounded-2xl animate-pulse" />
                                    ))
                                ) : lowestPriceProducts.map((product) => (
                                    <div key={product.id} className="min-w-[126px] sm:min-w-[136px] md:min-w-[148px] snap-start">
                                        <ProductCard product={product} compact={true} neutralBg={true} />
                                    </div>
                                ))}
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
};

export default SearchPage;
