import React, { useMemo } from "react";
import { Compass } from "lucide-react";
import ProductCard from "../shared/ProductCard";
import {
  getStorefrontProductId as productId,
  resolveStorefrontSections,
} from "@shared/utils/storefrontSections";

const StorefrontProductSections = ({ sections = [], products = [] }) => {
  const resolvedSections = useMemo(
    () => resolveStorefrontSections(sections, products),
    [sections, products],
  );

  if (resolvedSections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm">
        <Compass size={36} className="mb-3 animate-pulse text-slate-400" />
        <h4 className="mb-1 text-sm font-black uppercase tracking-wider text-slate-800">No items found</h4>
        <p className="max-w-[240px] text-xs font-semibold text-slate-400">
          No items match your selected filter or search term in this seller&apos;s catalog.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-9">
      {resolvedSections.map((section) => (
        <section key={String(section._id)} className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">{section.title}</h2>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {section.products.length} {section.products.length === 1 ? "product" : "products"}
              </p>
            </div>
          </div>

          {section.layout === "carousel" && (
            <div className="flex snap-x gap-3 overflow-x-auto pb-3 sm:gap-4 no-scrollbar">
              {section.products.map((product) => (
                <div key={productId(product)} className="w-[150px] shrink-0 snap-start sm:w-[190px] md:w-[210px]">
                  <ProductCard product={product} compact neutralBg className="hover:scale-[1.03]" />
                </div>
              ))}
            </div>
          )}

          {section.layout === "grid" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 md:gap-5">
              {section.products.map((product) => (
                <ProductCard key={productId(product)} product={product} compact neutralBg className="hover:scale-[1.03]" />
              ))}
            </div>
          )}

          {section.layout === "featured" && section.products[0] && (
            <div className="max-w-xl rounded-[2rem] bg-gradient-to-br from-amber-50 via-white to-rose-50 p-4 sm:p-6">
              <ProductCard product={section.products[0]} compact={false} neutralBg className="max-w-none" />
            </div>
          )}

          {section.layout === "compact_list" && (
            <div className="grid gap-3 lg:grid-cols-2">
              {section.products.map((product) => (
                <ProductCard key={productId(product)} product={product} compact neutralBg horizontal />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
};

export default StorefrontProductSections;
