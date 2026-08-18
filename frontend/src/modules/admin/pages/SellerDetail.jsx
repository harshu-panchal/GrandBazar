import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi, unwrapList } from '../services/adminApi';
import { getLegacyStatusFromOrder, getOrderStatusLabel, getStatusVariant } from '@/shared/utils/orderStatus';
import {
    ChevronLeft,
    Building2,
    User,
    Mail,
    Phone,
    MapPin,
    Star,
    Calendar,
    Wallet,
    TrendingUp,
    ShoppingBag,
    History,
    Banknote,
    Clock,
    ArrowUpRight,
    Edit3,
    MoreVertical,
    CheckCircle2,
    XCircle,
    RotateCw,
    Search,
    Download,
    Plus,
    Trash2,
    Video,
    Image as ImageIcon,
    Truck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import Modal from '@shared/components/ui/Modal';
import { motion } from 'framer-motion';
import MapPicker from '@/shared/components/MapPicker';

const getVideoEmbedUrl = (url) => {
    if (!url) return "";
    const shortMatch = url.match(/shorts\/([^/?]+)/);
    const watchMatch = url.match(/[?&]v=([^&]+)/);
    const youtuMatch = url.match(/youtu\.be\/([^/?]+)/);
    const videoId = shortMatch ? shortMatch[1] : watchMatch ? watchMatch[1] : youtuMatch ? youtuMatch[1] : null;
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
};

const SellerDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState('orders');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [orders, setOrders] = useState([]);
    const [sellerProductsList, setSellerProductsList] = useState([]);
    const [isLoadingSellerProducts, setIsLoadingSellerProducts] = useState(false);
    const [sellerProductsPage, setSellerProductsPage] = useState(1);
    const [sellerProductsPageSize, setSellerProductsPageSize] = useState(25);
    const [sellerProductsTotal, setSellerProductsTotal] = useState(0);
    const [deliveryPolicyForm, setDeliveryPolicyForm] = useState({
        customerPickup: false,
        sellerDelivery: false,
        platformLogistics: true,
        autoSwitchToPlatform: false,
        platformLogisticsEnabledByAdmin: true,
        sameDayCutoffTime: '18:00',
    });
    const [isLoadingDeliveryPolicy, setIsLoadingDeliveryPolicy] = useState(false);
    const [isSavingDeliveryPolicy, setIsSavingDeliveryPolicy] = useState(false);
    const [businessModelData, setBusinessModelData] = useState(null);
    const [commissionForm, setCommissionForm] = useState({
        scope: 'category',
        type: 'percentage',
        value: 0,
    });
    const [shopCommissionForm, setShopCommissionForm] = useState({
        applyCommission: false,
        adminCommissionType: 'percentage',
        adminCommissionValue: 0,
        adminCommissionFixedRule: 'per_qty',
    });
    const [isSendingCredentials, setIsSendingCredentials] = useState(false);
    const [isSavingShopSetup, setIsSavingShopSetup] = useState(false);
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [shopSetupForm, setShopSetupForm] = useState({
        shopName: '',
        category: '',
        description: '',
        address: '',
        locality: '',
        city: '',
        pincode: '',
        serviceRadius: 5,
        lat: null,
        lng: null,
        packagingCharge: 0,
        packagingChargeEnabled: false,
        businessModel: 'commission',
        applyCommission: true,
        adminCommissionType: 'percentage',
        adminCommissionValue: 10,
        adminCommissionFixedRule: 'per_qty',
        subscriptionPlanId: '',
        accountHolder: '',
        accountNumber: '',
        ifsc: '',
        bankName: '',
        logoUrl: '',
        banners: [],
        storeVideo: '',
        excludeFromAlternatives: false,
        schedulingSettings: {
            enabled: false,
            maxDaysAhead: 30,
            rescheduleCutoffDays: 1,
            selfLogistics: false,
            deliveryWindows: [],
        },
    });

    const [headerCategories, setHeaderCategories] = useState([
        "Grocery", "Fruits & Vegetables", "Bakery & Dairy", "Meat & Fish", "Beverages", 
        "Snacks & Branded Foods", "Personal Care", "Household Care", "Electronics & Appliances", 
        "Fashion & Apparel", "Pharmacy & Health", "Beauty & Cosmetics", "Pet Care", "General Store"
    ]);
    const [subscriptionPlans, setSubscriptionPlans] = useState([]);

    useEffect(() => {
        const fetchHeaderCategories = async () => {
            try {
                const res = await adminApi.getCategories({ type: "header" });
                const rawPayload = res.data?.result || res.data?.results || res.data?.data || res.data;
                const items = Array.isArray(rawPayload?.items) ? rawPayload.items : (Array.isArray(rawPayload) ? rawPayload : []);
                if (Array.isArray(items) && items.length > 0) {
                    const fetchedNames = items
                        .filter(c => !c.type || c.type === 'header')
                        .map(c => typeof c === 'string' ? c : c.name)
                        .filter(Boolean);
                    if (fetchedNames.length > 0) {
                        setHeaderCategories(Array.from(new Set(fetchedNames)));
                    }
                }
            } catch (err) {
                // Fallback gracefully
            }
        };
        fetchHeaderCategories();

        const fetchSubscriptionPlans = async () => {
            try {
                const res = await adminApi.getSubscriptionPlans();
                const list = res.data?.result || res.data?.results || res.data?.data || res.data || [];
                if (Array.isArray(list)) {
                    setSubscriptionPlans(list);
                    if (list.length > 0) {
                        setShopSetupForm((prev) => ({ ...prev, subscriptionPlanId: list[0]._id || list[0].id }));
                    }
                }
            } catch (err) {
                // Fallback
            }
        };
        fetchSubscriptionPlans();
    }, []);

    const handleLocationSelect = (location) => {
        setShopSetupForm((prev) => ({
            ...prev,
            lat: location.lat,
            lng: location.lng,
            serviceRadius: location.radius || prev.serviceRadius,
            locality: location.locality || prev.locality,
            city: location.city || prev.city,
            pincode: location.pincode || prev.pincode,
            address: location.address || prev.address,
        }));
        showToast('Store location pinned & address auto-filled from Google Maps', 'success');
    };
    const [seller, setSeller] = useState({
        id: id || '',
        shopName: 'Loading...',
        ownerName: '—',
        email: '',
        phone: '',
        category: '—',
        rating: null,
        avgRating: 0,
        reviewCount: 0,
        favoriteCount: 0,
        status: 'active',
        joinedDate: '—',
        location: '—',
        image: '',
        walletBalance: 0,
        totalOrders: 0,
        totalRevenue: 0,
        commissionRate: '—',
        coords: null,
        serviceRadius: 5,
        bankInfo: {
            bankName: '—',
            accountNo: '—',
            ifsc: '—',
        },
    });

    const loadSellerData = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        try {
            const [detailRes, bmRes, ordersRes] = await Promise.all([
                adminApi.getActiveSellerById(id),
                adminApi.getSellerBusinessModel(id).catch(() => null),
                adminApi.getOrders({ limit: 50 }).catch(() => null),
            ]);

            const detail = detailRes?.data?.result;
            if (detail) {
                const coords = detail.location?.coordinates || detail.coordinates;
                const lat = Array.isArray(coords) && coords.length === 2 ? coords[1] : detail.lat || null;
                const lng = Array.isArray(coords) && coords.length === 2 ? coords[0] : detail.lng || null;

                setShopSetupForm({
                    shopName: detail.shopName || '',
                    category: detail.category || '',
                    description: detail.description || '',
                    address: detail.address || '',
                    locality: detail.locality || '',
                    city: detail.city || '',
                    pincode: detail.pincode || '',
                    serviceRadius: detail.serviceRadius ?? 5,
                    lat: lat,
                    lng: lng,
                    packagingCharge: detail.packagingCharge ?? 0,
                    packagingChargeEnabled: Boolean(detail.packagingChargeEnabled),
                    accountHolder: detail.bankInfo?.accountHolder || detail.accountHolder || '',
                    accountNumber: detail.bankInfo?.accountNo || detail.accountNumber || '',
                    ifsc: detail.bankInfo?.ifsc || detail.ifsc || '',
                    bankName: detail.bankInfo?.bankName || detail.bankName || '',
                    logoUrl: detail.logoUrl || '',
                    banners: Array.isArray(detail.banners) ? detail.banners : [],
                    storeVideo: detail.storeVideo || '',
                    excludeFromAlternatives: Boolean(detail.excludeFromAlternatives),
                    schedulingSettings: {
                        enabled: Boolean(detail.schedulingSettings?.enabled),
                        maxDaysAhead: detail.schedulingSettings?.maxDaysAhead ?? 30,
                        rescheduleCutoffDays: detail.schedulingSettings?.rescheduleCutoffDays ?? 1,
                        selfLogistics: Boolean(detail.schedulingSettings?.selfLogistics),
                        deliveryWindows: Array.isArray(detail.schedulingSettings?.deliveryWindows)
                            ? detail.schedulingSettings.deliveryWindows
                            : [],
                    },
                });
                setSeller((prev) => ({
                    ...prev,
                    id: detail.id || id,
                    shopName: detail.shopName || prev.shopName,
                    ownerName: detail.ownerName || prev.ownerName,
                    email: detail.email || prev.email,
                    phone: detail.phone || prev.phone,
                    category: detail.category || prev.category,
                    status: detail.status || prev.status,
                    joinedDate: detail.joinedDate || prev.joinedDate,
                    location: detail.location || prev.location,
                    image: detail.image || prev.image,
                    totalOrders: detail.totalOrders ?? prev.totalOrders,
                    totalRevenue: detail.totalRevenue ?? prev.totalRevenue,
                    serviceRadius: detail.serviceRadius ?? prev.serviceRadius,
                    avgRating: Number(detail.avgRating || 0),
                    reviewCount: Number(detail.reviewCount || 0),
                    favoriteCount: Number(detail.favoriteCount || 0),
                    rating: Number(detail.avgRating || 0),
                    bankInfo: detail.bankInfo || prev.bankInfo,
                }));
            }

            if (bmRes?.data?.result) {
                const data = bmRes.data.result;
                setBusinessModelData(data);
                if (data?.commissionConfig) {
                    setCommissionForm({
                        scope: data.commissionConfig.scope || 'category',
                        type: data.commissionConfig.type || 'percentage',
                        value: data.commissionConfig.value ?? 0,
                    });
                }
            }

            try {
                const storeCommissionRes = await adminApi.getStoreCommission(id);
                const payload = storeCommissionRes?.data?.result;
                if (payload) {
                    setShopCommissionForm({
                        applyCommission: payload.applyCommission === true,
                        adminCommissionType: payload.adminCommissionType || 'percentage',
                        adminCommissionValue: Number(payload.adminCommissionValue || 0),
                        adminCommissionFixedRule: payload.adminCommissionFixedRule || 'per_qty',
                    });
                }
            } catch {
                // optional; seller detail should still load.
            }

            const orderPayload = ordersRes?.data?.result || ordersRes?.data?.results || {};
            const orderItems = Array.isArray(orderPayload.items)
                ? orderPayload.items
                : unwrapList(ordersRes);
            const storeId = detail?.id || id;
            setOrders(
                orderItems
                    .filter((order) => String(order.seller?._id || order.seller) === String(storeId))
                    .slice(0, 10),
            );
        } catch {
            showToast('Failed to load seller details', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [id, showToast]);

    useEffect(() => {
        loadSellerData();
    }, [loadSellerData]);

    useEffect(() => {
        setSellerProductsPage(1);
    }, [id]);

    useEffect(() => {
        if (activeTab !== 'products' || !id) return;
        let cancelled = false;
        setIsLoadingSellerProducts(true);
        adminApi.getProductModerationList({ sellerId: id, page: sellerProductsPage, limit: sellerProductsPageSize })
            .then((response) => {
                if (cancelled) return;
                const payload = response.data?.result || {};
                const list = Array.isArray(payload.items) ? payload.items : (response.data?.results || []);
                setSellerProductsList(list);
                setSellerProductsTotal(typeof payload.total === 'number' ? payload.total : list.length);
            })
            .catch(() => {
                if (!cancelled) showToast('Failed to load products for this seller', 'error');
            })
            .finally(() => {
                if (!cancelled) setIsLoadingSellerProducts(false);
            });
        return () => { cancelled = true; };
    }, [activeTab, id, sellerProductsPage, sellerProductsPageSize, showToast]);

    useEffect(() => {
        if (activeTab !== 'delivery-policy' || !id) return;
        let cancelled = false;
        setIsLoadingDeliveryPolicy(true);
        adminApi.getStoreDeliveryPolicy(id)
            .then((response) => {
                if (cancelled) return;
                const result = response.data?.result || {};
                setDeliveryPolicyForm((prev) => ({
                    ...prev,
                    ...(result.deliveryPolicy || {}),
                }));
            })
            .catch(() => {
                if (!cancelled) showToast('Failed to load delivery policy', 'error');
            })
            .finally(() => {
                if (!cancelled) setIsLoadingDeliveryPolicy(false);
            });
        return () => { cancelled = true; };
    }, [activeTab, id, showToast]);

    const handleSaveDeliveryPolicy = async () => {
        if (!id) return;
        setIsSavingDeliveryPolicy(true);
        try {
            const { platformLogisticsEnabledByAdmin, ...rest } = deliveryPolicyForm;
            await adminApi.updateStoreDeliveryPolicy(id, {
                platformLogisticsEnabledByAdmin,
                deliveryPolicy: rest,
            });
            showToast('Delivery policy updated on behalf of seller', 'success');
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to update delivery policy', 'error');
        } finally {
            setIsSavingDeliveryPolicy(false);
        }
    };

    const saveCommissionConfig = async () => {
        try {
            await adminApi.updateSellerCommission(id, commissionForm);
            showToast('Commission settings updated', 'success');
            const res = await adminApi.getSellerBusinessModel(id);
            setBusinessModelData(res.data.result);
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to update commission', 'error');
        }
    };

    const saveShopCommission = async () => {
        try {
            await adminApi.updateStoreCommission(id, shopCommissionForm);
            showToast('Shop-level commission updated', 'success');
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to update shop commission', 'error');
        }
    };

    const commissionLabel = businessModelData?.commissionConfig?.scope === 'seller'
        ? `${businessModelData.commissionConfig.value}${businessModelData.commissionConfig.type === 'percentage' ? '%' : ' fixed'} (seller-wise)`
        : businessModelData?.businessModel === 'commission'
            ? 'Category rates'
            : seller.commissionRate;

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await loadSellerData();
        setIsRefreshing(false);
        showToast('Seller data synchronized', 'success');
    };

    const handleResendCredentials = async () => {
        if (!id) return;
        setIsSendingCredentials(true);
        try {
            await adminApi.resendSellerCredentials(id);
            showToast('Seller credentials & app link dispatched via email', 'success');
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to resend credentials', 'error');
        } finally {
            setIsSendingCredentials(false);
        }
    };

    const handleBannerUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            showToast('Image size must be less than 2MB', 'error');
            return;
        }
        if (shopSetupForm.banners.length >= 5) {
            showToast('Maximum 5 banners allowed', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            setShopSetupForm((prev) => ({ ...prev, banners: [...prev.banners, reader.result] }));
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveBanner = (index) => {
        setShopSetupForm((prev) => ({ ...prev, banners: prev.banners.filter((_, i) => i !== index) }));
    };

    const handleAddDeliveryWindow = () => {
        setShopSetupForm((prev) => ({
            ...prev,
            schedulingSettings: {
                ...prev.schedulingSettings,
                deliveryWindows: [
                    ...(prev.schedulingSettings?.deliveryWindows || []),
                    { label: '', start: '09:00', end: '12:00', capacityPerDay: 50, enabled: true },
                ],
            },
        }));
    };

    const handleUpdateDeliveryWindow = (index, field, value) => {
        setShopSetupForm((prev) => ({
            ...prev,
            schedulingSettings: {
                ...prev.schedulingSettings,
                deliveryWindows: prev.schedulingSettings.deliveryWindows.map((w, i) =>
                    i === index ? { ...w, [field]: value } : w
                ),
            },
        }));
    };

    const handleRemoveDeliveryWindow = (index) => {
        setShopSetupForm((prev) => ({
            ...prev,
            schedulingSettings: {
                ...prev.schedulingSettings,
                deliveryWindows: prev.schedulingSettings.deliveryWindows.filter((_, i) => i !== index),
            },
        }));
    };

    const handleLogoUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 1 * 1024 * 1024) {
            showToast('Logo size must be less than 1MB', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            setShopSetupForm((prev) => ({ ...prev, logoUrl: reader.result }));
        };
        reader.readAsDataURL(file);
    };

    const handleSaveShopSetup = async (e) => {
        e?.preventDefault();
        if (!id) return;
        setIsSavingShopSetup(true);
        try {
            await adminApi.updateSellerStoreSetup(id, shopSetupForm);

            // businessModel/commission/subscriptionPlanId aren't part of the
            // store-setup allowlist (that endpoint only touches shop profile
            // fields) — they have their own dedicated endpoints.
            await adminApi.updateSellerBusinessModel(id, {
                businessModel: shopSetupForm.businessModel,
            });
            if (shopSetupForm.businessModel === 'commission') {
                await adminApi.updateStoreCommission(id, {
                    applyCommission: shopSetupForm.applyCommission,
                    adminCommissionType: shopSetupForm.adminCommissionType,
                    adminCommissionValue: shopSetupForm.adminCommissionValue,
                    adminCommissionFixedRule: shopSetupForm.adminCommissionFixedRule,
                });
            } else if (shopSetupForm.businessModel === 'subscription' && shopSetupForm.subscriptionPlanId) {
                await adminApi.assignComplimentarySubscription({
                    sellerId: id,
                    planId: shopSetupForm.subscriptionPlanId,
                });
            }

            const res = await adminApi.getSellerBusinessModel(id);
            setBusinessModelData(res.data.result);

            showToast('Shop setup updated successfully on behalf of seller', 'success');
            await loadSellerData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to update shop setup', 'error');
        } finally {
            setIsSavingShopSetup(false);
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            {/* Header / Action Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-2">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/admin/sellers/active')}
                        className="p-2.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all shadow-sm group"
                    >
                        <ChevronLeft className="h-4 w-4 text-slate-500 group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{seller.shopName}</h1>
                            <Badge variant="success" className="bg-emerald-100 text-emerald-700 border-none text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">{seller.status}</Badge>
                        </div>
                        <p className="text-sm mt-1 text-slate-500 font-medium">Owned by {seller.ownerName} <span className="opacity-40 px-1">•</span> {seller.category}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleResendCredentials}
                        disabled={isSendingCredentials}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm disabled:opacity-60"
                    >
                        <Mail className="h-3.5 w-3.5 text-slate-500" />
                        {isSendingCredentials ? 'Sending...' : 'Resend Credentials'}
                    </button>
                    <button
                        onClick={handleRefresh}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm"
                    >
                        <RotateCw className={cn("h-3.5 w-3.5 text-slate-500", isRefreshing && "animate-spin")} />
                        Sync Data
                    </button>
                    <button
                        onClick={() => setActiveTab('shop-setup')}
                        className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-all shadow-sm hover:shadow-md"
                    >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit Shop
                    </button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                    { label: 'Wallet Balance', value: '—', icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50', sub: 'Available for Payout' },
                    { label: 'Total Revenue', value: seller.totalRevenue ? `₹${(seller.totalRevenue / 1000).toFixed(1)}k` : '—', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50', sub: 'Gross Sales' },
                    { label: 'Orders Handled', value: seller.totalOrders || 0, icon: ShoppingBag, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: 'Lifetime Orders' },
                    { label: 'Store Rating', value: `${Number(seller.avgRating || seller.rating || 0).toFixed(1)}`, icon: Star, color: 'text-amber-600', bg: 'bg-amber-50', sub: `${seller.reviewCount || 0} reviews`, supplement: '/ 5' },
                ].map((stat, i) => (
                    <Card key={i} className="p-5 border border-slate-200 shadow-sm bg-white rounded-2xl hover:shadow-md hover:border-slate-300 transition-all duration-300 flex flex-col justify-between overflow-hidden relative">
                        <div className="flex items-center justify-between mb-4 z-10">
                            <div className={cn("p-2.5 rounded-xl flex items-center justify-center", stat.bg, stat.color)}>
                                <stat.icon className="h-4 w-4" />
                            </div>
                        </div>
                        <div className="z-10">
                            <h4 className="text-xs font-semibold text-slate-500 mb-1">{stat.label}</h4>
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{stat.value}</h3>
                                {stat.supplement && <span className="text-sm font-medium text-slate-400">{stat.supplement}</span>}
                            </div>
                            <p className="text-[11px] font-medium text-slate-400 mt-2 uppercase tracking-wide">{stat.sub}</p>
                        </div>
                        <div className={cn("absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-30 blur-2xl", stat.bg)}></div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Tabs Navigation */}
                    <div className="flex overflow-x-auto hide-scrollbar border-b border-slate-200/80 w-full mb-1">
                        <div className="flex items-center gap-6 px-1 h-12">
                        {[
                            { id: 'orders', label: 'Order History', icon: History },
                            { id: 'transactions', label: 'Transactions', icon: Banknote },
                            { id: 'delivery', label: 'Delivery', icon: MapPin },
                            { id: 'payouts', label: 'Withdrawals', icon: Wallet },
                            { id: 'info', label: 'Store Info', icon: Building2 },
                            { id: 'products', label: 'Products', icon: ShoppingBag },
                            { id: 'delivery-policy', label: 'Delivery Mode', icon: Truck },
                            { id: 'shop-setup', label: 'Shop Setup', icon: Edit3 },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "relative h-full flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                                    activeTab === tab.id
                                        ? "text-slate-900"
                                        : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                <tab.icon className={cn("h-3.5 w-3.5", activeTab === tab.id ? "text-slate-900" : "text-slate-400")} />
                                {tab.label}
                                {activeTab === tab.id && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900 rounded-t-full"></div>
                                )}
                            </button>
                        ))}
                        </div>
                    </div>

                    {/* Tab Content */}
                    <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden min-h-[500px]">
                        {activeTab === 'orders' && (
                            <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                                <div className="p-4 pb-4 flex items-center justify-between border-b border-slate-50">
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Recent Orders</h4>
                                    <div className="flex items-center gap-4">
                                        <div className="relative group">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Order ID..."
                                                className="pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold w-40 outline-none ring-1 ring-transparent focus:ring-primary/20"
                                            />
                                        </div>
                                        <button className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-primary transition-colors">
                                            <Download className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-50/50 border-b border-slate-50">
                                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</th>
                                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {isLoading ? (
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-8 text-center text-xs font-bold text-slate-400">
                                                        Loading orders...
                                                    </td>
                                                </tr>
                                            ) : orders.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-8 text-center text-xs font-bold text-slate-400">
                                                        No orders found for this store
                                                    </td>
                                                </tr>
                                            ) : orders.map((order) => (
                                                <tr key={order._id || order.orderId} className="group hover:bg-slate-50/50 transition-colors cursor-pointer">
                                                    <td className="px-4 py-5">
                                                        <span className="text-xs font-black text-slate-900">#{order.orderId || order._id}</span>
                                                        <p className="text-[10px] font-bold text-slate-400">
                                                            {order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-5">
                                                        <span className="text-xs font-bold text-slate-700">{order.customer?.name || 'Customer'}</span>
                                                    </td>
                                                    <td className="px-4 py-5 text-center">
                                                        <Badge
                                                            variant={getStatusVariant(getLegacyStatusFromOrder(order))}
                                                            className="text-[9px] font-black"
                                                        >
                                                            {getOrderStatusLabel(order).toUpperCase()}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-5 text-right font-black text-slate-900">
                                                        ₹{Number(order.pricing?.total || order.paymentBreakdown?.grandTotal || 0).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'transactions' && (
                            <div className="animate-in fade-in slide-in-from-right-2 duration-300 p-4">
                                <div className="flex items-center justify-between mb-8">
                                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Financial ledger</h4>
                                    <Badge variant="blue" className="text-[9px] font-black">LAST 30 DAYS</Badge>
                                </div>
                                <div className="space-y-4">
                                    {[
                                        { id: 'TXN-8821', type: 'credit', desc: 'Order #ORD-9912 Settlement', amount: 765, date: 'Today, 14:20' },
                                        { id: 'TXN-8810', type: 'debit', desc: 'Withdrawal to Bank', amount: 15000, date: 'Yesterday' },
                                        { id: 'TXN-8792', type: 'credit', desc: 'Order #ORD-9821 Settlement', amount: 405, date: 'Yesterday' },
                                        { id: 'TXN-8750', type: 'credit', desc: 'Order #ORD-9690 Settlement', amount: 135, date: '14 Feb' },
                                    ].map((txn, i) => (
                                        <div key={i} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:shadow-md transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className={cn("p-2 rounded-xl flex items-center justify-center",
                                                    txn.type === 'credit' ? "bg-brand-100 text-brand-600" : "bg-rose-100 text-rose-600"
                                                )}>
                                                    {txn.type === 'credit' ? <TrendingUp className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-slate-900">{txn.desc}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{txn.id} • {txn.date}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={cn("text-sm font-black", txn.type === 'credit' ? "text-brand-600" : "text-rose-600")}>
                                                    {txn.type === 'credit' ? '+' : '-'} ₹{txn.amount.toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'delivery' && (
                            <div className="animate-in fade-in slide-in-from-right-2 duration-300 h-[500px] relative overflow-hidden group">
                                {/* Map Background Overlay */}
                                <div className="absolute inset-0 grayscale-[0.3] contrast-[1.1] opacity-40 bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=2000')]" />
                                <div className="absolute inset-0 bg-gradient-to-tr from-slate-200/50 via-transparent to-primary/5" />

                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="relative">
                                        {/* Service Area Radar */}
                                        <motion.div
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                            className="rounded-full bg-primary/20 border-2 border-primary/40 shadow-[0_0_50px_rgba(var(--primary),0.3)] animate-pulse"
                                            style={{
                                                width: `${seller.serviceRadius * 40}px`,
                                                height: `${seller.serviceRadius * 40}px`
                                            }}
                                        />
                                        {/* Store Marker */}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                            <div className="h-10 w-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-2xl ring-4 ring-white z-10 relative">
                                                <Building2 className="h-5 w-5" />
                                            </div>
                                            <div className="absolute inset-0 bg-primary rounded-2xl animate-ping opacity-20" />
                                        </div>
                                    </div>
                                </div>

                                {/* Floating Legend */}
                                <div className="absolute top-6 left-6 flex flex-col gap-2">
                                    <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-xl shadow-lg border border-white/50">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Coverage View</p>
                                        <h5 className="text-sm font-black text-slate-900">{seller.serviceRadius}km Delivery Area</h5>
                                    </div>
                                </div>
                                <div className="absolute bottom-6 right-6 p-4 max-w-[200px] bg-slate-900/90 backdrop-blur rounded-2xl text-white shadow-2xl border border-white/10">
                                    <p className="text-[9px] font-black opacity-60 uppercase mb-1">Live Telemetry</p>
                                    <p className="text-[10px] font-bold leading-relaxed">System monitoring active traffic within the {seller.serviceRadius}km designated boundary.</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'payouts' && (
                            <div className="animate-in fade-in slide-in-from-right-2 duration-300 p-4 text-center py-20">
                                <div className="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Clock className="h-10 w-10 text-slate-200" />
                                </div>
                                <h4 className="text-lg font-black text-slate-900 uppercase">Withdrawal tracking</h4>
                                <p className="text-sm font-bold text-slate-400 mt-2 max-w-xs mx-auto">View withdrawal history and pending requests here.</p>
                                <button className="mt-8 px-4 py-3 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:-translate-y-1 shadow-xl shadow-slate-200 transition-all">
                                    START MANUAL PAYOUT
                                </button>
                            </div>
                        )}

                        {activeTab === 'info' && (
                            <div className="animate-in fade-in slide-in-from-right-2 duration-300 p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
                                    <div className="ds-section-spacing">
                                        <div>
                                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Store Identity</h5>
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <div className="h-12 w-12 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                                                        <Building2 className="h-6 w-6" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-slate-900">{seller.shopName}</p>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{seller.id}</p>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Business model</p>
                                                        <p className="text-xs font-black text-slate-900 capitalize">{businessModelData?.businessModel || 'Not set'}</p>
                                                    </div>
                                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Commission</p>
                                                        <p className="text-xs font-black text-slate-900 mb-3">{commissionLabel}</p>
                                                        {businessModelData?.businessModel === 'commission' && (
                                                            <div className="space-y-2">
                                                                <select
                                                                    className="w-full text-xs border rounded-lg px-2 py-1.5"
                                                                    value={commissionForm.scope}
                                                                    onChange={(e) => setCommissionForm((f) => ({ ...f, scope: e.target.value }))}
                                                                >
                                                                    <option value="category">Category rates</option>
                                                                    <option value="seller">Seller-wise override</option>
                                                                </select>
                                                                {commissionForm.scope === 'seller' && (
                                                                    <>
                                                                        <select
                                                                            className="w-full text-xs border rounded-lg px-2 py-1.5"
                                                                            value={commissionForm.type}
                                                                            onChange={(e) => setCommissionForm((f) => ({ ...f, type: e.target.value }))}
                                                                        >
                                                                            <option value="percentage">Percentage</option>
                                                                            <option value="fixed">Fixed</option>
                                                                        </select>
                                                                        <input
                                                                            type="number"
                                                                            min={0}
                                                                            className="w-full text-xs border rounded-lg px-2 py-1.5"
                                                                            value={commissionForm.value}
                                                                            onChange={(e) => setCommissionForm((f) => ({ ...f, value: Number(e.target.value) }))}
                                                                        />
                                                                    </>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={saveCommissionConfig}
                                                                    className="w-full py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase"
                                                                >
                                                                    Save commission
                                                                </button>
                                                            </div>
                                                        )}
                                                        <div className="mt-4 border-t pt-3 space-y-2">
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Shop-level commission</p>
                                                            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={shopCommissionForm.applyCommission}
                                                                    onChange={(e) =>
                                                                        setShopCommissionForm((f) => ({
                                                                            ...f,
                                                                            applyCommission: e.target.checked,
                                                                        }))
                                                                    }
                                                                />
                                                                Apply at shop level
                                                            </label>
                                                            <select
                                                                className="w-full text-xs border rounded-lg px-2 py-1.5"
                                                                value={shopCommissionForm.adminCommissionType}
                                                                onChange={(e) =>
                                                                    setShopCommissionForm((f) => ({
                                                                        ...f,
                                                                        adminCommissionType: e.target.value,
                                                                    }))
                                                                }
                                                            >
                                                                <option value="percentage">Percentage</option>
                                                                <option value="fixed">Fixed</option>
                                                            </select>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                className="w-full text-xs border rounded-lg px-2 py-1.5"
                                                                value={shopCommissionForm.adminCommissionValue}
                                                                onChange={(e) =>
                                                                    setShopCommissionForm((f) => ({
                                                                        ...f,
                                                                        adminCommissionValue: Number(e.target.value || 0),
                                                                    }))
                                                                }
                                                            />
                                                            {shopCommissionForm.adminCommissionType === 'fixed' && (
                                                                <select
                                                                    className="w-full text-xs border rounded-lg px-2 py-1.5"
                                                                    value={shopCommissionForm.adminCommissionFixedRule}
                                                                    onChange={(e) =>
                                                                        setShopCommissionForm((f) => ({
                                                                            ...f,
                                                                            adminCommissionFixedRule: e.target.value,
                                                                        }))
                                                                    }
                                                                >
                                                                    <option value="per_qty">Per qty</option>
                                                                    <option value="per_item">Per item</option>
                                                                </select>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={saveShopCommission}
                                                                className="w-full py-2 bg-brand-600 text-white rounded-lg text-[10px] font-black uppercase"
                                                            >
                                                                Save shop commission
                                                            </button>
                                                            <p className="text-[10px] font-bold text-slate-400 leading-relaxed">
                                                                Effective precedence: Add-on &gt; Product &gt; Subcategory &gt; Shop &gt; City.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Joined</p>
                                                        <p className="text-xs font-black text-slate-900">{seller.joinedDate}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Bank Verification</h5>
                                            <div className="p-6 bg-brand-50/50 rounded-xl border border-brand-100 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs font-bold text-slate-600">Account Verified</p>
                                                    <CheckCircle2 className="h-4 w-4 text-brand-500" />
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-brand-700/50 uppercase tracking-widest mb-1">Settlement Account</p>
                                                    <p className="text-sm font-black text-slate-900">{seller.bankInfo.bankName}</p>
                                                    <p className="text-xs font-bold text-slate-500 font-mono mt-0.5">{seller.bankInfo.accountNo}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="ds-section-spacing">
                                        <div>
                                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Operational Status</h5>
                                            <div className="p-6 bg-slate-900 rounded-xl text-white">
                                                <div className="flex items-center justify-between mb-6">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-2 w-2 rounded-full bg-brand-500 animate-pulse"></div>
                                                        <span className="text-[10px] font-black uppercase tracking-widest">LIVE NOW</span>
                                                    </div>
                                                    <button className="text-[10px] font-black text-rose-400 uppercase hover:underline">Force Close</button>
                                                </div>
                                                <div className="space-y-4 opacity-70">
                                                    <div className="flex items-center justify-between py-2 border-b border-white/10">
                                                        <span className="text-xs font-bold">Visibility</span>
                                                        <span className="text-xs font-black uppercase tracking-widest">Global</span>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-xs font-bold">Delivery Partner</span>
                                                        <span className="text-xs font-black uppercase tracking-widest text-brand-400">Integrated</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-6 bg-rose-50 rounded-xl border border-rose-100">
                                            <h5 className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <XCircle className="h-4 w-4" />
                                                Safety Controls
                                            </h5>
                                            <p className="text-[10px] font-bold text-slate-500 leading-relaxed">Suspend this store immediately from the consumer app in case of policy violations.</p>
                                            <button className="w-full mt-4 py-3 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all">
                                                SUSPEND STORE
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'products' && (
                            <div className="p-6 animate-in fade-in slide-in-from-right-2 duration-300">
                                <div className="border-b border-slate-100 pb-5 mb-5 flex items-center justify-between">
                                    <div>
                                        <h4 className="text-base font-bold text-slate-900 tracking-tight">
                                            Products from this Seller
                                        </h4>
                                        <p className="text-[13px] text-slate-500 mt-1 font-medium">
                                            {sellerProductsTotal} product{sellerProductsTotal === 1 ? '' : 's'} <span className="px-1 opacity-40">•</span> Edit any product directly on behalf of this seller.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/admin/products?newForSeller=${id}`)}
                                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-all shadow-sm flex items-center gap-2"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        Add Product
                                    </button>
                                </div>

                                {isLoadingSellerProducts ? (
                                    <div className="flex items-center justify-center py-16">
                                        <RotateCw className="h-6 w-6 text-slate-300 animate-spin" />
                                    </div>
                                ) : sellerProductsList.length === 0 ? (
                                    <p className="text-sm text-slate-500 text-center py-12">No products found for this seller yet.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {sellerProductsList.map((product) => (
                                            <div key={product._id} className="flex items-center gap-4 p-3 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all">
                                                <div className="h-12 w-12 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
                                                    {product.mainImage ? (
                                                        <img src={product.mainImage} alt={product.name} className="w-full h-full object-cover" />
                                                    ) : null}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-800 truncate">{product.name}</p>
                                                    <p className="text-[10px] text-slate-500 font-medium">₹{product.price} · Stock: {product.stock}</p>
                                                </div>
                                                <Badge variant={product.status === 'active' ? 'success' : 'gray'} className="text-[9px] px-1.5 py-0">
                                                    {product.status === 'active' ? 'Active' : 'Draft'}
                                                </Badge>
                                                <Badge
                                                    variant={product.approvalStatus === 'rejected' ? 'error' : product.approvalStatus === 'pending' ? 'warning' : 'success'}
                                                    className="text-[9px] px-1.5 py-0"
                                                >
                                                    {product.approvalStatus || 'approved'}
                                                </Badge>
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/admin/products?edit=${product._id}`)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all shrink-0"
                                                >
                                                    Edit
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {sellerProductsTotal > 0 && (
                                    <div className="pt-4 mt-4 border-t border-slate-100">
                                        <Pagination
                                            page={sellerProductsPage}
                                            totalPages={Math.ceil(sellerProductsTotal / sellerProductsPageSize) || 1}
                                            total={sellerProductsTotal}
                                            pageSize={sellerProductsPageSize}
                                            onPageChange={(p) => setSellerProductsPage(p)}
                                            onPageSizeChange={(newSize) => {
                                                setSellerProductsPageSize(newSize);
                                                setSellerProductsPage(1);
                                            }}
                                            loading={isLoadingSellerProducts}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'delivery-policy' && (
                            <div className="p-6 animate-in fade-in slide-in-from-right-2 duration-300">
                                <div className="border-b border-slate-100 pb-4 mb-6 flex items-center justify-between">
                                    <div>
                                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                                            Delivery Mode & Logistics Policy
                                        </h4>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Control how this seller fulfills orders and whether platform riders can serve their store.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSaveDeliveryPolicy}
                                        disabled={isSavingDeliveryPolicy || isLoadingDeliveryPolicy}
                                        className="px-6 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all shadow-md disabled:opacity-60"
                                    >
                                        {isSavingDeliveryPolicy ? 'Saving…' : 'Save Delivery Policy'}
                                    </button>
                                </div>

                                {isLoadingDeliveryPolicy ? (
                                    <div className="flex items-center justify-center py-16">
                                        <RotateCw className="h-6 w-6 text-slate-300 animate-spin" />
                                    </div>
                                ) : (
                                    <div className="space-y-5 max-w-xl">
                                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-bold text-amber-900">Platform Logistics Enabled (Admin Override)</p>
                                                <p className="text-[10px] text-amber-700 mt-0.5">Master switch — when off, platform riders will never be dispatched to this store regardless of the toggles below.</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(deliveryPolicyForm.platformLogisticsEnabledByAdmin)}
                                                onChange={(e) => setDeliveryPolicyForm({ ...deliveryPolicyForm, platformLogisticsEnabledByAdmin: e.target.checked })}
                                                className="h-5 w-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 shrink-0"
                                            />
                                        </div>

                                        <div className="space-y-3">
                                            {[
                                                ['customerPickup', 'Customer Pickup'],
                                                ['sellerDelivery', 'Seller Self Delivery'],
                                                ['platformLogistics', 'Platform Logistics'],
                                                ['autoSwitchToPlatform', 'Auto-switch to platform when seller unavailable'],
                                            ].map(([key, label]) => (
                                                <label key={key} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(deliveryPolicyForm[key])}
                                                        onChange={(e) => setDeliveryPolicyForm({ ...deliveryPolicyForm, [key]: e.target.checked })}
                                                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                                    />
                                                    <span className="text-xs font-bold text-slate-700">{label}</span>
                                                </label>
                                            ))}
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1">Same-day order cutoff</label>
                                            <input
                                                type="time"
                                                value={deliveryPolicyForm.sameDayCutoffTime}
                                                onChange={(e) => setDeliveryPolicyForm({ ...deliveryPolicyForm, sameDayCutoffTime: e.target.value })}
                                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none max-w-[200px]"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'shop-setup' && (
                            <div className="p-6 animate-in fade-in slide-in-from-right-2 duration-300">
                                <div className="border-b border-slate-100 pb-4 mb-6 flex items-center justify-between">
                                    <div>
                                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                                            Super Admin Shop Setup & Profile Management
                                        </h4>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Configure store profile details, location, packaging charges, and settlement bank info on behalf of the seller.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSaveShopSetup}
                                        disabled={isSavingShopSetup}
                                        className="px-6 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all shadow-md disabled:opacity-60"
                                    >
                                        {isSavingShopSetup ? 'Saving Changes...' : 'Save Shop Setup'}
                                    </button>
                                </div>

                                <form onSubmit={handleSaveShopSetup} className="space-y-6">
                                    {/* Store Details */}
                                    <div className="space-y-4">
                                        <h5 className="text-xs font-black text-brand-700 uppercase tracking-wider bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                                            Store Basic Profile
                                        </h5>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Shop Name</label>
                                                <input
                                                    type="text"
                                                    value={shopSetupForm.shopName}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, shopName: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                                                <select
                                                    value={shopSetupForm.category}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, category: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none cursor-pointer"
                                                >
                                                    {headerCategories.map((cat) => (
                                                        <option key={cat} value={cat}>
                                                            {cat}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                                                <textarea
                                                    rows={3}
                                                    value={shopSetupForm.description}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, description: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Location Details */}
                                    <div className="space-y-4 pt-2 border-t border-slate-100">
                                        <div className="flex items-center justify-between">
                                            <h5 className="text-xs font-black text-brand-700 uppercase tracking-wider bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                                                Location & Delivery Radius
                                            </h5>
                                            <button
                                                type="button"
                                                onClick={() => setIsMapOpen(true)}
                                                className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                                            >
                                                <MapPin className="h-4 w-4 text-emerald-600" />
                                                <span>{shopSetupForm.lat ? 'Re-pin on Google Maps' : 'Pin / Auto-Search on Google Maps'}</span>
                                            </button>
                                        </div>

                                        {shopSetupForm.lat && (
                                            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="success" className="text-[10px] font-black uppercase tracking-wider">Pinned</Badge>
                                                    <span className="font-semibold text-emerald-900 truncate">
                                                        Lat: {shopSetupForm.lat?.toFixed(5)}, Lng: {shopSetupForm.lng?.toFixed(5)}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] font-bold text-emerald-700">Radius: {shopSetupForm.serviceRadius} km</span>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Street Address</label>
                                                <input
                                                    type="text"
                                                    value={shopSetupForm.address}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, address: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Locality</label>
                                                <input
                                                    type="text"
                                                    value={shopSetupForm.locality}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, locality: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">City</label>
                                                <input
                                                    type="text"
                                                    value={shopSetupForm.city}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, city: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Pincode</label>
                                                <input
                                                    type="text"
                                                    value={shopSetupForm.pincode}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, pincode: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Service Radius (km)</label>
                                                <input
                                                    type="number"
                                                    value={shopSetupForm.serviceRadius}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, serviceRadius: Number(e.target.value) })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Plan & Monetization Setup (Subscription vs Shop-wise Commission) */}
                                    <div className="space-y-4 pt-2 border-t border-slate-100">
                                        <h5 className="text-xs font-black text-brand-700 uppercase tracking-wider bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                                            Plan & Monetization Setup (Subscription vs Commission)
                                        </h5>
                                        
                                        <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                                            {/* Model Type Selector Tabs */}
                                            <div className="grid grid-cols-2 gap-2 bg-slate-200/60 p-1 rounded-xl">
                                                <button
                                                    type="button"
                                                    onClick={() => setShopSetupForm((prev) => ({ ...prev, businessModel: "commission" }))}
                                                    className={cn(
                                                        "py-2 px-3 rounded-lg text-xs font-bold transition-all text-center",
                                                        shopSetupForm.businessModel === "commission"
                                                            ? "bg-white text-brand-700 shadow-sm"
                                                            : "text-slate-600 hover:text-slate-900"
                                                    )}
                                                >
                                                    Commission Based
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShopSetupForm((prev) => ({ ...prev, businessModel: "subscription" }))}
                                                    className={cn(
                                                        "py-2 px-3 rounded-lg text-xs font-bold transition-all text-center",
                                                        shopSetupForm.businessModel === "subscription"
                                                            ? "bg-white text-brand-700 shadow-sm"
                                                            : "text-slate-600 hover:text-slate-900"
                                                    )}
                                                >
                                                    Subscription Plan
                                                </button>
                                            </div>

                                            {shopSetupForm.businessModel === "commission" ? (
                                                <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={shopSetupForm.applyCommission}
                                                                onChange={(e) => setShopSetupForm((prev) => ({ ...prev, applyCommission: e.target.checked }))}
                                                                className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                                                            />
                                                            <span className="text-xs font-bold text-slate-800">Apply Shop-wise Custom Commission Rate</span>
                                                        </label>
                                                        <span className="text-[10px] font-semibold text-slate-500">Overrides Global Defaults</span>
                                                    </div>

                                                    {shopSetupForm.applyCommission && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                                                            <div>
                                                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Commission Type</label>
                                                                <select
                                                                    value={shopSetupForm.adminCommissionType}
                                                                    onChange={(e) => setShopSetupForm((prev) => ({ ...prev, adminCommissionType: e.target.value }))}
                                                                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                                                                >
                                                                    <option value="percentage">Percentage (%)</option>
                                                                    <option value="fixed">Fixed Amount (₹)</option>
                                                                </select>
                                                            </div>

                                                            <div>
                                                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                                                    Rate ({shopSetupForm.adminCommissionType === "percentage" ? "%" : "₹"})
                                                                </label>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    step={shopSetupForm.adminCommissionType === "percentage" ? 0.5 : 1}
                                                                    value={shopSetupForm.adminCommissionValue}
                                                                    onChange={(e) => setShopSetupForm((prev) => ({ ...prev, adminCommissionValue: Number(e.target.value) }))}
                                                                    placeholder="e.g. 10"
                                                                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500"
                                                                />
                                                            </div>

                                                            {shopSetupForm.adminCommissionType === "fixed" && (
                                                                <div>
                                                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Rule Precedence</label>
                                                                    <select
                                                                        value={shopSetupForm.adminCommissionFixedRule}
                                                                        onChange={(e) => setShopSetupForm((prev) => ({ ...prev, adminCommissionFixedRule: e.target.value }))}
                                                                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                                                                    >
                                                                        <option value="per_qty">Per Item Qty</option>
                                                                        <option value="per_item">Per Item</option>
                                                                    </select>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
                                                    <label className="block text-xs font-bold text-slate-800 mb-1">Choose Active Subscription Plan</label>
                                                    <select
                                                        value={shopSetupForm.subscriptionPlanId}
                                                        onChange={(e) => setShopSetupForm((prev) => ({ ...prev, subscriptionPlanId: e.target.value }))}
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-brand-500 outline-none cursor-pointer"
                                                    >
                                                        <option value="" disabled>-- Select Subscription Plan --</option>
                                                        {subscriptionPlans.map((plan) => (
                                                            <option key={plan._id || plan.id} value={plan._id || plan.id}>
                                                                {plan.name} — ₹{plan.price} / {plan.billingCycle || `${plan.durationDays} days`} ({plan.shopCount} shops, {plan.productCountPerShop} products/shop)
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Storefront Media */}
                                    <div className="space-y-4 pt-2 border-t border-slate-100">
                                        <h5 className="text-xs font-black text-brand-700 uppercase tracking-wider bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                                            Storefront Media
                                        </h5>
                                        <div>
                                            <p className="text-xs font-bold text-slate-700 mb-2">Store Logo</p>
                                            <div className="flex items-center gap-4">
                                                <div className="h-16 w-16 rounded-full overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0">
                                                    {shopSetupForm.logoUrl ? (
                                                        <img src={shopSetupForm.logoUrl} alt="Store logo" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <ImageIcon className="h-5 w-5 text-slate-300" />
                                                    )}
                                                </div>
                                                <label className="cursor-pointer bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-4 py-2 text-[11px] font-black tracking-wide text-slate-700 transition-colors">
                                                    {shopSetupForm.logoUrl ? 'Change Logo' : 'Upload Logo'}
                                                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                                </label>
                                                {shopSetupForm.logoUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShopSetupForm((prev) => ({ ...prev, logoUrl: '' }))}
                                                        className="text-[11px] font-bold text-red-500 hover:text-red-600"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-700 mb-2">Carousel Banners (up to 5)</p>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                {shopSetupForm.banners.map((banner, index) => (
                                                    <div key={index} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-[21/9] bg-slate-50">
                                                        <img src={banner} alt={`Banner ${index + 1}`} className="w-full h-full object-cover" />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveBanner(index)}
                                                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                                        >
                                                            <Trash2 className="h-5 w-5 text-white" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {shopSetupForm.banners.length < 5 && (
                                                    <label className="border-2 border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 rounded-xl aspect-[21/9] flex flex-col items-center justify-center cursor-pointer transition-all">
                                                        <Plus className="h-5 w-5 text-slate-500 mb-1" />
                                                        <span className="text-[10px] font-bold text-slate-500">Add Banner</span>
                                                        <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                                                    </label>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                                                <Video className="h-3.5 w-3.5 text-brand-600" /> Store Promotional Video URL
                                            </label>
                                            <input
                                                type="text"
                                                value={shopSetupForm.storeVideo}
                                                onChange={(e) => setShopSetupForm({ ...shopSetupForm, storeVideo: e.target.value })}
                                                placeholder="e.g., https://www.youtube.com/watch?v=..."
                                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                            />
                                            {shopSetupForm.storeVideo && (
                                                <div className="mt-3 rounded-xl overflow-hidden aspect-video bg-slate-100 border border-slate-200 max-w-md">
                                                    {shopSetupForm.storeVideo.includes('youtube.com') || shopSetupForm.storeVideo.includes('youtu.be') ? (
                                                        <iframe
                                                            className="w-full h-full"
                                                            src={getVideoEmbedUrl(shopSetupForm.storeVideo)}
                                                            title="Store Promotional Video"
                                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                            allowFullScreen
                                                        ></iframe>
                                                    ) : (
                                                        <video src={shopSetupForm.storeVideo} controls className="w-full h-full object-contain" />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Discovery Controls */}
                                    <div className="space-y-4 pt-2 border-t border-slate-100">
                                        <h5 className="text-xs font-black text-brand-700 uppercase tracking-wider bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                                            Discovery Controls
                                        </h5>
                                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer max-w-xl">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(shopSetupForm.excludeFromAlternatives)}
                                                onChange={(e) => setShopSetupForm({ ...shopSetupForm, excludeFromAlternatives: e.target.checked })}
                                                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                            />
                                            <span>
                                                <span className="block text-xs font-bold text-slate-700">Exclude from "Other stores near you" suggestions</span>
                                                <span className="block text-[10px] text-slate-400 font-medium mt-0.5">When another nearby store is closed, this store will never be suggested as an alternative.</span>
                                            </span>
                                        </label>
                                    </div>

                                    {/* Scheduling & Future Orders */}
                                    <div className="space-y-4 pt-2 border-t border-slate-100">
                                        <h5 className="text-xs font-black text-brand-700 uppercase tracking-wider bg-brand-50/60 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                                            <Clock className="h-3.5 w-3.5" /> Scheduling &amp; Future Orders
                                        </h5>
                                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer max-w-xl">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(shopSetupForm.schedulingSettings?.enabled)}
                                                onChange={(e) => setShopSetupForm({
                                                    ...shopSetupForm,
                                                    schedulingSettings: { ...shopSetupForm.schedulingSettings, enabled: e.target.checked },
                                                })}
                                                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                            />
                                            <span>
                                                <span className="block text-xs font-bold text-slate-700">Allow customers to schedule future deliveries</span>
                                                <span className="block text-[10px] text-slate-400 font-medium mt-0.5">When off, customers can only order for the soonest available delivery from this store.</span>
                                            </span>
                                        </label>

                                        {shopSetupForm.schedulingSettings?.enabled && (
                                            <div className="space-y-4 pl-1">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">Max Days Ahead</label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="90"
                                                            value={shopSetupForm.schedulingSettings?.maxDaysAhead ?? 30}
                                                            onChange={(e) => setShopSetupForm({
                                                                ...shopSetupForm,
                                                                schedulingSettings: { ...shopSetupForm.schedulingSettings, maxDaysAhead: Number(e.target.value) },
                                                            })}
                                                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                                        />
                                                        <p className="text-[10px] text-slate-400 font-medium mt-1">How far in advance a customer can pick a delivery date.</p>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">Reschedule Cutoff (days)</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="7"
                                                            value={shopSetupForm.schedulingSettings?.rescheduleCutoffDays ?? 1}
                                                            onChange={(e) => setShopSetupForm({
                                                                ...shopSetupForm,
                                                                schedulingSettings: { ...shopSetupForm.schedulingSettings, rescheduleCutoffDays: Number(e.target.value) },
                                                            })}
                                                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                                        />
                                                        <p className="text-[10px] text-slate-400 font-medium mt-1">How close to the delivery date a reschedule is still allowed.</p>
                                                    </div>
                                                </div>

                                                <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer max-w-xl">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(shopSetupForm.schedulingSettings?.selfLogistics)}
                                                        onChange={(e) => setShopSetupForm({
                                                            ...shopSetupForm,
                                                            schedulingSettings: { ...shopSetupForm.schedulingSettings, selfLogistics: e.target.checked },
                                                        })}
                                                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                                    />
                                                    <span>
                                                        <span className="block text-xs font-bold text-slate-700">Seller self-logistics</span>
                                                        <span className="block text-[10px] text-slate-400 font-medium mt-0.5">This seller delivers scheduled orders themselves instead of the platform's delivery fleet.</span>
                                                    </span>
                                                </label>

                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <p className="text-xs font-bold text-slate-700">Delivery Windows</p>
                                                        <button
                                                            type="button"
                                                            onClick={handleAddDeliveryWindow}
                                                            className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-700"
                                                        >
                                                            <Plus className="h-3.5 w-3.5" /> Add Window
                                                        </button>
                                                    </div>
                                                    {(shopSetupForm.schedulingSettings?.deliveryWindows || []).length === 0 ? (
                                                        <p className="text-[11px] text-slate-400 font-medium">No delivery windows configured — customers won't see any time-slot options while scheduling is on.</p>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {shopSetupForm.schedulingSettings.deliveryWindows.map((window, index) => (
                                                                <div key={index} className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/60">
                                                                    <input
                                                                        type="text"
                                                                        value={window.label}
                                                                        onChange={(e) => handleUpdateDeliveryWindow(index, 'label', e.target.value)}
                                                                        placeholder="Label, e.g. 9 AM - 12 PM"
                                                                        className="flex-1 min-w-[140px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:ring-2 focus:ring-brand-500"
                                                                    />
                                                                    <input
                                                                        type="time"
                                                                        value={window.start}
                                                                        onChange={(e) => handleUpdateDeliveryWindow(index, 'start', e.target.value)}
                                                                        className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:ring-2 focus:ring-brand-500"
                                                                    />
                                                                    <span className="text-[10px] text-slate-400">to</span>
                                                                    <input
                                                                        type="time"
                                                                        value={window.end}
                                                                        onChange={(e) => handleUpdateDeliveryWindow(index, 'end', e.target.value)}
                                                                        className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:ring-2 focus:ring-brand-500"
                                                                    />
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={window.capacityPerDay}
                                                                        onChange={(e) => handleUpdateDeliveryWindow(index, 'capacityPerDay', Number(e.target.value))}
                                                                        title="Capacity per day"
                                                                        className="w-20 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:ring-2 focus:ring-brand-500"
                                                                    />
                                                                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={Boolean(window.enabled)}
                                                                            onChange={(e) => handleUpdateDeliveryWindow(index, 'enabled', e.target.checked)}
                                                                            className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                                                        />
                                                                        On
                                                                    </label>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveDeliveryWindow(index)}
                                                                        className="p-1.5 text-red-400 hover:text-red-600 transition-colors"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Packaging & Charges */}
                                    <div className="space-y-4 pt-2 border-t border-slate-100">
                                        <h5 className="text-xs font-black text-brand-700 uppercase tracking-wider bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                                            Packaging Charges
                                        </h5>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Packaging Charge (₹)</label>
                                                <input
                                                    type="number"
                                                    value={shopSetupForm.packagingCharge}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, packagingCharge: Number(e.target.value) })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                                />
                                            </div>
                                            <div className="pt-4">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={shopSetupForm.packagingChargeEnabled}
                                                        onChange={(e) => setShopSetupForm({ ...shopSetupForm, packagingChargeEnabled: e.target.checked })}
                                                        className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                                                    />
                                                    <span className="text-xs font-bold text-slate-700">Enable Packaging Charge for Customers</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bank Account Details */}
                                    <div className="space-y-4 pt-2 border-t border-slate-100">
                                        <h5 className="text-xs font-black text-brand-700 uppercase tracking-wider bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                                            Settlement Bank Account Details
                                        </h5>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Bank Name</label>
                                                <input
                                                    type="text"
                                                    value={shopSetupForm.bankName}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, bankName: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Account Holder Name</label>
                                                <input
                                                    type="text"
                                                    value={shopSetupForm.accountHolder}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, accountHolder: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Account Number</label>
                                                <input
                                                    type="text"
                                                    value={shopSetupForm.accountNumber}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, accountNumber: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">IFSC Code</label>
                                                <input
                                                    type="text"
                                                    value={shopSetupForm.ifsc}
                                                    onChange={(e) => setShopSetupForm({ ...shopSetupForm, ifsc: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none uppercase"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end pt-4 border-t border-slate-100">
                                        <button
                                            type="submit"
                                            disabled={isSavingShopSetup}
                                            className="px-6 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all shadow-md disabled:opacity-60"
                                        >
                                            {isSavingShopSetup ? 'Saving Changes...' : 'Save Shop Setup'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Sidebar Context */}
                <div className="space-y-6 mt-1">
                    {/* Owner Card */}
                    <Card className="p-6 border border-slate-200 shadow-sm bg-white rounded-2xl text-left overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-slate-100 to-transparent rounded-bl-full opacity-60 z-0 pointer-events-none"></div>
                        <div className="relative z-10 flex flex-col items-center text-center pb-6 border-b border-slate-100 mb-6">
                            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm ring-1 ring-slate-100 mb-3">
                                <User className="h-7 w-7 text-slate-400" />
                            </div>
                            <h4 className="text-lg font-bold text-slate-900 tracking-tight">{seller.ownerName}</h4>
                            <span className="inline-block mt-1 px-2.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded-md uppercase tracking-wider">Partner Manager</span>
                        </div>

                        <div className="relative z-10 space-y-4">
                            <div className="flex items-center gap-3 text-slate-600 hover:text-slate-900 transition-colors group cursor-pointer">
                                <div className="h-8 w-8 flex items-center justify-center bg-slate-50 text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700 rounded-lg transition-colors border border-slate-100 group-hover:border-slate-200">
                                    <Mail className="h-3.5 w-3.5" />
                                </div>
                                <span className="text-[13px] font-medium truncate">{seller.email}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-600 hover:text-slate-900 transition-colors group cursor-pointer">
                                <div className="h-8 w-8 flex items-center justify-center bg-slate-50 text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700 rounded-lg transition-colors border border-slate-100 group-hover:border-slate-200">
                                    <Phone className="h-3.5 w-3.5" />
                                </div>
                                <span className="text-[13px] font-medium">{seller.phone}</span>
                            </div>
                            <div className="flex items-start gap-3 text-slate-600 hover:text-slate-900 transition-colors group">
                                <div className="h-8 w-8 flex items-center justify-center bg-slate-50 text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700 rounded-lg shrink-0 mt-0.5 border border-slate-100 group-hover:border-slate-200 transition-colors">
                                    <MapPin className="h-3.5 w-3.5" />
                                </div>
                                <span className="text-[13px] font-medium leading-relaxed">{seller.location}</span>
                            </div>
                        </div>

                        <button className="w-full relative z-10 mt-8 py-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm">
                            Message Owner
                        </button>
                    </Card>

                    {/* Quick Notifications */}
                    <Card className="p-5 border border-slate-200 bg-slate-900 shadow-md rounded-2xl text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-white/10 to-transparent rounded-bl-full pointer-events-none"></div>
                        <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-4">Strategic Comms</h4>
                        <div className="space-y-4">
                            <p className="text-[13px] text-slate-400 leading-relaxed font-medium">Send a top-priority push notification directly to the shop manager's device.</p>
                            <textarea
                                placeholder="Write message..."
                                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 text-[13px] text-white placeholder-slate-500 font-medium outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50 transition-all min-h-[90px] resize-none"
                            />
                            <button className="w-full py-2.5 bg-white text-slate-900 rounded-xl text-xs font-bold hover:bg-slate-50 shadow-lg shadow-white/5 transition-all">
                                Send Alert
                            </button>
                        </div>
                    </Card>
                </div>
            </div>

            {isMapOpen && (
                <MapPicker
                    isOpen={isMapOpen}
                    onClose={() => setIsMapOpen(false)}
                    onConfirm={handleLocationSelect}
                    initialLocation={
                        shopSetupForm.lat ? { lat: shopSetupForm.lat, lng: shopSetupForm.lng } : null
                    }
                    initialRadius={shopSetupForm.serviceRadius || 5}
                />
            )}
        </div>
    );
};

export default SellerDetail;
