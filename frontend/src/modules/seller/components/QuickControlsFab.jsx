import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, X, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@core/context/AuthContext';
import { sellerApi } from '@/modules/seller/services/sellerApi';
import { useOptionalStoreContext } from '@/modules/seller/context/StoreContext';
import { hasSellerModuleAccess } from '@/modules/seller/constants/sellerPermissions';

const PRODUCT_PAGE_SIZE = 50;
const FAB_SIZE = 48;
const FAB_MARGIN = 8;
const FAB_POS_KEY = 'seller_quick_fab_pos';
const DRAG_THRESHOLD = 5;

const clampFabPos = ({ x, y }) => ({
    x: Math.min(Math.max(x, FAB_MARGIN), window.innerWidth - FAB_SIZE - FAB_MARGIN),
    y: Math.min(Math.max(y, FAB_MARGIN), window.innerHeight - FAB_SIZE - FAB_MARGIN),
});

const readFabPos = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(FAB_POS_KEY));
        if (Number.isFinite(raw?.x) && Number.isFinite(raw?.y)) return clampFabPos(raw);
    } catch { /* storage unavailable or corrupt */ }
    return null;
};

const isApprovedStore = (store) => {
    if (!store) return false;
    const status = store.applicationStatus || (store.isVerified ? 'approved' : 'pending');
    return store.isVerified === true && store.isActive === true && status === 'approved';
};

const Switch = ({ checked, onChange, disabled, busy, label }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled || busy}
        onClick={onChange}
        className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors',
            checked ? 'bg-emerald-500' : 'bg-slate-300',
            (disabled || busy) && 'opacity-50 cursor-not-allowed',
        )}
    >
        <span
            className={cn(
                'absolute top-0.5 left-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform',
                checked && 'translate-x-5',
            )}
        >
            {busy && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        </span>
    </button>
);

