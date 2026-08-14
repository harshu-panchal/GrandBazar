import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Pagination from "@shared/components/ui/Pagination";
import {
  HiOutlineBuildingOffice2,
  HiOutlineMagnifyingGlass,
  HiOutlineFunnel,
  HiOutlineEnvelope,
  HiOutlinePhone,
  HiOutlineCalendarDays,
  HiOutlineArrowTrendingUp,
  HiOutlineMapPin,
  HiOutlineXMark,
  HiOutlineEye,
  HiOutlineClock,
  HiOutlineArrowPath,
  HiOutlineDocumentText,
  HiOutlinePlus,
  HiOutlineArrowUpTray,
  HiOutlinePencilSquare,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";
import MapPicker from "@/shared/components/MapPicker";

const SORT_OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Shop name A-Z" },
  { value: "name_desc", label: "Shop name Z-A" },
  { value: "revenue_desc", label: "Highest revenue" },
  { value: "orders_desc", label: "Most orders" },
  { value: "products_desc", label: "Most products" },
];

const currency = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const statClass = {
  blue: "bg-brand-50 text-brand-600",
  emerald: "bg-brand-50 text-brand-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
};

const emptyStats = {
  totalActiveSellers: 0,
  totalOrders: 0,
  totalRevenue: 0,
  newThisMonth: 0,
  highVolume: 0,
  averageRevenuePerSeller: 0,
  averageOrdersPerSeller: 0,
};

const STANDARD_CATEGORY_OPTIONS = [
  "Grocery",
  "Fruits & Vegetables",
  "Bakery & Dairy",
  "Meat & Fish",
  "Beverages",
  "Snacks & Branded Foods",
  "Personal Care",
  "Household Care",
  "Electronics & Appliances",
  "Fashion & Apparel",
  "Pharmacy & Health",
  "Beauty & Cosmetics",
  "Pet Care",
  "Home & Kitchen",
  "General Store"
];

