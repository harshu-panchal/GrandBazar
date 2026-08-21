import React, { useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { QUICK_CATEGORY_PALETTES } from "../../constants/homeConstants";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";
import QuickCategoriesBg from "@/assets/Catagorysection_bg.png";

const QuickCategorySlider = ({ categories, onCategoryClick }) => {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -300 : 300;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  if (!categories || categories.length === 0) return null;

  return (
    <div className="w-full mb-5 -mt-[24px] md:mt-3 overflow-hidden relative group z-20">
      <div
        className="relative overflow-hidden bg-white shadow-[0_14px_28px_rgba(15,23,42,0.09)]"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.65) 100%), url(${QuickCategoriesBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}>
        <div className="absolute inset-0 bg-white/10 pointer-events-none" />

        <div className="relative z-10 px-4 pt-2.5 pb-0.5 md:px-8 md:pt-4">
          <h2 className="text-center text-[17px] md:text-[20px] font-bold tracking-tight text-[#132018] leading-none">
            Quick categories
          </h2>
        </div>

        {/* Left Scroll Button */}
        <div className="absolute left-4 lg:left-10 top-[58%] -translate-y-1/2 z-20 hidden md:flex">
          <button
            onClick={() => scroll("left")}
            className="h-10 w-10 bg-white/90 backdrop-blur-md shadow-xl rounded-full flex items-center justify-center border border-gray-100 cursor-pointer hover:bg-white text-primary transition-all active:scale-90">
            <ChevronLeft size={22} strokeWidth={3} />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="relative z-10 flex items-start gap-2 md:gap-3 lg:gap-4 overflow-x-auto no-scrollbar px-4 pb-2 pt-1 md:px-8 md:pb-4 snap-x scroll-smooth">
          {categories.map((cat, idx) => {
            const palette = QUICK_CATEGORY_PALETTES[idx % QUICK_CATEGORY_PALETTES.length];
            return (
              <div
                key={cat.id}
                onClick={() => onCategoryClick(cat.id)}
                className="flex flex-col items-center gap-2 min-w-[68px] md:min-w-[84px] cursor-pointer group/item snap-start transition-transform active:scale-95 pb-1">
                <div
                  className="w-[64px] h-[64px] md:w-[76px] md:h-[76px] rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.06)] bg-white p-0.5 transition-all duration-300 group-hover/item:-translate-y-1 group-hover/item:shadow-[0_8px_16px_rgba(0,0,0,0.1)]">
                  <div className="w-full h-full rounded-full overflow-hidden bg-slate-50 relative">
                    <img
                      src={applyCloudinaryTransform(cat.image, "f_auto,q_auto,w_150")}
                      alt={cat.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover/item:scale-110 transition-transform duration-500"
                    />
                  </div>
                </div>
                <div className="w-full text-center px-0.5">
                  <span className="block text-[10px] md:text-[11px] font-bold text-slate-800 leading-tight w-full line-clamp-2 transition-colors group-hover/item:text-primary">
                    {cat.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Scroll Button */}
        <div className="absolute right-4 lg:right-10 top-[58%] -translate-y-1/2 z-20 hidden md:flex">
          <button
            onClick={() => scroll("right")}
            className="h-10 w-10 bg-white/90 backdrop-blur-md shadow-xl rounded-full flex items-center justify-center border border-gray-100 cursor-pointer hover:bg-white text-primary transition-all active:scale-90">
            <ChevronRight size={22} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(QuickCategorySlider);
