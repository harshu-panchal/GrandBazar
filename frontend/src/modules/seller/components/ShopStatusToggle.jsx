import React from 'react';
import { toast } from 'sonner';
import { sellerApi } from '@/modules/seller/services/sellerApi';
import { useOptionalStoreContext } from '@/modules/seller/context/StoreContext';
import { cn } from '@/lib/utils';

const isApprovedStore = (store) => {
    if (!store) return false;
    const status = store.applicationStatus || (store.isVerified ? 'approved' : 'pending');
    return store.isVerified === true && store.isActive === true && status === 'approved';
};

const ShopStatusToggle = ({ className = '' }) => {
    const storeCtx = useOptionalStoreContext();
    const [isSaving, setIsSaving] = React.useState(false);

    if (!storeCtx?.isOwner || !storeCtx.activeStore) return null;

    const { activeStore, setStores } = storeCtx;
    const approved = isApprovedStore(activeStore);
    const isOpen = activeStore.isOpen !== false;

    const handleToggle = async () => {
        if (!approved || isSaving) return;
        if (
            isOpen &&
            !window.confirm(
                "Close your shop? Customers will see it as offline and won't be able to place new orders until you reopen it."
            )
        ) {
            return;
        }
        setIsSaving(true);
        try {
            const res = await sellerApi.toggleStoreActive(activeStore._id);
            const updated = res.data.result;
            setStores((prev) =>
                prev.map((s) => (String(s._id) === String(updated._id) ? { ...s, ...updated } : s))
            );
            toast.success(updated.isOpen ? 'Shop is now open' : 'Shop is now closed');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update shop status');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleToggle}
            disabled={!approved || isSaving}
            title={
                !approved
                    ? 'Store must be approved before you can toggle it'
                    : isOpen
                        ? 'Click to close your shop'
                        : 'Click to open your shop'
            }
            className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all shrink-0',
                !approved
                    ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                    : isOpen
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
                isSaving && 'opacity-60 cursor-wait',
                className
            )}
        >
            <span
                className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    !approved ? 'bg-slate-300' : isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                )}
            />
            <span className="hidden sm:inline">
                {isSaving ? '...' : approved ? (isOpen ? 'Open' : 'Closed') : 'Pending'}
            </span>
        </button>
    );
};

export default ShopStatusToggle;
