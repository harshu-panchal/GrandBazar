import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineChevronDown } from 'react-icons/hi';
import { HiOutlineBuildingStorefront } from 'react-icons/hi2';
import { Loader2, Check } from 'lucide-react';
import { useOptionalStoreContext } from '@/modules/seller/context/StoreContext';
import { cn } from '@/lib/utils';

const getStoreStatus = (store) =>
  store?.applicationStatus || (store?.isVerified ? 'approved' : 'pending');

const statusStyles = {
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
};

function StoreOption({ store, isActive, isSwitching, onSelect, variant = 'dropdown' }) {
  const status = getStoreStatus(store);
  const statusClass = statusStyles[status] || statusStyles.pending;

  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        disabled={isSwitching}
        onClick={onSelect}
        className={cn(
          'w-full text-left rounded-xl px-3 py-2.5 border transition-all',
          isActive
            ? 'bg-primary/15 border-primary/30 text-white'
            : 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10 hover:border-white/10',
          isSwitching && 'opacity-60 cursor-wait',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold truncate">{store.shopName}</p>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">
              {store.city || store.locality || store.address || 'Location not set'}
            </p>
          </div>
          {isActive ? (
            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          ) : (
            <span className={cn('text-[9px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0', statusClass)}>
              {status}
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={isSwitching}
      onClick={onSelect}
      className={cn(
        'w-full text-left px-4 py-2.5 text-xs hover:bg-slate-50 transition-colors',
        isActive && 'bg-primary/5 text-primary font-bold',
        isSwitching && 'opacity-60 cursor-wait',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold truncate">{store.shopName}</p>
        {isActive && <Check className="h-3.5 w-3.5 shrink-0" />}
      </div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400 mt-0.5">{status}</p>
    </button>
  );
}

export function StoreSwitcherSidebar() {
  const navigate = useNavigate();
  const storeCtx = useOptionalStoreContext();

  if (!storeCtx?.isOwner || !storeCtx.stores?.length) return null;

  const { stores, activeStore, switchStore, isSwitching } = storeCtx;

  return (
    <div className="px-3 pb-3 border-b border-white/5">
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-gray-500">
          Your stores
        </p>
        {isSwitching && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
      </div>
      <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar-dark pr-1">
        {stores.map((store) => {
          const isActive = String(store._id) === String(activeStore?._id);
          return (
            <StoreOption
              key={store._id}
              store={store}
              isActive={isActive}
              isSwitching={isSwitching}
              variant="sidebar"
              onSelect={() => {
                if (!isActive) switchStore(store._id);
              }}
            />
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => navigate('/seller/stores')}
        className="mt-2 w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold text-primary hover:bg-primary/10 transition-colors"
      >
        + Manage all stores
      </button>
    </div>
  );
}

const StoreSwitcher = ({ className = '', compact = false }) => {
  const navigate = useNavigate();
  const storeCtx = useOptionalStoreContext();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!storeCtx?.isOwner || !storeCtx.stores?.length) return null;

  const { stores, activeStore, switchStore, isSwitching } = storeCtx;
  const activeStatus = activeStore ? getStoreStatus(activeStore) : null;

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={isSwitching}
        className={cn(
          'flex items-center gap-2 rounded-xl border bg-white text-xs font-bold text-slate-700 hover:border-primary/30 transition-all',
          compact ? 'px-2 py-1.5 max-w-[140px]' : 'px-3 py-2 max-w-[220px]',
          isSwitching && 'opacity-70 cursor-wait',
        )}
      >
        <HiOutlineBuildingStorefront className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-left flex-1">
          {activeStore?.shopName || 'Select store'}
        </span>
        {isSwitching ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        ) : (
          <HiOutlineChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
        )}
      </button>
      {open && (
        <div className="absolute top-full right-0 md:left-0 md:right-auto mt-2 w-72 bg-white rounded-xl border border-slate-100 shadow-xl z-[250] py-1 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Switch store panel
            </p>
            {activeStore && (
              <p className="text-xs text-slate-600 mt-1">
                Active: <span className="font-bold text-slate-900">{activeStore.shopName}</span>
                {activeStatus && (
                  <span className="ml-2 text-[10px] uppercase text-slate-400">{activeStatus}</span>
                )}
              </p>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {stores.map((store) => {
              const isActive = String(store._id) === String(activeStore?._id);
              return (
                <StoreOption
                  key={store._id}
                  store={store}
                  isActive={isActive}
                  isSwitching={isSwitching}
                  onSelect={() => {
                    setOpen(false);
                    if (!isActive) switchStore(store._id);
                  }}
                />
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/seller/stores');
            }}
            className="w-full text-left px-4 py-2.5 text-xs font-bold text-primary border-t border-slate-100 hover:bg-primary/5"
          >
            + Manage stores
          </button>
        </div>
      )}
    </div>
  );
};

export default StoreSwitcher;
