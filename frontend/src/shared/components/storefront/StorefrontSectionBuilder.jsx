import React, { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  LayoutGrid,
  List,
  Plus,
  RectangleHorizontal,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getStorefrontProductId,
  resolveStorefrontSections,
} from "@shared/utils/storefrontSections";

export const STOREFRONT_LAYOUT_OPTIONS = [
  { value: "carousel", label: "Horizontal carousel", icon: RectangleHorizontal },
  { value: "grid", label: "Product grid", icon: LayoutGrid },
  { value: "featured", label: "Large featured product", icon: Sparkles },
  { value: "compact_list", label: "Compact list", icon: List },
];

const sectionKey = (section) => String(section?._id || section?.clientId || "");
const productKey = (product) => String(product?._id || product?.id || "");

const previewPrice = (product) => {
  const base = Number(product?.customerPrice ?? product?.price ?? 0);
  const sale = Number(product?.customerSalePrice ?? product?.salePrice ?? 0);
  return sale > 0 && (base <= 0 || sale < base) ? sale : base;
};

const PreviewProduct = ({ product, horizontal = false, featured = false }) => (
  <div className={cn(
    "overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm",
    horizontal ? "flex min-h-20" : "flex flex-col",
    featured && "rounded-2xl",
  )}>
    <div className={cn(
      "shrink-0 overflow-hidden bg-slate-100",
      horizontal ? "w-20" : featured ? "aspect-[16/9]" : "aspect-square",
    )}>
      {product?.mainImage ? (
        <img src={product.mainImage} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-slate-100 to-slate-200" />
      )}
    </div>
    <div className={cn("min-w-0 flex-1 p-2", featured && "p-3")}>
      <p className={cn("truncate font-bold text-slate-900", featured ? "text-sm" : "text-[11px]")}>{product?.name}</p>
      <p className="mt-1 text-[10px] font-black text-slate-800">₹{previewPrice(product)}</p>
      <button type="button" tabIndex={-1} className="mt-2 rounded-md border border-emerald-500 px-2 py-1 text-[8px] font-black text-emerald-600">ADD</button>
    </div>
  </div>
);