const normalizeSeller = (seller) => {
  const joinedAt = seller.joinedAt || seller.createdAt || null;

  return {
    ...seller,
    totalOrders: safeNumber(seller.totalOrders),
    deliveredOrders: safeNumber(seller.deliveredOrders),
    pendingOrders: safeNumber(seller.pendingOrders),
    totalRevenue: safeNumber(seller.totalRevenue),
    productCount: safeNumber(seller.productCount),
    avgOrderValue: safeNumber(seller.avgOrderValue),
    fulfillmentRate: safeNumber(seller.fulfillmentRate),
    serviceRadius: safeNumber(seller.serviceRadius) || 5,
    ownerAccountApproved: seller.ownerAccountApproved !== false,
    ownerAccountStatus: seller.ownerAccountStatus || "approved",
    ownerAccountId: seller.ownerAccountId || "",
    ownerRejectionReason: seller.ownerRejectionReason || "",
    joinedDate: joinedAt
      ? new Date(joinedAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "N/A",
    lastOrderLabel: seller.lastOrderAt
      ? new Date(seller.lastOrderAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "No orders yet",
    location: seller.location || "Location not set",
    avatar:
      seller.avatar ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
        seller.shopName || seller.ownerName || seller.email || "seller",
      )}`,
  };
};

const ActiveSellers = () => {
  const navigate = useNavigate();
  const requestSeq = useRef(0);

  const [sellers, setSellers] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [categories, setCategories] = useState([]);
  const [dbCategories, setDbCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [selectedSellerDetails, setSelectedSellerDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isReactivatingOwner, setIsReactivatingOwner] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingVendor, setIsCreatingVendor] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);

  const INITIAL_CREATE_FORM = {
    name: "",
    email: "",
    phone: "",
    password: "",
    shopName: "",
    category: "Grocery",
    categories: "",
    description: "",
    address: "",
    locality: "",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "",
    serviceRadius: 5,
    lat: null,
    lng: null,
    aadharNumber: "",
    aadharDoc: "",
    panNumber: "",
    panDoc: "",
    gstNumber: "",
    gstDoc: "",
    businessModel: "commission",
    applyCommission: true,
    adminCommissionType: "percentage",
    adminCommissionValue: 10,
    adminCommissionFixedRule: "per_qty",
    subscriptionPlanId: "",
    accountHolder: "",
    accountNumber: "",
    ifsc: "",
    bankName: "",
    packagingCharge: 0,
    packagingChargeEnabled: false,
    deliveryPolicy: {
      customerPickup: false,
      sellerDelivery: false,
      platformLogistics: true,
      autoSwitchToPlatform: false,
    },
  };

  const [createForm, setCreateForm] = useState(INITIAL_CREATE_FORM);

  const handleLocationSelect = (location) => {
    setCreateForm((prev) => ({
      ...prev,
      lat: location.lat,
      lng: location.lng,
      serviceRadius: location.radius || prev.serviceRadius,
      locality: location.locality || prev.locality,
      city: location.city || prev.city,
      state: location.state || prev.state,
      pincode: location.pincode || prev.pincode,
      address: location.address || prev.address,
    }));
    toast.success("Store location pinned & address details auto-filled from Google Maps!");
  };

  const handleCreateVendorSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.name || !createForm.email || !createForm.phone) {
      toast.error("Owner name, email, and phone are required");
      return;
    }
    setIsCreatingVendor(true);
    try {
      const res = await adminApi.createVendorAccount(createForm);
      toast.success(res.data?.message || "Seller account & shop created successfully! Credentials emailed.");
      setIsCreateModalOpen(false);
      setCreateForm(INITIAL_CREATE_FORM);
      setRefreshTick((v) => v + 1);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to create vendor account");
    } finally {
      setIsCreatingVendor(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, sortBy, pageSize]);

  useEffect(() => {
    const loadDbCategories = async () => {
      try {
        const res = await adminApi.getCategories({ type: "header" });
        const rawPayload = res.data?.result || res.data?.results || res.data?.data || res.data;
        const items = Array.isArray(rawPayload?.items)
          ? rawPayload.items
          : Array.isArray(rawPayload)
          ? rawPayload
          : [];

        if (Array.isArray(items) && items.length > 0) {
          const headerNames = items
            .filter((c) => !c.type || c.type === "header")
            .map((c) => (typeof c === "string" ? c : c.name))
            .filter(Boolean);
          if (headerNames.length > 0) {
            setDbCategories(headerNames);
          }
        }
      } catch (err) {
        // Fallback gracefully to standard categories
      }
    };
    loadDbCategories();
  }, []);

  const [subscriptionPlans, setSubscriptionPlans] = useState([]);

  useEffect(() => {
    const fetchSubscriptionPlans = async () => {
      try {
        const res = await adminApi.getSubscriptionPlans();
        const list = res.data?.result || res.data?.results || res.data?.data || res.data || [];
        if (Array.isArray(list)) {
          setSubscriptionPlans(list);
          if (list.length > 0) {
            setCreateForm((prev) => ({ ...prev, subscriptionPlanId: list[0]._id || list[0].id }));
          }
        }
      } catch (err) {
        // Fallback
      }
    };
    fetchSubscriptionPlans();
  }, []);

  useEffect(() => {
    if (!selectedSeller) {
      setSelectedSellerDetails(null);
      return;
    }
    const fetchSellerDetails = async () => {
      setLoadingDetails(true);
      try {
        const res = await adminApi.getActiveSellerById(selectedSeller.id || selectedSeller._id);
        const data = res.data?.result || res.data?.results || res.data || null;
        setSelectedSellerDetails(data);
      } catch (err) {
        console.error("Failed to load seller details:", err);
      } finally {
        setLoadingDetails(false);
      }
    };
    fetchSellerDetails();
  }, [selectedSeller]);

  const allCategoryOptions = useMemo(() => {
    if (dbCategories && dbCategories.length > 0) {
      return Array.from(new Set(dbCategories)).filter(Boolean);
    }
    return STANDARD_CATEGORY_OPTIONS;
  }, [dbCategories]);

  useEffect(() => {
    const currentSeq = ++requestSeq.current;

    const loadSellers = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await adminApi.getActiveSellers({
          q: debouncedSearch || undefined,
          category: categoryFilter !== "all" ? categoryFilter : undefined,
          sort: sortBy,
          page,
          limit: pageSize,
        });

        if (currentSeq !== requestSeq.current) return;

        const payload = response.data?.result || {};
        const items = Array.isArray(payload.items) ? payload.items : [];
        const normalizedItems = items.map(normalizeSeller);

        setSellers(normalizedItems);
        setStats({
          ...emptyStats,
          ...payload.stats,
        });
        setCategories(
          Array.isArray(payload.filters?.categories) ? payload.filters.categories : [],
        );
        setTotal(safeNumber(payload.total) || normalizedItems.length);
        setTotalPages(safeNumber(payload.totalPages) || 1);
        setLastSyncAt(new Date());

        if (safeNumber(payload.totalPages) > 0 && page > payload.totalPages) {
          setPage(payload.totalPages);
        }
      } catch (err) {
        if (currentSeq !== requestSeq.current) return;
        console.error("Failed to load active sellers", err);
        const message =
          err.response?.data?.message || "Failed to load active sellers";
        setError(message);
        toast.error(message);
      } finally {
        if (currentSeq === requestSeq.current) {
          setLoading(false);
        }
      }
    };

    loadSellers();
  }, [debouncedSearch, categoryFilter, sortBy, page, pageSize, refreshTick]);

  const handleReactivateOwner = async (seller) => {
    const ownerAccountId = seller?.ownerAccountId;
    if (!ownerAccountId) {
      toast.error("Owner account ID not found for this store.");
      return;
    }

    if (!window.confirm(`Reactivate seller admin account for ${seller.ownerName}? They will regain dashboard access.`)) {
      return;
    }

    setIsReactivatingOwner(true);
    try {
      await adminApi.reactivateSellerAccount(ownerAccountId);
      toast.success("Seller admin account reactivated successfully");
      setSelectedSeller(null);
      setRefreshTick((value) => value + 1);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to reactivate seller account");
    } finally {
      setIsReactivatingOwner(false);
    }
  };

  const summaryCards = useMemo(
    () => [
      {
        label: "Active Sellers",
        value: stats.totalActiveSellers.toLocaleString("en-IN"),
        icon: HiOutlineBuildingOffice2,
        color: "blue",
        note: "Verified and live",
      },
      {
        label: "Gross Revenue",
        value: currency(stats.totalRevenue),
        icon: HiOutlineArrowTrendingUp,
        color: "emerald",
        note: "Delivered order value",
      },
      {
        label: "Total Orders",
        value: stats.totalOrders.toLocaleString("en-IN"),
        icon: HiOutlineDocumentText,
        color: "amber",
        note: "Lifetime order volume",
      },
      {
        label: "New This Month",
        value: stats.newThisMonth.toLocaleString("en-IN"),
        icon: HiOutlineCalendarDays,
        color: "rose",
        note: "Recently approved",
      },
    ],
    [stats],
  );

  return (
    <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-2 duration-700 pb-16">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="ds-h1 flex items-center gap-2">
            Active Sellers
            <Badge
              variant="success"
              className="admin-tiny px-1.5 py-0 font-bold uppercase tracking-wider"
            >
              Live
            </Badge>
          </h1>
          <p className="ds-description mt-0.5">
            Review every verified seller, their performance, and current store health.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl ring-1 ring-slate-100">
            <HiOutlineClock className="h-4 w-4 text-slate-500" />
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
              {lastSyncAt
                ? `Synced ${lastSyncAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "Sync pending"}
            </span>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-brand-700 transition-all"
          >
            <HiOutlinePlus className="h-4 w-4" />
            Create Seller & Shop
          </button>
          <button
            onClick={() => setRefreshTick((value) => value + 1)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xl hover:bg-slate-800 transition-all"
          >
            <HiOutlineArrowPath className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="border-none shadow-sm ring-1 ring-slate-100 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="ds-label">{card.label}</p>
                <h4 className="ds-stat-medium mt-1">{card.value}</h4>
                <p className="text-[10px] font-semibold text-slate-400 mt-1 uppercase tracking-widest">
                  {card.note}
                </p>
              </div>
              <div
                className={cn(
                  "h-12 w-12 rounded-2xl flex items-center justify-center",
                  statClass[card.color],
                )}
              >
                <card.icon className="h-6 w-6" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="border-none shadow-xl ring-1 ring-slate-100 p-4 bg-white/80 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by store name, owner, email, phone or location..."
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-semibold outline-none ring-1 ring-transparent focus:ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="px-4 py-3 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="px-4 py-3 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              onClick={() => setRefreshTick((value) => value + 1)}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
            >
              <HiOutlineFunnel className="h-4 w-4" />
              Filter
            </button>
          </div>
        </div>
      </Card>

      <Card className="border-none shadow-xl ring-1 ring-slate-100 overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="ds-table-header-cell px-6">Store Entity</th>
                <th className="ds-table-header-cell px-6">Performance</th>
                <th className="ds-table-header-cell px-6">Business Intel</th>
                <th className="ds-table-header-cell px-6">Status</th>
                <th className="ds-table-header-cell px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <HiOutlineArrowPath className="h-8 w-8 text-slate-300 animate-spin" />
                      <p className="text-slate-500 font-bold text-sm">
                        Loading active sellers...
                      </p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="5" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-16 w-16 rounded-full bg-rose-50 flex items-center justify-center">
                        <HiOutlineXMark className="h-8 w-8 text-rose-400" />
                      </div>
                      <p className="text-sm font-bold text-slate-600">{error}</p>
                      <button
                        onClick={() => setRefreshTick((value) => value + 1)}
                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : sellers.length > 0 ? (
                sellers.map((seller) => (
                  <tr key={seller.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl overflow-hidden bg-slate-100 ring-2 ring-slate-100 flex items-center justify-center">
                          <img
                            src={seller.avatar}
                            alt={seller.shopName}
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {seller.shopName}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] font-semibold text-slate-400">
                              {seller.ownerName}
                            </span>
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                              {seller.category || "General"}
                            </span>
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span className="text-[10px] font-bold text-amber-600">
                              ★ {Number(seller.avgRating || 0).toFixed(1)}/5
                              {Number(seller.reviewCount || 0) > 0
                                ? ` · ${seller.reviewCount}`
                                : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-900">
                            {(seller.totalOrders || 0).toLocaleString("en-IN")} Orders
                          </span>
                          <span className="text-[10px] font-bold text-brand-600">
                            {currency(seller.totalRevenue)}
                          </span>
                        </div>
                        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full"
                            style={{
                              width: `${Math.min(100, seller.fulfillmentRate || 0)}%`,
                            }}
                          />
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {(seller.fulfillmentRate || 0)}% fulfillment
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-slate-700">
                          <HiOutlineDocumentText className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-[10px] font-bold">
                            {(seller.productCount || 0).toLocaleString("en-IN")} products
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700">
                          <HiOutlineMapPin className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-[10px] font-bold truncate max-w-[260px]">
                            {seller.location || "Location not set"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold">
                            Joined {seller.joinedDate || "N/A"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        <Badge
                          variant="success"
                          className="w-fit text-[8px] font-black uppercase tracking-widest"
                        >
                          Store Active
                        </Badge>
                        {seller.ownerAccountApproved ? (
                          <Badge
                            variant="success"
                            className="w-fit text-[8px] font-black uppercase tracking-widest"
                          >
                            Owner Approved
                          </Badge>
                        ) : (
                          <Badge
                            variant="error"
                            className="w-fit text-[8px] font-black uppercase tracking-widest"
                          >
                            Owner {seller.ownerAccountStatus === "rejected" ? "Rejected" : "Blocked"}
                          </Badge>
                        )}
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Last order: {seller.lastOrderLabel || "No orders yet"}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedSeller(seller)}
                          className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2"
                        >
                          <HiOutlineEye className="h-3.5 w-3.5" />
                          VIEW PROFILE
                        </button>
                        <button
                          onClick={() => navigate(`/admin/sellers/active/${seller.id}`)}
                          className="px-4 py-2.5 bg-white text-slate-700 ring-1 ring-slate-200 rounded-xl text-[10px] font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                        >
                          <HiOutlinePencilSquare className="h-3.5 w-3.5" />
                          EDIT SHOP
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center">
                        <HiOutlineBuildingOffice2 className="h-8 w-8 text-slate-200" />
                      </div>
                      <p className="text-slate-500 font-bold text-sm">
                        No active sellers found.
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Try a different search or filter.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4">
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          loading={loading}
        />
      </div>

      <AnimatePresence>
        {selectedSeller && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto" data-lenis-prevent data-lenis-prevent-wheel data-lenis-prevent-touch>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/75 backdrop-blur-md"
              onClick={() => setSelectedSeller(null)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 24 }}
              data-lenis-prevent
              data-lenis-prevent-wheel
              data-lenis-prevent-touch
              className="relative z-10 w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="flex items-start justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl overflow-hidden bg-slate-100 ring-4 ring-white shadow-lg">
                    <img
                      src={selectedSeller.avatar}
                      alt={selectedSeller.shopName}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900">
                      {selectedSeller.shopName}
                    </h3>
                    <p className="text-sm font-semibold text-slate-500">
                      Owned by {selectedSeller.ownerName}
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="success"
                        className="text-[8px] font-black uppercase tracking-widest"
                      >
                        Store Active
                      </Badge>
                      {selectedSeller.ownerAccountApproved ? (
                        <Badge
                          variant="success"
                          className="text-[8px] font-black uppercase tracking-widest"
                        >
                          Owner Approved
                        </Badge>
                      ) : (
                        <Badge
                          variant="error"
                          className="text-[8px] font-black uppercase tracking-widest"
                        >
                          Owner {selectedSeller.ownerAccountStatus === "rejected" ? "Rejected" : "Blocked"}
                        </Badge>
                      )}
                      <Badge
                        variant="primary"
                        className="text-[8px] font-black uppercase tracking-widest"
                      >
                        {selectedSeller.category || "General"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/admin/sellers/active/${selectedSeller.id}`)}
                    className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2"
                  >
                    <HiOutlinePencilSquare className="h-3.5 w-3.5" />
                    EDIT SHOP
                  </button>
                  <button
                    onClick={() => setSelectedSeller(null)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <HiOutlineXMark className="h-6 w-6 text-slate-400" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                <div className="lg:col-span-4 bg-slate-50 p-5 border-r border-slate-100">
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                        Contact
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-slate-700">
                          <HiOutlineEnvelope className="h-4 w-4 text-slate-400" />
                          <span className="text-xs font-semibold break-all">
                            {selectedSeller.email || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-700">
                          <HiOutlinePhone className="h-4 w-4 text-slate-400" />
                          <span className="text-xs font-semibold">
                            {selectedSeller.phone || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-700">
                          <HiOutlineMapPin className="h-4 w-4 text-slate-400" />
                          <span className="text-xs font-semibold leading-relaxed">
                            {selectedSeller.location || "Location not set"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                        Store Health
                      </p>
                      <div className="p-4 bg-white rounded-2xl ring-1 ring-slate-100">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                          <span>Verification</span>
                          <span className="text-brand-600">Verified</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Joined</span>
                          <span>{selectedSeller.joinedDate || "N/A"}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Service radius</span>
                          <span>{selectedSeller.serviceRadius || 5} km</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Store rating</span>
                          <span className="text-amber-600">
                            {Number(selectedSeller.avgRating || 0).toFixed(1)}/5
                            {Number(selectedSeller.reviewCount || 0) > 0
                              ? ` · ${selectedSeller.reviewCount} reviews`
                              : ""}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Favorites</span>
                          <span>{Number(selectedSeller.favoriteCount || 0)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Last order</span>
                          <span>{selectedSeller.lastOrderLabel || "No orders yet"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-8 p-5 bg-white">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    {[
                      {
                        label: "Orders",
                        value: (selectedSeller.totalOrders || 0).toLocaleString("en-IN"),
                      },
                      { label: "Revenue", value: currency(selectedSeller.totalRevenue) },
                      {
                        label: "Products",
                        value: (selectedSeller.productCount || 0).toLocaleString("en-IN"),
                      },
                      {
                        label: "Rating",
                        value: `${Number(selectedSeller.avgRating || 0).toFixed(1)}/5`,
                      },
                      {
                        label: "Delivered",
                        value: (selectedSeller.deliveredOrders || 0).toLocaleString("en-IN"),
                      },
                      {
                        label: "Pending",
                        value: (selectedSeller.pendingOrders || 0).toLocaleString("en-IN"),
                      },
                      {
                        label: "Fulfillment",
                        value: `${selectedSeller.fulfillmentRate || 0}%`,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="p-4 rounded-2xl bg-slate-50 border border-slate-100"
                      >
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          {item.label}
                        </p>
                        <p className="text-lg font-black text-slate-900">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-brand-50 border border-brand-100">
                      <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest mb-1">
                        Performance
                      </p>
                      <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                        {(selectedSeller.fulfillmentRate || 0)}% of the orders for this seller have been completed successfully.
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                        Average order value
                      </p>
                      <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                        {currency(selectedSeller.avgOrderValue)}
                      </p>
                    </div>
                  </div>

                  {/* Expanded Custom Details Cards */}
                  {selectedSellerDetails && (
                    <div className="mt-6 space-y-6 pt-6 border-t border-slate-100">
                      {/* Row 1: Monetization Plan & Bank Settlement Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Plan & Monetization Model Details */}
                        <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-brand-600" />
                            Monetization Plan
                          </h4>
                          <div className="space-y-2 pt-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-500">Business Model:</span>
                              <span className="text-slate-900 font-bold capitalize">
                                {selectedSellerDetails.businessModel || "Commission"}
                              </span>
                            </div>
                            {selectedSellerDetails.businessModel === "commission" ? (
                              <>
                                <div className="flex justify-between text-xs font-semibold">
                                  <span className="text-slate-500">Apply Commission:</span>
                                  <span className={cn("font-bold", selectedSellerDetails.applyCommission ? "text-brand-600" : "text-slate-500")}>
                                    {selectedSellerDetails.applyCommission ? "Shop-Wise Custom Rate" : "Global Categories Rate"}
                                  </span>
                                </div>
                                {selectedSellerDetails.applyCommission && (
                                  <>
                                    <div className="flex justify-between text-xs font-semibold">
                                      <span className="text-slate-500">Rate/Value:</span>
                                      <span className="text-slate-900 font-bold">
                                        {selectedSellerDetails.adminCommissionType === "fixed" ? "₹" : ""}
                                        {selectedSellerDetails.adminCommissionValue}
                                        {selectedSellerDetails.adminCommissionType === "percentage" ? "%" : ""}
                                      </span>
                                    </div>
                                    {selectedSellerDetails.adminCommissionType === "fixed" && (
                                      <div className="flex justify-between text-xs font-semibold">
                                        <span className="text-slate-500">Rule Precedence:</span>
                                        <span className="text-slate-900 font-bold capitalize">
                                          {String(selectedSellerDetails.adminCommissionFixedRule || "per_qty").replace("_", " ")}
                                        </span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </>
                            ) : (
                              <div className="flex justify-between text-xs font-semibold">
                                <span className="text-slate-500">Active Subscription:</span>
                                <span className="text-slate-900 font-bold text-emerald-600">Operational (Active)</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Settlement Bank Account Details */}
                        <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-indigo-600" />
                            Settlement Bank Details
                          </h4>
                          <div className="space-y-2 pt-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-500">Bank Name:</span>
                              <span className="text-slate-900 font-bold">
                                {selectedSellerDetails.bankInfo?.bankName || "Not Set"}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-500">Account Holder:</span>
                              <span className="text-slate-900 font-bold">
                                {selectedSellerDetails.bankInfo?.accountHolder || "Not Set"}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-500">Account Number:</span>
                              <span className="text-slate-900 font-bold">
                                {selectedSellerDetails.bankInfo?.accountNo || "Not Set"}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-500">IFSC Code:</span>
                              <span className="text-slate-900 font-bold uppercase">
                                {selectedSellerDetails.bankInfo?.ifsc || "Not Set"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Row 2: KYC Documents Verification Details */}
                      <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3.5">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-600" />
                          KYC Documents & Verification Details
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {/* Aadhaar Details Card */}
                          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-2">
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aadhaar Card</span>
                              <p className="text-xs font-bold text-slate-800 mt-0.5">
                                {selectedSellerDetails.aadharNumber || "Not Provided"}
                              </p>
                            </div>
                            {selectedSellerDetails.aadharDoc && (
                              <a
                                href={selectedSellerDetails.aadharDoc}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-bold text-brand-600 hover:text-brand-700 underline mt-2 flex items-center gap-1 w-fit"
                              >
                                View Aadhaar Doc Document
                              </a>
                            )}
                          </div>

                          {/* PAN Details Card */}
                          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-2">
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PAN Card</span>
                              <p className="text-xs font-bold text-slate-800 uppercase mt-0.5">
                                {selectedSellerDetails.panNumber || "Not Provided"}
                              </p>
                            </div>
                            {selectedSellerDetails.panDoc && (
                              <a
                                href={selectedSellerDetails.panDoc}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-bold text-brand-600 hover:text-brand-700 underline mt-2 flex items-center gap-1 w-fit"
                              >
                                View PAN Doc Document
                              </a>
                            )}
                          </div>

                          {/* GST Details Card */}
                          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-2">
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GSTIN Number</span>
                              <p className="text-xs font-bold text-slate-800 uppercase mt-0.5">
                                {selectedSellerDetails.gstNumber || "Not Provided"}
                              </p>
                            </div>
                            {selectedSellerDetails.gstDoc && (
                              <a
                                href={selectedSellerDetails.gstDoc}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-bold text-brand-600 hover:text-brand-700 underline mt-2 flex items-center gap-1 w-fit"
                              >
                                View GST Doc Document
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Row 3: Logistics Policy & Packaging Charges */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Logistics Policy Details */}
                        <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-amber-600" />
                            Logistics & Delivery Policy
                          </h4>
                          <div className="space-y-2 pt-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-500">Customer Pickup:</span>
                              <span className={cn("font-bold", selectedSellerDetails.deliveryPolicy?.customerPickup ? "text-emerald-600" : "text-slate-400")}>
                                {selectedSellerDetails.deliveryPolicy?.customerPickup ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-500">Seller Self Delivery:</span>
                              <span className={cn("font-bold", selectedSellerDetails.deliveryPolicy?.sellerDelivery ? "text-emerald-600" : "text-slate-400")}>
                                {selectedSellerDetails.deliveryPolicy?.sellerDelivery ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-500">Platform Logistics:</span>
                              <span className={cn("font-bold", selectedSellerDetails.deliveryPolicy?.platformLogistics ? "text-emerald-600" : "text-slate-400")}>
                                {selectedSellerDetails.deliveryPolicy?.platformLogistics ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-500">Auto-Switch to Platform:</span>
                              <span className={cn("font-bold", selectedSellerDetails.deliveryPolicy?.autoSwitchToPlatform ? "text-emerald-600" : "text-slate-400")}>
                                {selectedSellerDetails.deliveryPolicy?.autoSwitchToPlatform ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Packaging Charge Details */}
                        <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-rose-600" />
                            Packaging Charges
                          </h4>
                          <div className="space-y-2 pt-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-500">Status:</span>
                              <span className={cn("font-bold", selectedSellerDetails.packagingChargeEnabled ? "text-emerald-600" : "text-slate-400")}>
                                {selectedSellerDetails.packagingChargeEnabled ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                            {selectedSellerDetails.packagingChargeEnabled && (
                              <div className="flex justify-between text-xs font-semibold">
                                <span className="text-slate-500">Packaging Fee Amount:</span>
                                <span className="text-slate-900 font-bold">
                                  ₹{selectedSellerDetails.packagingCharge || 0}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {loadingDetails && (
                    <div className="mt-6 py-12 flex flex-col items-center justify-center gap-3 border-t border-slate-100 animate-pulse">
                      <HiOutlineArrowPath className="h-6 w-6 animate-spin text-brand-600" />
                      <span className="text-xs font-bold text-slate-500">Loading complete shop setup data...</span>
                    </div>
                  )}

                  {!selectedSeller.ownerAccountApproved && (
                    <div className="mt-6 rounded-2xl border border-rose-100 bg-rose-50 p-4">
                      <p className="text-sm font-bold text-rose-800">
                        Seller admin account is blocked
                      </p>
                      <p className="text-xs font-medium text-rose-700 mt-1 leading-relaxed">
                        This store is active, but the owner cannot access the seller dashboard.
                        {selectedSeller.ownerRejectionReason
                          ? ` Reason: ${selectedSeller.ownerRejectionReason}`
                          : ""}
                      </p>
                    </div>
                  )}

                  <div className="mt-6 flex items-center justify-end gap-3">
                    {!selectedSeller.ownerAccountApproved && selectedSeller.ownerAccountId ? (
                      <button
                        onClick={() => handleReactivateOwner(selectedSeller)}
                        disabled={isReactivatingOwner}
                        className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 disabled:opacity-60"
                      >
                        <HiOutlineArrowPath className={cn("h-4 w-4", isReactivatingOwner && "animate-spin")} />
                        {isReactivatingOwner ? "Reactivating..." : "Reactivate Owner Account"}
                      </button>
                    ) : null}
                    <button
                      onClick={() => setSelectedSeller(null)}
                      className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Seller & Shop Account Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto" data-lenis-prevent data-lenis-prevent-wheel data-lenis-prevent-touch>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              data-lenis-prevent
              data-lenis-prevent-wheel
              data-lenis-prevent-touch
              className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 custom-scrollbar"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <HiOutlineBuildingOffice2 className="h-5 w-5 text-brand-600" />
                    Create Seller Account & Setup Shop
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Super Admin can create a new seller account and configure their store on their behalf.
                  </p>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50"
                >
                  <HiOutlineXMark className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateVendorSubmit} className="space-y-6">
                {/* 1. Seller Owner Information */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-brand-700 mb-3 bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                    1. Seller Owner Credentials & Account
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Owner Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={createForm.name}
                        onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                        placeholder="e.g. Ramesh Kumar"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Login Email <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={createForm.email}
                        onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                        placeholder="seller@example.com"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Phone Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={createForm.phone}
                        onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                        placeholder="+91 9876543210"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Password (Optional)
                      </label>
                      <input
                        type="text"
                        value={createForm.password}
                        onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                        placeholder="Auto-generated if empty"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Shop Profile & Categories */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-brand-700 mb-3 bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                    2. Shop Profile & Category Setup
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Shop Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={createForm.shopName}
                        onChange={(e) => setCreateForm({ ...createForm, shopName: e.target.value })}
                        placeholder="e.g. Fresh Daily Organics"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Primary Category <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={createForm.category}
                        onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none cursor-pointer"
                      >
                        <option value="" disabled>Select Primary Category</option>
                        {allCategoryOptions.map((catName) => (
                          <option key={catName} value={catName}>
                            {catName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Additional Categories</label>
                      <div className="space-y-2">
                        <select
                          value=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            const currentArr = createForm.categories ? createForm.categories.split(",").map(s => s.trim()).filter(Boolean) : [];
                            if (!currentArr.includes(val)) {
                              const updated = [...currentArr, val].join(", ");
                              setCreateForm({ ...createForm, categories: updated });
                            }
                          }}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none cursor-pointer"
                        >
                          <option value="" disabled>+ Select additional category from list...</option>
                          {allCategoryOptions
                            .filter((c) => c !== createForm.category)
                            .map((catName) => (
                              <option key={catName} value={catName}>
                                + {catName}
                              </option>
                            ))}
                        </select>

                        <input
                          type="text"
                          value={createForm.categories}
                          onChange={(e) => setCreateForm({ ...createForm, categories: e.target.value })}
                          placeholder="Or type comma separated categories (e.g. Grocery, Organic Produce, Dairy)"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Shop Description</label>
                      <textarea
                        rows={2}
                        value={createForm.description}
                        onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                        placeholder="Brief overview of products and store specialization"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Shop Location & Address Details */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-brand-700 bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                      3. Shop Location & Address Details
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsMapOpen(true)}
                      className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm group cursor-pointer"
                    >
                      <HiOutlineMapPin className="h-4 w-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                      <span>{createForm.lat ? "Re-pin on Google Maps" : "Pin / Auto-Search on Google Maps"}</span>
                    </button>
                  </div>

                  {createForm.lat && (
                    <div className="mb-4 p-3 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="success" className="text-[10px] font-black uppercase tracking-wider">Pinned</Badge>
                        <span className="font-semibold text-emerald-900 truncate">
                          Lat: {createForm.lat?.toFixed(5)}, Lng: {createForm.lng?.toFixed(5)}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700">Radius: {createForm.serviceRadius} km</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Street Address / Line 1</label>
                      <input
                        type="text"
                        value={createForm.address}
                        onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                        placeholder="Store full street address"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Locality / Area</label>
                      <input
                        type="text"
                        value={createForm.locality}
                        onChange={(e) => setCreateForm({ ...createForm, locality: e.target.value })}
                        placeholder="e.g. Bandra West"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                      <input
                        type="text"
                        value={createForm.city}
                        onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                        placeholder="Mumbai, Delhi, Bangalore..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                      <input
                        type="text"
                        value={createForm.state}
                        onChange={(e) => setCreateForm({ ...createForm, state: e.target.value })}
                        placeholder="Maharashtra, Delhi, Karnataka..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Pincode (6 digits)</label>
                      <input
                        type="text"
                        maxLength={6}
                        value={createForm.pincode}
                        onChange={(e) => setCreateForm({ ...createForm, pincode: e.target.value })}
                        placeholder="400001"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Service Radius (km)</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={createForm.serviceRadius}
                        onChange={(e) => setCreateForm({ ...createForm, serviceRadius: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. KYC & Verification (Aadhaar, PAN, GSTIN & Document Images) */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-brand-700 mb-3 bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                    4. KYC & Verification (Aadhaar, PAN, GSTIN & Document Images)
                  </h4>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Aadhaar Card */}
                    <div className="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          Aadhaar Number (12 digits)
                        </label>
                        <input
                          type="text"
                          maxLength={12}
                          value={createForm.aadharNumber}
                          onChange={(e) => setCreateForm({ ...createForm, aadharNumber: e.target.value })}
                          placeholder="12-digit Aadhaar number"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-brand-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Aadhaar Card Document Image
                        </label>
                        {createForm.aadharDoc ? (
                          <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-white p-2 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-2 overflow-hidden">
                              {createForm.aadharDoc.startsWith("data:image") || createForm.aadharDoc.startsWith("http") ? (
                                <img src={createForm.aadharDoc} alt="Aadhaar preview" className="h-9 w-9 object-cover rounded-lg border border-slate-100 shrink-0" />
                              ) : (
                                <div className="h-9 w-9 bg-brand-50 text-brand-600 font-bold text-[10px] flex items-center justify-center rounded-lg shrink-0">DOC</div>
                              )}
                              <span className="text-[11px] font-semibold text-slate-700 truncate">Aadhaar Document</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setCreateForm({ ...createForm, aadharDoc: "" })}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                              title="Remove document"
                            >
                              <HiOutlineXMark className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center justify-center gap-2 p-2.5 bg-white border-2 border-dashed border-slate-200 hover:border-brand-500 rounded-xl cursor-pointer transition-colors text-center group">
                            <HiOutlineArrowUpTray className="h-4 w-4 text-slate-400 group-hover:text-brand-600 transition-colors" />
                            <span className="text-[11px] font-semibold text-slate-600 group-hover:text-brand-600">Upload Aadhaar Image/PDF</span>
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    setCreateForm({ ...createForm, aadharDoc: reader.result });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* PAN Card */}
                    <div className="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          PAN Number (10 chars)
                        </label>
                        <input
                          type="text"
                          maxLength={10}
                          value={createForm.panNumber}
                          onChange={(e) => setCreateForm({ ...createForm, panNumber: e.target.value.toUpperCase() })}
                          placeholder="ABCDE1234F"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold uppercase focus:ring-2 focus:ring-brand-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          PAN Card Document Image
                        </label>
                        {createForm.panDoc ? (
                          <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-white p-2 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-2 overflow-hidden">
                              {createForm.panDoc.startsWith("data:image") || createForm.panDoc.startsWith("http") ? (
                                <img src={createForm.panDoc} alt="PAN preview" className="h-9 w-9 object-cover rounded-lg border border-slate-100 shrink-0" />
                              ) : (
                                <div className="h-9 w-9 bg-brand-50 text-brand-600 font-bold text-[10px] flex items-center justify-center rounded-lg shrink-0">DOC</div>
                              )}
                              <span className="text-[11px] font-semibold text-slate-700 truncate">PAN Document</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setCreateForm({ ...createForm, panDoc: "" })}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                              title="Remove document"
                            >
                              <HiOutlineXMark className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center justify-center gap-2 p-2.5 bg-white border-2 border-dashed border-slate-200 hover:border-brand-500 rounded-xl cursor-pointer transition-colors text-center group">
                            <HiOutlineArrowUpTray className="h-4 w-4 text-slate-400 group-hover:text-brand-600 transition-colors" />
                            <span className="text-[11px] font-semibold text-slate-600 group-hover:text-brand-600">Upload PAN Image/PDF</span>
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    setCreateForm({ ...createForm, panDoc: reader.result });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* GSTIN Certificate */}
                    <div className="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          GSTIN Number (15 chars)
                        </label>
                        <input
                          type="text"
                          maxLength={15}
                          value={createForm.gstNumber}
                          onChange={(e) => setCreateForm({ ...createForm, gstNumber: e.target.value.toUpperCase() })}
                          placeholder="22AAAAA0000A1Z5"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold uppercase focus:ring-2 focus:ring-brand-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          GST Certificate Image / Doc
                        </label>
                        {createForm.gstDoc ? (
                          <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-white p-2 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-2 overflow-hidden">
                              {createForm.gstDoc.startsWith("data:image") || createForm.gstDoc.startsWith("http") ? (
                                <img src={createForm.gstDoc} alt="GST preview" className="h-9 w-9 object-cover rounded-lg border border-slate-100 shrink-0" />
                              ) : (
                                <div className="h-9 w-9 bg-brand-50 text-brand-600 font-bold text-[10px] flex items-center justify-center rounded-lg shrink-0">DOC</div>
                              )}
                              <span className="text-[11px] font-semibold text-slate-700 truncate">GST Document</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setCreateForm({ ...createForm, gstDoc: "" })}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                              title="Remove document"
                            >
                              <HiOutlineXMark className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center justify-center gap-2 p-2.5 bg-white border-2 border-dashed border-slate-200 hover:border-brand-500 rounded-xl cursor-pointer transition-colors text-center group">
                            <HiOutlineArrowUpTray className="h-4 w-4 text-slate-400 group-hover:text-brand-600 transition-colors" />
                            <span className="text-[11px] font-semibold text-slate-600 group-hover:text-brand-600">Upload GST Doc Image/PDF</span>
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    setCreateForm({ ...createForm, gstDoc: reader.result });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Plan & Monetization Setup (Subscription vs Shop-wise Commission) */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-brand-700 mb-3 bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                    5. Monetization & Plan Setup (Subscription vs Commission)
                  </h4>
                  
                  <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                    {/* Model Type Selector Tabs */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-200/60 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setCreateForm((prev) => ({ ...prev, businessModel: "commission" }))}
                        className={cn(
                          "py-2 px-3 rounded-lg text-xs font-bold transition-all text-center",
                          createForm.businessModel === "commission"
                            ? "bg-white text-brand-700 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                      >
                        Commission Based
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreateForm((prev) => ({ ...prev, businessModel: "subscription" }))}
                        className={cn(
                          "py-2 px-3 rounded-lg text-xs font-bold transition-all text-center",
                          createForm.businessModel === "subscription"
                            ? "bg-white text-brand-700 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                      >
                        Subscription Plan
                      </button>
                    </div>

                    {createForm.businessModel === "commission" ? (
                      <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={createForm.applyCommission}
                              onChange={(e) => setCreateForm((prev) => ({ ...prev, applyCommission: e.target.checked }))}
                              className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                            />
                            <span className="text-xs font-bold text-slate-800">Apply Shop-wise Custom Commission Rate</span>
                          </label>
                          <span className="text-[10px] font-semibold text-slate-500">Overrides Global Defaults</span>
                        </div>

                        {createForm.applyCommission && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Commission Type</label>
                              <select
                                value={createForm.adminCommissionType}
                                onChange={(e) => setCreateForm((prev) => ({ ...prev, adminCommissionType: e.target.value }))}
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                              >
                                <option value="percentage">Percentage (%)</option>
                                <option value="fixed">Fixed Amount (₹)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Rate ({createForm.adminCommissionType === "percentage" ? "%" : "₹"})
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={createForm.adminCommissionType === "percentage" ? 0.5 : 1}
                                value={createForm.adminCommissionValue}
                                onChange={(e) => setCreateForm((prev) => ({ ...prev, adminCommissionValue: Number(e.target.value) }))}
                                placeholder="e.g. 10"
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500"
                              />
                            </div>

                            {createForm.adminCommissionType === "fixed" && (
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Rule Precedence</label>
                                <select
                                  value={createForm.adminCommissionFixedRule}
                                  onChange={(e) => setCreateForm((prev) => ({ ...prev, adminCommissionFixedRule: e.target.value }))}
                                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                                >
                                  <option value="per_qty">Per Item Qty</option>
                                  <option value="per_order">Per Entire Order</option>
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
                          value={createForm.subscriptionPlanId}
                          onChange={(e) => setCreateForm((prev) => ({ ...prev, subscriptionPlanId: e.target.value }))}
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

                {/* 5. Settlement Bank Account Details */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-brand-700 mb-3 bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                    5. Settlement Bank Account Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
                      <input
                        type="text"
                        value={createForm.bankName}
                        onChange={(e) => setCreateForm({ ...createForm, bankName: e.target.value })}
                        placeholder="e.g. State Bank of India, HDFC"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Account Holder Name</label>
                      <input
                        type="text"
                        value={createForm.accountHolder}
                        onChange={(e) => setCreateForm({ ...createForm, accountHolder: e.target.value })}
                        placeholder="Name as per bank account"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Account Number</label>
                      <input
                        type="text"
                        value={createForm.accountNumber}
                        onChange={(e) => setCreateForm({ ...createForm, accountNumber: e.target.value })}
                        placeholder="Bank account number"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">IFSC Code (11 chars)</label>
                      <input
                        type="text"
                        maxLength={11}
                        value={createForm.ifsc}
                        onChange={(e) => setCreateForm({ ...createForm, ifsc: e.target.value.toUpperCase() })}
                        placeholder="SBIN0001234"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium uppercase focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 6. Logistics & Fulfillment Options */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-brand-700 mb-3 bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                    6. Logistics & Delivery Mode Options
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.deliveryPolicy.customerPickup}
                        onChange={(e) => setCreateForm({
                          ...createForm,
                          deliveryPolicy: { ...createForm.deliveryPolicy, customerPickup: e.target.checked }
                        })}
                        className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800">Customer Pickup</span>
                        <p className="text-[10px] text-slate-500">Allow customers to collect orders from shop</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.deliveryPolicy.sellerDelivery}
                        onChange={(e) => setCreateForm({
                          ...createForm,
                          deliveryPolicy: { ...createForm.deliveryPolicy, sellerDelivery: e.target.checked }
                        })}
                        className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800">Seller Self Delivery</span>
                        <p className="text-[10px] text-slate-500">Deliver with store's own delivery riders</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.deliveryPolicy.platformLogistics}
                        onChange={(e) => setCreateForm({
                          ...createForm,
                          deliveryPolicy: { ...createForm.deliveryPolicy, platformLogistics: e.target.checked }
                        })}
                        className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800">Platform Logistics</span>
                        <p className="text-[10px] text-slate-500">Use platform delivery partners</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.deliveryPolicy.autoSwitchToPlatform}
                        onChange={(e) => setCreateForm({
                          ...createForm,
                          deliveryPolicy: { ...createForm.deliveryPolicy, autoSwitchToPlatform: e.target.checked }
                        })}
                        className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800">Auto-Switch to Platform</span>
                        <p className="text-[10px] text-slate-500">Fallback to platform if seller unavailable</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 7. Packaging Charges */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-brand-700 mb-3 bg-brand-50/60 px-3 py-1.5 rounded-lg inline-block">
                    7. Packaging Charge Options
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Packaging Charge (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={createForm.packagingCharge}
                        onChange={(e) => setCreateForm({ ...createForm, packagingCharge: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>
                    <div className="pt-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createForm.packagingChargeEnabled}
                          onChange={(e) => setCreateForm({ ...createForm, packagingChargeEnabled: e.target.checked })}
                          className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-xs font-bold text-slate-700">Enable Packaging Charge for Customers</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-5 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingVendor}
                    className="px-6 py-2.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-md transition-all disabled:opacity-60 flex items-center gap-2"
                  >
                    {isCreatingVendor ? "Creating & Emailing..." : "Create Seller & Send Credentials"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isMapOpen && (
        <MapPicker
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          onConfirm={handleLocationSelect}
          initialLocation={
            createForm.lat ? { lat: createForm.lat, lng: createForm.lng } : null
          }
          initialRadius={createForm.serviceRadius || 5}
        />
      )}
    </div>
  );
};

export default ActiveSellers;
