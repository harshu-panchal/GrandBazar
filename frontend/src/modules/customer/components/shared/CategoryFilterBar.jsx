import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, SlidersHorizontal, MapPin, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const SORT_OPTIONS = [
    { value: 'newest', label: 'Newest' },
    { value: 'price-asc', label: 'Price: Low to High' },
    { value: 'price-desc', label: 'Price: High to Low' },
    { value: 'distance', label: 'Nearest First' },
];

const DISTANCE_OPTIONS = [
    { value: null, label: 'Any distance' },
    { value: 1, label: 'Within 1 km' },
    { value: 3, label: 'Within 3 km' },
    { value: 5, label: 'Within 5 km' },
    { value: 10, label: 'Within 10 km' },
];

/** Small popover anchored under a trigger button; closes on outside click. */
function Popover({ isOpen, onClose, anchorRef, children, widthClass = 'w-56' }) {
    const popRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleClick = (e) => {
            if (
                popRef.current && !popRef.current.contains(e.target) &&
                anchorRef.current && !anchorRef.current.contains(e.target)
            ) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen, onClose, anchorRef]);

    if (!isOpen) return null;

    return (
        <div
            ref={popRef}
            className={cn(
                'absolute z-50 top-full left-0 mt-2 rounded-2xl border border-slate-100 bg-white shadow-xl overflow-hidden',
                widthClass,
            )}
        >
            {children}
        </div>
    );
}

/**
 * Compact sort / filter / distance controls for a product listing page.
 * Sort and distance-radius are applied by the caller (distance is computed
 * client-side from each product's seller distance, since it isn't a DB
 * sortable/filterable field).
 */
const CategoryFilterBar = ({
    sortBy,
    onSortChange,
    maxDistanceKm,
    onDistanceChange,
    inStockOnly,
    onInStockChange,
}) => {
    const [openMenu, setOpenMenu] = useState(null); // 'sort' | 'distance' | 'filters' | null
    const sortBtnRef = useRef(null);
    const distanceBtnRef = useRef(null);
    const filtersBtnRef = useRef(null);

    const toggleMenu = (menu) => setOpenMenu((cur) => (cur === menu ? null : menu));

    const activeSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label || 'Sort';
    const activeDistanceLabel = DISTANCE_OPTIONS.find((o) => o.value === maxDistanceKm)?.label || 'Distance';
    const filtersActive = inStockOnly;

    return (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 bg-white">
            <div className="relative shrink-0">
                <button
                    ref={sortBtnRef}
                    type="button"
                    onClick={() => toggleMenu('sort')}
                    className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                        sortBy !== 'newest'
                            ? 'border-primary bg-brand-50 text-primary'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                    )}
                >
                    <ArrowUpDown size={13} />
                    {activeSortLabel}
                </button>
                <Popover isOpen={openMenu === 'sort'} onClose={() => setOpenMenu(null)} anchorRef={sortBtnRef}>
                    {SORT_OPTIONS.map((opt) => (
                        <button
                            key={String(opt.value)}
                            type="button"
                            onClick={() => { onSortChange(opt.value); setOpenMenu(null); }}
                            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            {opt.label}
                            {sortBy === opt.value && <Check size={14} className="text-primary" />}
                        </button>
                    ))}
                </Popover>
            </div>

            <div className="relative shrink-0">
                <button
                    ref={distanceBtnRef}
                    type="button"
                    onClick={() => toggleMenu('distance')}
                    className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                        maxDistanceKm != null
                            ? 'border-primary bg-brand-50 text-primary'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                    )}
                >
                    <MapPin size={13} />
                    {activeDistanceLabel}
                </button>
                <Popover isOpen={openMenu === 'distance'} onClose={() => setOpenMenu(null)} anchorRef={distanceBtnRef}>
                    {DISTANCE_OPTIONS.map((opt) => (
                        <button
                            key={String(opt.value)}
                            type="button"
                            onClick={() => { onDistanceChange(opt.value); setOpenMenu(null); }}
                            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            {opt.label}
                            {maxDistanceKm === opt.value && <Check size={14} className="text-primary" />}
                        </button>
                    ))}
                </Popover>
            </div>

            <div className="relative shrink-0">
                <button
                    ref={filtersBtnRef}
                    type="button"
                    onClick={() => toggleMenu('filters')}
                    className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                        filtersActive
                            ? 'border-primary bg-brand-50 text-primary'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                    )}
                >
                    <SlidersHorizontal size={13} />
                    Filters
                </button>
                <Popover isOpen={openMenu === 'filters'} onClose={() => setOpenMenu(null)} anchorRef={filtersBtnRef} widthClass="w-64">
                    <label className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        In stock only
                        <input
                            type="checkbox"
                            checked={inStockOnly}
                            onChange={(e) => onInStockChange(e.target.checked)}
                            className="h-4 w-4 accent-primary"
                        />
                    </label>
                </Popover>
            </div>
        </div>
    );
};

export default CategoryFilterBar;