function moveItem(items, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

const StorefrontSectionBuilder = ({
  products = [],
  sections = [],
  onChange,
  onSaveDraft,
  onPublish,
  isSaving = false,
  isPublishing = false,
  hasUnpublishedChanges = false,
  publishedAt = null,
  title = "Product Sections",
  description = "Build the product area customers see on your store page.",
}) => {
  const [pickerValues, setPickerValues] = useState({});
  const dragRef = useRef(null);

  const productsById = useMemo(
    () => new Map(products.map((product) => [productKey(product), product])),
    [products],
  );
  const unassignedProducts = useMemo(
    () => resolveStorefrontSections(sections, products)
      .find((section) => section._id === "all-products")?.products || [],
    [sections, products],
  );

  const emitSections = (next) => onChange?.(next);

  const addSection = () => {
    emitSections([
      ...sections,
      {
        clientId: `section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: "New product section",
        layout: "carousel",
        productIds: [],
      },
    ]);
  };

  const updateSection = (key, changes) => {
    emitSections(
      sections.map((section) =>
        sectionKey(section) === key ? { ...section, ...changes } : section,
      ),
    );
  };

  const removeSection = (key) => {
    emitSections(sections.filter((section) => sectionKey(section) !== key));
  };

  const moveSection = (key, direction) => {
    const index = sections.findIndex((section) => sectionKey(section) === key);
    const target = direction === "up" ? index - 1 : index + 1;
    if (target >= 0 && target < sections.length) emitSections(moveItem(sections, index, target));
  };

  const addProduct = (section) => {
    const key = sectionKey(section);
    const value = String(pickerValues[key] || "");
    if (!value) return;
    const current = (section.productIds || []).map(String);
    const productIds = section.layout === "featured"
      ? [value]
      : current.includes(value) ? current : [...current, value];
    updateSection(key, { productIds });
    setPickerValues((prev) => ({ ...prev, [key]: "" }));
  };

  const removeProduct = (section, id) => {
    updateSection(sectionKey(section), {
      productIds: (section.productIds || []).map(String).filter((productId) => productId !== id),
    });
  };

  const moveProduct = (section, id, direction) => {
    const ids = (section.productIds || []).map(String);
    const index = ids.indexOf(id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (target >= 0 && target < ids.length) {
      updateSection(sectionKey(section), { productIds: moveItem(ids, index, target) });
    }
  };

  const beginPointerSort = (event, scope, id) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    dragRef.current = { scope, id, lastTargetId: null };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const continuePointerSort = (event) => {
    const active = dragRef.current;
    if (!active) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest?.(`[data-sort-scope="${active.scope}"]`);
    const targetId = target?.dataset?.sortId;
    if (!targetId || targetId === active.id || targetId === active.lastTargetId) return;

    if (active.scope === "sections") {
      const from = sections.findIndex((section) => sectionKey(section) === active.id);
      const to = sections.findIndex((section) => sectionKey(section) === targetId);
      if (from >= 0 && to >= 0) emitSections(moveItem(sections, from, to));
      active.lastTargetId = targetId;
      return;
    }

    const ownerKey = active.scope.replace("products-", "");
    const section = sections.find((item) => sectionKey(item) === ownerKey);
    if (!section) return;
    const ids = (section.productIds || []).map(String);
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(targetId);
    if (from >= 0 && to >= 0) updateSection(ownerKey, { productIds: moveItem(ids, from, to) });
    active.lastTargetId = targetId;
  };

  const endPointerSort = () => {
    dragRef.current = null;
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black text-slate-900">{title}</h2>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
                hasUnpublishedChanges
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700",
              )}
            >
              {hasUnpublishedChanges ? "Draft changes" : "Published"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
          {publishedAt && (
            <p className="mt-1 text-[11px] font-semibold text-slate-400">
              Last published {new Date(publishedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addSection}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            <Plus size={15} /> Add section
          </button>
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={isSaving || isPublishing}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-800 disabled:opacity-50"
          >
            <Save size={15} /> {isSaving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={isSaving || isPublishing}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
          >
            <Upload size={15} /> {isPublishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs font-semibold text-blue-800">
        Products may appear in more than one section. Products not assigned to any published section automatically appear under “All Products.”
      </div>

      {sections.length === 0 ? (
        <button
          type="button"
          onClick={addSection}
          className="flex min-h-44 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 text-slate-500 hover:border-slate-300"
        >
          <Plus size={28} />
          <span className="mt-2 text-sm font-black">Create your first product section</span>
        </button>
      ) : (
        <div className="space-y-8 rounded-[2rem] bg-slate-50 p-3 sm:p-6">
          {sections.map((section, sectionIndex) => {
            const key = sectionKey(section);
            const selectedIds = (section.productIds || []).map(String);
            const availableProducts = products.filter(
              (product) => !selectedIds.includes(productKey(product)),
            );
            return (
              <article
                key={key}
                data-sort-scope="sections"
                data-sort-id={key}
                className="rounded-3xl border border-dashed border-slate-300 bg-white p-4 shadow-sm sm:p-6"
              >
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <button
                        type="button"
                        aria-label="Drag section to reorder"
                        onPointerDown={(event) => beginPointerSort(event, "sections", key)}
                        onPointerMove={continuePointerSort}
                        onPointerUp={endPointerSort}
                        onPointerCancel={endPointerSort}
                        className="mt-1 cursor-grab touch-none rounded-lg p-2 text-slate-400 hover:bg-slate-100 active:cursor-grabbing"
                      >
                        <GripVertical size={18} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <input
                          aria-label="Section title"
                          value={section.title || ""}
                          maxLength={120}
                          onChange={(event) => updateSection(key, { title: event.target.value })}
                          className="w-full border-b border-dashed border-transparent bg-transparent px-1 py-1 text-xl font-black tracking-tight text-slate-900 outline-none hover:border-slate-300 focus:border-slate-500"
                        />
                        <p className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{selectedIds.length} products</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 self-end sm:self-auto">
                      <select
                        aria-label="Section layout"
                        value={section.layout}
                        onChange={(event) => {
                          const layout = event.target.value;
                          updateSection(key, { layout, productIds: layout === "featured" ? selectedIds.slice(0, 1) : selectedIds });
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none"
                      >
                        {STOREFRONT_LAYOUT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <button type="button" disabled={sectionIndex === 0} onClick={() => moveSection(key, "up")} className="rounded-lg p-2 text-slate-500 disabled:opacity-25" aria-label="Move section up"><ArrowUp size={15} /></button>
                      <button type="button" disabled={sectionIndex === sections.length - 1} onClick={() => moveSection(key, "down")} className="rounded-lg p-2 text-slate-500 disabled:opacity-25" aria-label="Move section down"><ArrowDown size={15} /></button>
                      <button type="button" onClick={() => removeSection(key)} className="rounded-lg p-2 text-rose-500" aria-label="Delete section"><Trash2 size={15} /></button>
                    </div>
                  </div>

                  {selectedIds.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-xs font-semibold text-slate-400">Add products to display this section.</div>
                  ) : (
                    <div className={cn(
                      section.layout === "carousel" && "flex snap-x gap-3 overflow-x-auto pb-3 no-scrollbar",
                      section.layout === "grid" && "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
                      section.layout === "featured" && "max-w-xl rounded-[2rem] bg-gradient-to-br from-amber-50 via-white to-rose-50 p-4",
                      section.layout === "compact_list" && "grid gap-3 lg:grid-cols-2",
                    )}>
                      {selectedIds.map((id, productIndex) => {
                        const product = productsById.get(id);
                        return (
                          <div
                            key={id}
                            data-sort-scope={`products-${key}`}
                            data-sort-id={id}
                            className={cn(
                              "relative group/product",
                              section.layout === "carousel" && "w-[150px] shrink-0 snap-start sm:w-[190px] md:w-[210px]",
                              section.layout === "featured" && "w-full",
                            )}
                          >
                            <PreviewProduct product={product} horizontal={section.layout === "compact_list"} featured={section.layout === "featured"} />
                            <div className="absolute left-1.5 top-1.5 z-20 flex items-center rounded-lg bg-white/95 p-0.5 shadow-md backdrop-blur">
                              <button type="button" aria-label="Drag product to reorder" onPointerDown={(event) => beginPointerSort(event, `products-${key}`, id)} onPointerMove={continuePointerSort} onPointerUp={endPointerSort} onPointerCancel={endPointerSort} className="cursor-grab touch-none rounded-md p-1.5 text-slate-500 active:cursor-grabbing"><GripVertical size={14} /></button>
                              <span className="px-1 text-[9px] font-black text-slate-400">{productIndex + 1}</span>
                            </div>
                            <div className="absolute right-1.5 top-1.5 z-20 flex items-center rounded-lg bg-white/95 p-0.5 shadow-md backdrop-blur">
                              <button type="button" disabled={productIndex === 0} onClick={() => moveProduct(section, id, "up")} className="rounded-md p-1.5 text-slate-500 disabled:opacity-25" aria-label="Move product up"><ArrowUp size={13} /></button>
                              <button type="button" disabled={productIndex === selectedIds.length - 1} onClick={() => moveProduct(section, id, "down")} className="rounded-md p-1.5 text-slate-500 disabled:opacity-25" aria-label="Move product down"><ArrowDown size={13} /></button>
                              <button type="button" onClick={() => removeProduct(section, id)} className="rounded-md p-1.5 text-rose-500" aria-label="Remove product"><Trash2 size={13} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-2">
                    <select value={pickerValues[key] || ""} onChange={(event) => setPickerValues((prev) => ({ ...prev, [key]: event.target.value }))} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold outline-none">
                      <option value="">Choose a product…</option>
                      {availableProducts.map((product) => <option key={productKey(product)} value={productKey(product)}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}
                    </select>
                    <button type="button" onClick={() => addProduct(section)} disabled={!pickerValues[key]} className="rounded-xl bg-slate-900 px-4 text-xs font-black text-white disabled:opacity-40">Add product</button>
                  </div>
                </div>
              </article>
            );
          })}

          {unassignedProducts.length > 0 && (
            <section className="space-y-4 rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-900">All Products</h2>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Automatic · {unassignedProducts.length} products</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {unassignedProducts.map((product) => <PreviewProduct key={getStorefrontProductId(product)} product={product} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
};

export default StorefrontSectionBuilder;
