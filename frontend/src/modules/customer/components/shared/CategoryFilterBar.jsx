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
function Popover({ isOpen, onClose, anchorRef, children, widthClass = 'w-56', align = 'left' }) {
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
                'absolute z-[100] top-full mt-2 rounded-2xl border border-slate-100 bg-white shadow-2xl overflow-hidden',
                align === 'right' ? 'right-0 left-auto' : 'left-0',
                widthClass,
            )}
        >
            {children}
        </div>
    );
}

const PRICE_RANGE_OPTIONS = [
    { label: 'All Prices', min: null, max: null },
    { label: 'Under ₹100', min: 0, max: 100 },
    { label: '₹100 to ₹300', min: 100, max: 300 },
    { label: '₹300 to ₹500', min: 300, max: 500 },
    { label: 'Above ₹500', min: 500, max: null },
];

/**
 * Compact sort / filter / distance controls for a product listing page.
 * Sort, brand, price range, and distance-radius are applied by caller.
 */
const CategoryFilterBar = ({
    sortBy,
    onSortChange,
    maxDistanceKm,
    onDistanceChange,
    inStockOnly,
    onInStockChange,
    priceRange,
    onPriceRangeChange,
    brands = [],
    selectedBrand = '',
    onBrandChange,
}) => {
    const [openMenu, setOpenMenu] = useState(null); // 'sort' | 'distance' | 'filters' | null
    const sortBtnRef = useRef(null);
    const distanceBtnRef = useRef(null);
    const filtersBtnRef = useRef(null);

    const toggleMenu = (menu) => setOpenMenu((cur) => (cur === menu ? null : menu));

    const activeSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label || 'Sort';
    const activeDistanceLabel = DISTANCE_OPTIONS.find((o) => o.value === maxDistanceKm)?.label || 'Distance';
    
    const activeFiltersCount =
        (inStockOnly ? 1 : 0) +
        (selectedBrand ? 1 : 0) +
        (priceRange && (priceRange.min != null || priceRange.max != null) ? 1 : 0);

    const filtersActive = activeFiltersCount > 0;

    return (
        <div className="relative z-[60] flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-white overflow-visible">
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
                    Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
                </button>
                <Popover isOpen={openMenu === 'filters'} onClose={() => setOpenMenu(null)} anchorRef={filtersBtnRef} widthClass="w-72" align="right">
                    <div className="p-3 divide-y divide-slate-100 max-h-80 overflow-y-auto">
                        {/* In stock toggle */}
                        <label className="flex w-full cursor-pointer items-center justify-between py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg px-1">
                            In stock only
                            <input
                                type="checkbox"
                                checked={inStockOnly}
                                onChange={(e) => onInStockChange?.(e.target.checked)}
                                className="h-4 w-4 accent-primary"
                            />
                        </label>

                        {/* Price range filter */}
                        {onPriceRangeChange && (
                            <div className="py-2.5 space-y-1.5">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">Price Range</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {PRICE_RANGE_OPTIONS.map((opt) => {
                                        const isSelected =
                                            priceRange?.min === opt.min && priceRange?.max === opt.max;
                                        return (
                                            <button
                                                key={opt.label}
                                                type="button"
                                                onClick={() => {
                                                    onPriceRangeChange({ min: opt.min, max: opt.max });
                                                }}
                                                className={cn(
                                                    'px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors truncate',
                                                    isSelected
                                                        ? 'bg-brand-500 text-white font-bold'
                                                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100',
                                                )}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Brand filter */}
                        {onBrandChange && Array.isArray(brands) && brands.length > 0 && (
                            <div className="pt-2.5 space-y-1.5">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">Brand</p>
                                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto px-1">
                                    <button
                                        type="button"
                                        onClick={() => onBrandChange('')}
                                        className={cn(
                                            'px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
                                            !selectedBrand
                                                ? 'bg-slate-900 text-white font-bold'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                                        )}
                                    >
                                        All Brands
                                    </button>
                                    {brands.map((b) => (
                                        <button
                                            key={b}
                                            type="button"
                                            onClick={() => onBrandChange(b === selectedBrand ? '' : b)}
                                            className={cn(
                                                'px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
                                                selectedBrand === b
                                                    ? 'bg-primary text-white font-bold'
                                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                                            )}
                                        >
                                            {b}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </Popover>
            </div>
        </div>
    );
};

export default CategoryFilterBar;
