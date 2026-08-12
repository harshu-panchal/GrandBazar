import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ProductCard from "../shared/ProductCard";
import { cn } from "@/lib/utils";
import ExperienceBannerCarousel from "./ExperienceBannerCarousel";
import { buildStorePath } from "@core/seo/url";
import { customerApi } from "../../services/customerApi";

const LAZY_CHUNK_SIZE = 20;
const LAZY_ROOT_MARGIN = "260px 0px";

/**
 * Own component (not inlined in SectionRenderer's .map) because impression
 * tracking needs a per-strip effect+ref — hooks can't live inside a map callback.
 */
const SuperAdStrip = ({ sectionId, items, navigate }) => {
  const trackedImpressions = useRef(new Set());

  useEffect(() => {
    if (!sectionId) return;
    items.forEach((item) => {
      const itemId = item._id;
      if (!itemId || trackedImpressions.current.has(itemId)) return;
      trackedImpressions.current.add(itemId);
      customerApi.trackSuperAdEvent(sectionId, itemId, "impression").catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, items]);

  const handleAdClick = (item) => {
    if (sectionId && item._id) {
      customerApi.trackSuperAdEvent(sectionId, item._id, "click").catch(() => {});
    }
    if (item.linkType === "url" && item.linkValue) {
      window.open(item.linkValue, "_blank", "noopener,noreferrer");
    } else if (item.linkType !== "none") {
      navigate(buildStorePath(item.sellerId));
    }
  };

  return (
    <div className="-mx-4 md:-mx-8 lg:-mx-[50px] px-4 md:px-8 lg:px-[50px]">
      <div className="flex overflow-x-auto gap-3 no-scrollbar pb-1 snap-x snap-mandatory">
        {items.map((item, idx) => (
          <div
            key={item._id || idx}
            onClick={() => handleAdClick(item)}
            className={cn(
              "relative w-[280px] md:w-[360px] shrink-0 snap-start rounded-2xl overflow-hidden aspect-[16/7] bg-slate-100",
              item.linkType !== "none" && "cursor-pointer active:scale-[0.98] transition-transform"
            )}
          >
            <img src={item.imageUrl} alt={item.title || item.sellerId?.shopName || "Ad"} className="w-full h-full object-cover" />
            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/50 text-[9px] font-black uppercase tracking-widest text-white">
              Sponsored
            </span>
            {item.title && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
                <p className="text-xs font-black text-white truncate">{item.title}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const LazyLoadTrigger = ({ enabled, onVisible }) => {
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!enabled) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    if (typeof IntersectionObserver === "undefined") {
      onVisible();
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) onVisible();
        });
      },
      { root: null, rootMargin: LAZY_ROOT_MARGIN, threshold: 0.01 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, onVisible]);

  return <div ref={ref} className="h-2 w-full" aria-hidden="true" />;
};

const SectionRenderer = ({ sections = [], productsById = {}, categoriesById = {}, subcategoriesById = {} }) => {
  const navigate = useNavigate();
  const [sectionVisibleCounts, setSectionVisibleCounts] = React.useState({});

  const loadMoreForSection = React.useCallback((sectionKey, totalCount) => {
    if (!sectionKey || totalCount <= 0) return;
    setSectionVisibleCounts((prev) => {
      const current = prev[sectionKey] ?? LAZY_CHUNK_SIZE;
      if (current >= totalCount) return prev;
      return {
        ...prev,
        [sectionKey]: Math.min(totalCount, current + LAZY_CHUNK_SIZE),
      };
    });
  }, []);

  const resolveVisibleCount = React.useCallback(
    (sectionKey, totalCount) => {
      const current = sectionVisibleCounts[sectionKey] ?? LAZY_CHUNK_SIZE;
      return Math.min(totalCount, current);
    },
    [sectionVisibleCounts]
  );

  return (
    <div className="space-y-8">
      {sections.map((section, sectionIndex) => {
        const sectionKey = String(
          section?._id || section?.id || `${section?.displayType || "section"}-${sectionIndex}`
        );
        const heading = section.title;

        if (section.displayType === "banners") {
          const items = section.config?.banners?.items || [];
          if (!items.length) return null;
          return (
            <div key={section._id || sectionKey} className="-mt-8 md:-mt-8">
              <ExperienceBannerCarousel section={section} items={items} slideGap={12} />
            </div>
          );
        }

        if (section.displayType === "categories") {
          const ids = section.config?.categories?.categoryIds || [];
          const rows = section.config?.categories?.rows || 1;
          const visibleCount = rows * 4;
          const allItems = ids
            .map((id) => categoriesById[id])
            .filter(Boolean)
            .slice(0, visibleCount);
          const visibleItems = allItems.slice(
            0,
            resolveVisibleCount(sectionKey, allItems.length)
          );
          const hasMore = visibleItems.length < allItems.length;

          if (!visibleItems.length) return null;

          return (
            <div
              key={section._id || sectionKey}
              id={`section-${section._id}`}
              className="-mx-2 md:-mx-4 lg:-mx-6 px-2 md:px-4 lg:px-6"
            >
              {heading && (
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-black text-[#1A1A1A]">
                    {heading}
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {allItems.length} categories
                  </span>
                </div>
              )}
              <div className="rounded-3xl bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)] border border-slate-100 px-3.5 py-3">
                <div className="grid grid-cols-4 gap-3">
                  {visibleItems.map((cat) => (
                    <button
                      key={cat._id}
                      className="group flex flex-col items-center gap-1.5 focus:outline-none"
                      onClick={() => {
                        // Remember the header & section so back navigation can restore context
                        window.sessionStorage.setItem(
                          "experienceReturn",
                          JSON.stringify({
                            headerId: section.headerId || null,
                            sectionId: section._id,
                          })
                        );
                        navigate(`/category/${cat._id}`);
                      }}
                    >
                      <div className="relative aspect-square w-full rounded-2xl bg-[#F8F9FA] border border-slate-100/80 flex items-center justify-center overflow-hidden p-1 transition-all duration-200 group-hover:border-primary/40 group-hover:bg-white group-hover:shadow-[0_10px_25px_rgba(15,23,42,0.08)]">
                        {cat.image ? (
                          <img
                            src={cat.image}
                            alt={cat.name}
                            className="w-full h-full object-contain object-center mix-blend-multiply transition-transform duration-200 group-hover:scale-105"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-slate-100" />
                        )}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-700 text-center leading-snug line-clamp-2 group-hover:text-primary">
                        {cat.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <LazyLoadTrigger
                enabled={hasMore}
                onVisible={() => loadMoreForSection(sectionKey, allItems.length)}
              />
            </div>
          );
        }

        if (section.displayType === "subcategories") {
          const ids = section.config?.subcategories?.subcategoryIds || [];
          const rows = section.config?.subcategories?.rows || 1;
          const visibleCount = rows * 4;
          const allItems = ids
            .map((id) => subcategoriesById[id])
            .filter(Boolean)
            .slice(0, visibleCount);
          const visibleItems = allItems.slice(
            0,
            resolveVisibleCount(sectionKey, allItems.length)
          );
          const hasMore = visibleItems.length < allItems.length;
          if (!visibleItems.length) return null;

          return (
            <div
              key={section._id || sectionKey}
              id={`section-${section._id}`}
              className="-mx-2 md:-mx-4 lg:-mx-6 px-2 md:px-4 lg:px-6"
            >
              {heading && (
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-black text-[#1A1A1A]">
                    {heading}
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {allItems.length} picks
                  </span>
                </div>
              )}
              <div className="rounded-3xl bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)] border border-slate-100 px-3.5 py-3">
                <div className="grid grid-cols-4 gap-3">
                  {visibleItems.map((cat) => (
                    <button
                      key={cat._id}
                      className="group flex flex-col items-center gap-1.5 focus:outline-none"
                      onClick={() => {
                        window.sessionStorage.setItem(
                          "experienceReturn",
                          JSON.stringify({
                            headerId: section.headerId || null,
                            sectionId: section._id,
                          })
                        );
                        const parentId =
                          cat.parentId?._id ||
                          cat.parentId ||
                          cat.categoryId?._id ||
                          cat.categoryId ||
                          null;

                        if (parentId) {
                          navigate(`/category/${parentId}`, {
                            state: { activeSubcategoryId: cat._id },
                          });
                        } else {
                          // Fallback to previous behavior if we can't resolve parent
                          navigate(`/category/${cat._id}`);
                        }
                      }}
                    >
                      <div className="relative aspect-square w-full rounded-2xl bg-[#F8F9FA] border border-slate-100/80 flex items-center justify-center overflow-hidden p-1 transition-all duration-200 group-hover:border-primary/40 group-hover:bg-white group-hover:shadow-[0_10px_25px_rgba(15,23,42,0.08)]">
                        {cat.image ? (
                          <img
                            src={cat.image}
                            alt={cat.name}
                            className="w-full h-full object-contain object-center mix-blend-multiply transition-transform duration-200 group-hover:scale-105"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-slate-100" />
                        )}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-700 text-center leading-snug line-clamp-2 group-hover:text-primary">
                        {cat.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <LazyLoadTrigger
                enabled={hasMore}
                onVisible={() => loadMoreForSection(sectionKey, allItems.length)}
              />
            </div>
          );
        }

        if (section.displayType === "products") {
          const productConfig = section.config?.products || {};
          const ids = productConfig.productIds || [];
          const rows = productConfig.rows || 1;
          const columns = productConfig.columns || 2;
          const singleRowScrollable = !!productConfig.singleRowScrollable;
          const hasManualProductSelection = ids.length > 0;

          let allProducts;

          if (ids.length) {
            allProducts = ids.map((id) => productsById[id]).filter(Boolean);
          } else {
            const categoryFilter = productConfig.categoryIds || [];
            const subcategoryFilter = productConfig.subcategoryIds || [];
            const hasCategoryFilter = categoryFilter.length > 0;
            const hasSubcategoryFilter = subcategoryFilter.length > 0;

            const all = Object.values(productsById);
            allProducts = all.filter((p) => {
              const catId = p.categoryId?._id || p.categoryId;
              const subId = p.subcategoryId?._id || p.subcategoryId;

              const matchesCategory = hasCategoryFilter
                ? categoryFilter.includes(catId)
                : true;
              const matchesSubcategory = hasSubcategoryFilter
                ? subcategoryFilter.includes(subId)
                : true;

              return matchesCategory && matchesSubcategory;
            });
          }

          if (!allProducts.length) return null;

          if (singleRowScrollable) {
            const visibleCount = resolveVisibleCount(sectionKey, allProducts.length);
            const items = allProducts.slice(0, visibleCount);
            const hasMore = items.length < allProducts.length;

            return (
            <div
              key={section._id || sectionKey}
              id={`section-${section._id}`}
              className="-mx-4 md:-mx-8 lg:-mx-[50px] px-1 sm:px-2 md:px-3 mt-6 mb-2"
            >
                <div className="flex items-center justify-between mb-3 px-3 md:px-5">
                  {heading && (
                    <h3 className="text-base font-black text-[#1A1A1A]">
                      {heading}
                    </h3>
                  )}
                  <span className="text-[11px] font-semibold text-slate-400">
                    {allProducts.length} items
                  </span>
                </div>
                <div
                  className="relative z-10 flex overflow-x-auto gap-1.5 pb-1.5 no-scrollbar"
                  onScroll={(e) => {
                    if (!hasMore) return;
                    const node = e.currentTarget;
                    const distanceToEnd =
                      node.scrollWidth - node.scrollLeft - node.clientWidth;
                    if (distanceToEnd < 220) {
                      loadMoreForSection(sectionKey, allProducts.length);
                    }
                  }}
                >
                  {items.map((product) => (
                    <div
                      key={product._id || product.id}
                      className="w-[138px] sm:w-[150px] md:w-[168px] shrink-0"
                    >
                      <ProductCard product={product} compact={true} neutralBg={true} />
                    </div>
                  ))}
                </div>
                <LazyLoadTrigger
                  enabled={hasMore}
                  onVisible={() => loadMoreForSection(sectionKey, allProducts.length)}
                />
              </div>
            );
          }

          // If admin explicitly selected product IDs, render the full curated list.
          // Keep rows*columns cap only for dynamic filter-driven sections.
          const layoutCount = hasManualProductSelection
            ? allProducts.length
            : rows * columns;
          const cappedItems = allProducts.slice(0, layoutCount);
          const visibleCount = resolveVisibleCount(sectionKey, cappedItems.length);
          const items = cappedItems.slice(0, visibleCount);
          const hasMore = items.length < cappedItems.length;

          return (
            <div
              key={section._id || sectionKey}
              id={`section-${section._id}`}
              className="-mx-4 md:-mx-8 lg:-mx-[50px] px-1 sm:px-2 md:px-3 mt-6"
            >
              <div className="flex items-center justify-between mb-3 px-3 md:px-5">
                {heading && (
                  <h3 className="text-base font-black text-[#1A1A1A]">
                    {heading}
                  </h3>
                )}
                <span className="text-[11px] font-semibold text-slate-400">
                  {cappedItems.length} items
                </span>
              </div>
              <div
                className={cn(
                  "grid gap-1.5 sm:gap-2.5",
                  columns === 1
                    ? "grid-cols-1"
                    : columns === 2
                    ? "grid-cols-2"
                    : columns === 3
                    ? "grid-cols-3"
                    : "grid-cols-2"
                )}
              >
                {items.map((product) => (
                  <div key={product._id || product.id}>
                    <ProductCard product={product} compact={columns >= 2} neutralBg={true} />
                  </div>
                ))}
              </div>
              <LazyLoadTrigger
                enabled={hasMore}
                onVisible={() => loadMoreForSection(sectionKey, cappedItems.length)}
              />
            </div>
          );
        }

        if (section.displayType === "super_ads") {
          const items = section.config?.superAds?.items || [];
          const validItems = items.filter((a) => a?.sellerId && a?.imageUrl);
          if (!validItems.length) return null;

          return (
            <SuperAdStrip
              key={section._id || sectionKey}
              sectionId={section._id}
              items={validItems}
              navigate={navigate}
            />
          );
        }

        if (section.displayType === "seller_highlights") {
          const stores = (section.config?.sellerHighlights?.sellerIds || []).filter(Boolean);
          if (!stores.length) return null;

          return (
            <div
              key={section._id || sectionKey}
              className="-mx-4 md:-mx-8 lg:-mx-[50px] px-4 md:px-8 lg:px-[50px]"
            >
              {heading && (
                <h3 className="text-base font-black text-[#1A1A1A] mb-3">{heading}</h3>
              )}
              <div className="flex overflow-x-auto gap-3 no-scrollbar pb-1 snap-x snap-mandatory">
                {stores.map((store) => (
                  <div
                    key={store._id}
                    onClick={() => navigate(buildStorePath(store))}
                    className="w-[150px] shrink-0 snap-start rounded-2xl border border-slate-100 bg-white shadow-sm cursor-pointer active:scale-95 transition-transform overflow-hidden"
                  >
                    <div className="h-16 w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      <span className="text-2xl font-black text-primary/70">
                        {String(store.shopName || "S").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="p-2.5">
                      <p className="text-[11px] font-bold text-slate-900 truncate">{store.shopName}</p>
                      <p className="text-[9px] font-semibold text-slate-400 truncate mt-0.5">{store.category || "General Store"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

export default SectionRenderer;