const Row = ({ title, hint, ...switchProps }) => (
    <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">{title}</p>
            {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
        <Switch label={title} {...switchProps} />
    </div>
);

const Section = ({ title, children }) => (
    <section>
        <h3 className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-400">{title}</h3>
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white px-4">
            {children}
        </div>
    </section>
);

const QuickControlsFab = () => {
    const { user } = useAuth();
    const storeCtx = useOptionalStoreContext();
    const [open, setOpen] = useState(false);
    const [busyKey, setBusyKey] = useState(null);

    const [policyData, setPolicyData] = useState(null);
    const [policyLoading, setPolicyLoading] = useState(false);

    const [products, setProducts] = useState([]);
    const [productPage, setProductPage] = useState(0);
    const [productTotal, setProductTotal] = useState(0);
    const [productsLoading, setProductsLoading] = useState(false);
    const [search, setSearch] = useState('');

    // null = default CSS corner position until the user drags it.
    const [fabPos, setFabPos] = useState(readFabPos);
    const dragRef = React.useRef(null);

    useEffect(() => {
        const onResize = () => setFabPos((p) => (p ? clampFabPos(p) : p));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const onFabPointerDown = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const onFabPointerMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        d.moved = true;
        setFabPos(clampFabPos({ x: d.origX + dx, y: d.origY + dy }));
    };

    const onFabPointerUp = (e) => {
        const d = dragRef.current;
        if (!d) return;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        if (d.moved) {
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            try {
                localStorage.setItem(FAB_POS_KEY, JSON.stringify(clampFabPos({ x: d.origX + dx, y: d.origY + dy })));
            } catch { /* ignore */ }
        }
    };

    const onFabClick = () => {
        // A drag ends with a click event; only treat a real tap as "open".
        if (dragRef.current?.moved) {
            dragRef.current = null;
            return;
        }
        dragRef.current = null;
        setOpen(true);
    };

    const activeStore = storeCtx?.activeStore;
    const isOwner = Boolean(storeCtx?.isOwner);
    const allowed = useCallback(
        (key) => isOwner || hasSellerModuleAccess(user?.allowedPermissions || [], key, 'write'),
        [isOwner, user],
    );
    const canProducts = allowed('products');
    const canScheduling = allowed('scheduling');
    const approved = isApprovedStore(activeStore);
    const shopOpen = activeStore?.isOpen !== false && activeStore?.isActive !== false;

    const loadPolicy = useCallback(async () => {
        setPolicyLoading(true);
        try {
            const res = await sellerApi.getDeliveryPolicy();
            setPolicyData(res.data?.result || res.data?.results || null);
        } catch {
            toast.error('Failed to load delivery settings');
        } finally {
            setPolicyLoading(false);
        }
    }, []);

    const loadProducts = useCallback(async (page) => {
        setProductsLoading(true);
        try {
            const res = await sellerApi.getProducts({ page, limit: PRODUCT_PAGE_SIZE, sort: 'newest' });
            const payload = res.data?.result || {};
            const items = Array.isArray(payload.items) ? payload.items : res.data?.results || [];
            setProducts((prev) => {
                if (page === 1) return items;
                const seen = new Set(prev.map((p) => String(p._id || p.id)));
                return [...prev, ...items.filter((p) => !seen.has(String(p._id || p.id)))];
            });
            setProductPage(page);
            setProductTotal(typeof payload.total === 'number' ? payload.total : items.length);
        } catch {
            toast.error('Failed to load products');
        } finally {
            setProductsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        if (canScheduling) loadPolicy();
        if (canProducts) loadProducts(1);
        const onKey = (e) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, canScheduling, canProducts, loadPolicy, loadProducts]);

    const run = async (key, fn, successMsg) => {
        if (busyKey) return;
        setBusyKey(key);
        try {
            await fn();
            if (successMsg) toast.success(successMsg);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Update failed');
        } finally {
            setBusyKey(null);
        }
    };

    const toggleShop = () => {
        if (shopOpen && !window.confirm("Close your shop? Customers won't be able to place new orders until you reopen it.")) {
            return;
        }
        run('shop', async () => {
            const res = await sellerApi.toggleStoreActive(activeStore._id);
            const updated = res.data.result;
            storeCtx.setStores((prev) =>
                prev.map((s) => (String(s._id) === String(updated._id) ? { ...s, ...updated } : s)),
            );
            toast.success(updated.isOpen ? 'Shop is now open' : 'Shop is now closed');
        });
    };

    // The backend replaces each top-level section wholesale, so always send the
    // full section from the last fetched state with just the one key changed.
    const savePolicy = (key, patch) =>
        run(key, async () => {
            const res = await sellerApi.updateDeliveryPolicy(patch);
            setPolicyData(res.data?.result || res.data?.results || policyData);
        });

    const policy = policyData?.deliveryPolicy;
    const availability = policyData?.availability;
    const scheduling = policyData?.schedulingSettings;

    const toggleFulfillment = (field) => {
        const next = { ...policy, [field]: !policy[field] };
        savePolicy(field, { deliveryPolicy: next });
    };

    const toggleVacation = () =>
        savePolicy('vacation', {
            availability: {
                ...availability,
                vacation: { ...availability.vacation, active: !availability.vacation?.active },
            },
        });

    const toggleClosure = () =>
        savePolicy('closure', {
            availability: {
                ...availability,
                temporaryClosure: {
                    ...availability.temporaryClosure,
                    active: !availability.temporaryClosure?.active,
                    reason: availability.temporaryClosure?.reason || 'other',
                },
            },
        });

    const toggleScheduling = () =>
        savePolicy('scheduling', {
            schedulingSettings: { ...scheduling, enabled: !scheduling.enabled },
        });

    const togglePackaging = () => {
        if (!policyData.packagingChargeEnabled && !(Number(policyData.packagingCharge) > 0)) {
            toast.error('Set a packaging amount in Delivery Policy first');
            return;
        }
        savePolicy('packaging', { packagingChargeEnabled: !policyData.packagingChargeEnabled });
    };

    const toggleProduct = (product) => {
        const id = product._id || product.id;
        if (product.isPublished === false) {
            toast.error('Set a price for this product before turning it on');
            return;
        }
        run(`p-${id}`, async () => {
            const res = await sellerApi.toggleProductStatus(id);
            const nextStatus = res?.data?.result?.status || (product.status === 'active' ? 'inactive' : 'active');
            setProducts((prev) =>
                prev.map((p) => (String(p._id || p.id) === String(id) ? { ...p, status: nextStatus } : p)),
            );
            toast.success(nextStatus === 'active' ? 'Product is now live' : 'Product turned off');
        });
    };

    const visibleProducts = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? products.filter((p) => (p.name || '').toLowerCase().includes(q)) : products;
    }, [products, search]);

    if (!activeStore) return null;

    const modal = (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-[900] flex items-end justify-center sm:items-center sm:p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                        onClick={() => setOpen(false)}
                    />
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Quick controls"
                        initial={{ y: 60, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 60, opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                        className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-2xl sm:max-w-lg sm:rounded-3xl"
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
                            <div>
                                <h2 className="text-lg font-black text-slate-900">Quick Controls</h2>
                                <p className="text-xs text-slate-500">Switch things on or off instantly</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                                aria-label="Close"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-5 overflow-y-auto px-4 py-4">
                            <Section title="Shop">
                                <Row
                                    title={shopOpen ? 'Shop is open' : 'Shop is closed'}
                                    hint={
                                        !approved
                                            ? 'Available once admin approves your store'
                                            : !isOwner
                                                ? 'Only the owner can open or close the shop'
                                                : 'Customers can order only while open'
                                    }
                                    checked={shopOpen}
                                    disabled={!approved || !isOwner}
                                    busy={busyKey === 'shop'}
                                    onChange={toggleShop}
                                />
                            </Section>

                            {canScheduling && (
                                <>
                                    {policyLoading && !policyData && (
                                        <div className="flex justify-center py-6">
                                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                        </div>
                                    )}
                                    {policy && (
                                        <Section title="Delivery policies">
                                            <Row
                                                title="Customer pickup"
                                                checked={Boolean(policy.customerPickup)}
                                                busy={busyKey === 'customerPickup'}
                                                onChange={() => toggleFulfillment('customerPickup')}
                                            />
                                            <Row
                                                title="Seller self delivery"
                                                checked={Boolean(policy.sellerDelivery)}
                                                busy={busyKey === 'sellerDelivery'}
                                                onChange={() => toggleFulfillment('sellerDelivery')}
                                            />
                                            <Row
                                                title="Platform logistics"
                                                hint={
                                                    policy.platformLogisticsEnabledByAdmin === false
                                                        ? 'Disabled by admin'
                                                        : undefined
                                                }
                                                checked={Boolean(policy.platformLogistics)}
                                                disabled={policy.platformLogisticsEnabledByAdmin === false}
                                                busy={busyKey === 'platformLogistics'}
                                                onChange={() => toggleFulfillment('platformLogistics')}
                                            />
                                            <Row
                                                title="Auto-switch to platform"
                                                hint="When you're unavailable to deliver"
                                                checked={Boolean(policy.autoSwitchToPlatform)}
                                                busy={busyKey === 'autoSwitchToPlatform'}
                                                onChange={() => toggleFulfillment('autoSwitchToPlatform')}
                                            />
                                            {scheduling && (
                                                <Row
                                                    title="Scheduled delivery"
                                                    checked={Boolean(scheduling.enabled)}
                                                    busy={busyKey === 'scheduling'}
                                                    onChange={toggleScheduling}
                                                />
                                            )}
                                            <Row
                                                title="Packaging charge"
                                                hint={
                                                    policyData.packagingCharge > 0
                                                        ? `₹${Number(policyData.packagingCharge).toLocaleString('en-IN')} per order`
                                                        : 'Amount not set'
                                                }
                                                checked={Boolean(policyData.packagingChargeEnabled)}
                                                busy={busyKey === 'packaging'}
                                                onChange={togglePackaging}
                                            />
                                        </Section>
                                    )}
                                    {availability && (
                                        <Section title="Availability">
                                            <Row
                                                title="Vacation mode"
                                                checked={Boolean(availability.vacation?.active)}
                                                busy={busyKey === 'vacation'}
                                                onChange={toggleVacation}
                                            />
                                            <Row
                                                title="Temporary closure"
                                                checked={Boolean(availability.temporaryClosure?.active)}
                                                busy={busyKey === 'closure'}
                                                onChange={toggleClosure}
                                            />
                                        </Section>
                                    )}
                                </>
                            )}

                            {canProducts && (
                                <section>
                                    <div className="mb-1 flex items-baseline justify-between">
                                        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                                            Products
                                        </h3>
                                        {productTotal > 0 && (
                                            <span className="text-[11px] font-bold text-slate-400">
                                                {products.length} of {productTotal}
                                            </span>
                                        )}
                                    </div>
                                    <div className="relative mb-2">
                                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <input
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="Search loaded products"
                                            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-400"
                                        />
                                    </div>
                                    <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white px-4">
                                        {visibleProducts.map((p) => {
                                            const id = p._id || p.id;
                                            const needsPrice = p.isPublished === false;
                                            return (
                                                <Row
                                                    key={id}
                                                    title={p.name}
                                                    hint={needsPrice ? 'Needs pricing' : undefined}
                                                    checked={p.status === 'active'}
                                                    disabled={needsPrice}
                                                    busy={busyKey === `p-${id}`}
                                                    onChange={() => toggleProduct(p)}
                                                />
                                            );
                                        })}
                                        {!productsLoading && visibleProducts.length === 0 && (
                                            <p className="py-6 text-center text-xs text-slate-400">No products found</p>
                                        )}
                                        {productsLoading && (
                                            <div className="flex justify-center py-4">
                                                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                            </div>
                                        )}
                                    </div>
                                    {!productsLoading && products.length < productTotal && (
                                        <button
                                            type="button"
                                            onClick={() => loadProducts(productPage + 1)}
                                            className="mt-2 w-full rounded-xl bg-white py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 border border-slate-200 hover:bg-slate-100"
                                        >
                                            Load more
                                        </button>
                                    )}
                                </section>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );

    return (
        <>
            <button
                type="button"
                onClick={onFabClick}
                onPointerDown={onFabPointerDown}
                onPointerMove={onFabPointerMove}
                onPointerUp={onFabPointerUp}
                onPointerCancel={onFabPointerUp}
                aria-label="Open quick controls (drag to move)"
                style={fabPos ? { left: fabPos.x, top: fabPos.y, touchAction: 'none' } : { touchAction: 'none' }}
                className={cn(
                    'fixed z-[300] flex h-12 w-12 cursor-grab select-none items-center justify-center rounded-full bg-slate-900 text-white shadow-xl shadow-slate-900/30 active:cursor-grabbing active:scale-95',
                    !fabPos && 'bottom-24 right-4 md:bottom-6 md:right-6',
                )}
            >
                <SlidersHorizontal className="h-5 w-5" />
                <span
                    className={cn(
                        'absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-slate-900',
                        approved ? (shopOpen ? 'bg-emerald-400' : 'bg-rose-500') : 'bg-slate-400',
                    )}
                />
            </button>
            {createPortal(modal, document.body)}
        </>
    );
};

export default QuickControlsFab;
