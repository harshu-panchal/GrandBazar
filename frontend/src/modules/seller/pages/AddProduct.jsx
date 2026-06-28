import React, { useState, useMemo, useEffect } from "react";
import Button from "@shared/components/ui/Button";
import Badge from "@shared/components/ui/Badge";
import {
  HiOutlineArrowLeft,
  HiOutlineCube,
  HiOutlineTag,
  HiOutlineCurrencyDollar,
  HiOutlineSwatch,
  HiOutlineFolderOpen,
  HiOutlinePhoto,
  HiOutlineScale,
  HiOutlineArrowPath,
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlineSquaresPlus,
  HiOutlineXMark,
  HiOutlineSparkles,
} from "react-icons/hi2";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { sellerApi } from "../services/sellerApi";


const AddProduct = () => {
  const navigate = useNavigate();
  const [modalTab, setModalTab] = useState("general");
  const [isSaving, setIsSaving] = useState(false);

  const makeSku = (name, index = 1) => {
    const prefix =
      String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 5) || "item";
    return `${prefix}-${String(index).padStart(3, "0")}`;
  };

  const isAutoSku = (sku, name, index = 1) =>
    String(sku || "").toLowerCase() === makeSku(name, index);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    sku: "",
    description: "",
    price: "",
    salePrice: "",
    stock: "",
    lowStockAlert: 5,
    category: "",
    subcategory: "",
    header: "",
    status: "active",
    tags: "",
    weight: "",
    brand: "",
    mainImage: null,
    galleryImages: [],
    variants: [
      {
        id: Date.now(),
        name: "",
        price: "",
        salePrice: "",
        stock: "",
        sku: "",
      },
    ],
    isSignatureProduct: false,
    addons: [],
  });

  const [dbCategories, setDbCategories] = useState([]);
  const [sellerProducts, setSellerProducts] = useState([]);
  const [isLoadingCats, setIsLoadingCats] = useState(true);

  useEffect(() => {
    setFormData((prev) => {
      if (!prev.name) return prev;

      const nextSku =
        !prev.sku || isAutoSku(prev.sku, prev.name, 1)
          ? makeSku(prev.name, 1)
          : prev.sku;

      const nextVariants = prev.variants.map((variant, idx) => {
        const variantIndex = idx + 1;
        const shouldAuto =
          !variant.sku || isAutoSku(variant.sku, prev.name, variantIndex);
        return shouldAuto
          ? { ...variant, sku: makeSku(prev.name, variantIndex) }
          : variant;
      });

      const changed =
        nextSku !== prev.sku ||
        nextVariants.some((variant, idx) => variant !== prev.variants[idx]);

      return changed ? { ...prev, sku: nextSku, variants: nextVariants } : prev;
    });
  }, [formData.name]);

  React.useEffect(() => {
    const fetchCatsAndProducts = async () => {
      try {
        const [catsRes, prodsRes] = await Promise.all([
          sellerApi.getCategoryTree(),
          sellerApi.getProducts({ limit: 100 })
        ]);
        if (catsRes.data.success) {
          setDbCategories(catsRes.data.results || catsRes.data.result || []);
        }
        if (prodsRes.data.success) {
          setSellerProducts(prodsRes.data.result?.items || prodsRes.data.results?.items || []);
        }
      } catch (error) {
        toast.error("Failed to load initial data");
      } finally {
        setIsLoadingCats(false);
      }
    };
    fetchCatsAndProducts();
  }, []);

  const categories = dbCategories;

  const handleSave = async () => {
    // Validate required fields
    if (!formData.name) {
      toast.error("Please fill in the Product Title");
      return;
    }

    // Validate all three category levels are selected
    if (!formData.header || !formData.category || !formData.subcategory) {
      toast.error("Please select all three category levels: Main Group, Specific Category, and Sub-Category");
      return;
    }

    const firstVariant = formData.variants[0] || {};
    if (!firstVariant.price || !firstVariant.stock) {
      toast.error("Main variant must have price and stock");
      return;
    }

    setIsSaving(true);
    try {
      const data = new FormData();

      // Basic fields
      data.append("name", formData.name);
      data.append("slug", formData.slug);
      data.append("sku", formData.sku);
      data.append("description", formData.description);
      data.append("brand", formData.brand);
      data.append("weight", formData.weight);
      data.append("status", formData.status);

      // Map top-level price/stock from first variant for indexing/listing
      data.append("price", firstVariant.price);
      data.append("salePrice", firstVariant.salePrice || 0);
      data.append("stock", firstVariant.stock);

      // Category IDs
      data.append("headerId", formData.header);
      data.append("categoryId", formData.category);
      data.append("subcategoryId", formData.subcategory);

      // Tags
      data.append("tags", formData.tags);

      // Addons
      if (formData.addons && formData.addons.length > 0) {
        data.append("addons", JSON.stringify(formData.addons));
      }

      data.append("isSignatureProduct", formData.isSignatureProduct);

      // Images
      if (formData.mainImageFile) {
        data.append("mainImage", formData.mainImageFile);
      }

      if (formData.galleryFiles && formData.galleryFiles.length > 0) {
        formData.galleryFiles.forEach(file => {
          data.append("galleryImages", file);
        });
      }

      // Variants
      data.append("variants", JSON.stringify(formData.variants));

      const response = await sellerApi.createProduct(data);
      const approvalStatus = response?.data?.result?.approvalStatus;
      if (approvalStatus === "pending") {
        toast.success("Product submitted for admin approval");
      } else {
        toast.success(response?.data?.message || "Product saved successfully!");
      }
      navigate("/seller/products");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save product");
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = (e, type) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === "main") {
          setFormData({
            ...formData,
            mainImage: reader.result,
            mainImageFile: file
          });
        } else {
          setFormData({
            ...formData,
            galleryImages: [...formData.galleryImages, reader.result],
            galleryFiles: [...(formData.galleryFiles || []), file]
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <Button
          variant="ghost"
          className="pl-0 hover:bg-transparent hover:text-primary-600"
          onClick={() => navigate(-1)}>
          <HiOutlineArrowLeft className="mr-2 h-5 w-5" />
          Back to Products
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="min-w-[140px]">
            {isSaving ? (
              <>
                <HiOutlineArrowPath className="mr-2 h-5 w-5 animate-spin" />
                Publishing...
              </>
            ) : (
              "Save & Publish"
            )}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-xl overflow-hidden flex flex-col md:flex-row min-h-[600px] border border-slate-100">
        {/* Sidebar Tabs */}
        <div className="md:w-64 bg-slate-50/50 border-r border-slate-100 p-4 space-y-1 overflow-y-auto">
          {[
            { id: "general", label: "General Info", icon: HiOutlineTag },
            { id: "variants", label: "Item Variants", icon: HiOutlineSwatch },
            { id: "category", label: "Groups", icon: HiOutlineFolderOpen },
            { id: "media", label: "Photos", icon: HiOutlinePhoto },
            // new Add-ons tab
            { id: "addons", label: "Add-ons", icon: HiOutlineSparkles },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setModalTab(tab.id)}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3 rounded-md text-xs font-bold transition-all text-left",
                modalTab === tab.id
                  ? "bg-white text-primary shadow-sm ring-1 ring-slate-100"
                  : "text-slate-600 hover:bg-slate-100",
              )}>
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          ))}

          <div className="pt-8 px-4">
            <div className="p-4 bg-brand-50 rounded-md border border-brand-100">
              <p className="text-[9px] font-bold text-brand-600 uppercase tracking-widest mb-1">
                Status
              </p>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="w-full bg-transparent border-none text-xs font-bold text-brand-700 outline-none p-0 cursor-pointer focus:ring-0">
                <option value="active">PUBLISHED</option>
                <option value="inactive">DRAFT</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-8 overflow-y-auto">
          {modalTab === "general" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="space-y-1.5 flex flex-col">
                <label className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                  Product Title
                </label>
                <input
                  value={formData.name}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      name: nextName,
                      sku:
                        !prev.sku || isAutoSku(prev.sku, prev.name, 1)
                          ? makeSku(nextName, 1)
                          : prev.sku,
                      variants: prev.variants.map((variant, idx) => {
                        const variantIndex = idx + 1;
                        const shouldAuto =
                          !variant.sku ||
                          isAutoSku(variant.sku, prev.name, variantIndex);
                        return shouldAuto
                          ? { ...variant, sku: makeSku(nextName, variantIndex) }
                          : variant;
                      }),
                    }));
                  }}
                  className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-semibold outline-none ring-primary/5 focus:ring-2 transition-all"
                  placeholder="e.g. Premium Basmati Rice"
                />
              </div>
              <div className="space-y-1.5 flex flex-col">
                <label className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                  About this item
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  onWheel={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                  className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl text-sm font-semibold min-h-[160px] max-h-[260px] outline-none transition-all focus:ring-2 focus:ring-primary/5 resize-none overflow-y-auto custom-scrollbar"
                  placeholder="Describe the item here..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                    Brand Name
                  </label>
                  <input
                    value={formData.brand}
                    onChange={(e) =>
                      setFormData({ ...formData, brand: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-semibold outline-none ring-primary/5 focus:ring-2 transition-all"
                    placeholder="e.g. Amul"
                  />
                </div>
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                    Product Code
                  </label>
                  <input
                    value={formData.sku}
                    onChange={(e) =>
                      setFormData({ ...formData, sku: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-mono font-bold outline-none ring-primary/5 focus:ring-2 transition-all"
                    placeholder="AUTO-GENERATED"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-3 pt-4 border-t border-slate-100 mt-4">
                <input
                  type="checkbox"
                  id="signatureProduct"
                  checked={formData.isSignatureProduct}
                  onChange={(e) => setFormData({ ...formData, isSignatureProduct: e.target.checked })}
                  className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary/20 transition-all cursor-pointer"
                />
                <div className="flex flex-col">
                  <label htmlFor="signatureProduct" className="text-sm font-bold text-slate-800 cursor-pointer">
                    Mark as Signature Product
                  </label>
                  <span className="text-xs text-slate-500 font-medium">This product will be highlighted on your store and the main home page.</span>
                </div>
              </div>
            </div>
          )}

          {modalTab === "variants" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Product Variants
                  </h4>
                  <p className="text-xs text-slate-600 font-medium">
                    Add different sizes, colors or weights.
                  </p>
                </div>
                <button
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      variants: [
                        ...prev.variants,
                        {
                          id: Date.now(),
                          name: "",
                          price: "",
                          salePrice: "",
                          stock: "",
                          sku: makeSku(prev.name, prev.variants.length + 1),
                        },
                      ],
                    }))
                  }
                  className="flex items-center space-x-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-[10px] font-bold hover:bg-primary/20 transition-all">
                  <HiOutlineSquaresPlus className="h-4 w-4" />
                  <span>ADD VARIANT</span>
                </button>
              </div>

              <div className="space-y-3">
                {(formData.variants || []).map((variant, index) => (
                  <div
                    key={variant.id}
                    className="p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-end group relative">
                    <div className="col-span-12 md:col-span-3 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Variant Name
                      </label>
                      <input
                        value={variant.name}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setFormData((prev) => {
                            const newVariants = prev.variants.map((item, idx) => {
                              if (idx !== index) return item;
                              return { ...item, name: nextValue };
                            });
                            return {
                              ...prev,
                              variants: newVariants,
                            };
                          });
                        }}
                        placeholder="e.g. 1kg, 1 pack, 1 liter..."
                        className="w-full px-3 py-2 bg-white ring-1 ring-slate-200 border-none rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Price
                      </label>
                      <input
                        type="number"
                        value={variant.price}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].price = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="500"
                        className="w-full px-3 py-2 bg-white ring-1 ring-slate-200 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1">
                      <label className="text-[8px] font-bold text-brand-500 uppercase tracking-widest ml-1">
                        Sale
                      </label>
                      <input
                        type="number"
                        value={variant.salePrice}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].salePrice = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="450"
                        className="w-full px-3 py-2 bg-brand-50 ring-1 ring-brand-100 border-none rounded-xl text-xs font-bold text-brand-700 outline-none focus:ring-2 focus:ring-brand-200"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Stock
                      </label>
                      <input
                        type="number"
                        value={variant.stock}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].stock = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="10"
                        className="w-full px-3 py-2 bg-white ring-1 ring-slate-200 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="col-span-5 md:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Product Code
                      </label>
                      <input
                        value={variant.sku}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].sku = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder={makeSku(formData.name, index + 1)}
                        className="w-full px-3 py-2 bg-white ring-1 ring-slate-200 border-none rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end pb-1">
                      <button
                        onClick={() => {
                          if (formData.variants.length > 1) {
                            setFormData((prev) => {
                              const remaining = prev.variants
                                .map((variant, idx) => ({ variant, oldIndex: idx + 1 }))
                                .filter((item) => item.oldIndex !== index + 1)
                                .map((item, newIdx) => {
                                  const shouldAuto =
                                    !item.variant.sku ||
                                    isAutoSku(item.variant.sku, prev.name, item.oldIndex);
                                  return shouldAuto
                                    ? { ...item.variant, sku: makeSku(prev.name, newIdx + 1) }
                                    : item.variant;
                                });
                              return { ...prev, variants: remaining };
                            });
                          }
                        }}
                        className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {modalTab === "category" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Category Selection (Drag & Drop)
                  </h4>
                  <p className="text-xs text-slate-600 font-medium mt-1">
                    Drag a category from the pool below and drop it into the appropriate box.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    setFormData({ ...formData, header: "", category: "", subcategory: "" })
                  }
                  className="text-xs py-1.5 h-auto">
                  <HiOutlineArrowPath className="mr-1.5 h-3.5 w-3.5" />
                  Reset Selection
                </Button>
              </div>

              {/* Drop Zones */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    id: "header",
                    label: "Main Group",
                    value: formData.header,
                    options: categories,
                    active: !formData.header,
                    onDrop: (val) =>
                      setFormData({ ...formData, header: val, category: "", subcategory: "" }),
                    onClear: () =>
                      setFormData({ ...formData, header: "", category: "", subcategory: "" }),
                  },
                  {
                    id: "category",
                    label: "Specific Category",
                    value: formData.category,
                    options:
                      categories.find((h) => (h._id || h.id) === formData.header)?.children || [],
                    active: !!formData.header && !formData.category,
                    onDrop: (val) => setFormData({ ...formData, category: val, subcategory: "" }),
                    onClear: () =>
                      setFormData({ ...formData, category: "", subcategory: "" }),
                  },
                  {
                    id: "subcategory",
                    label: "Sub-Category",
                    value: formData.subcategory,
                    options:
                      categories
                        .find((h) => (h._id || h.id) === formData.header)
                        ?.children?.find((c) => (c._id || c.id) === formData.category)
                        ?.children || [],
                    active: !!formData.category && !formData.subcategory,
                    onDrop: (val) => setFormData({ ...formData, subcategory: val }),
                    onClear: () => setFormData({ ...formData, subcategory: "" }),
                  },
                ].map((zone, index) => {
                  const selectedItem = zone.options.find(
                    (opt) => (opt._id || opt.id) === zone.value
                  );

                  return (
                    <div
                      key={zone.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add("bg-primary/5", "border-primary");
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("bg-primary/5", "border-primary");
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("bg-primary/5", "border-primary");
                        const draggedId = e.dataTransfer.getData("categoryId");
                        const draggedType = e.dataTransfer.getData("categoryType");

                        // Allow dropping only if the dragged item type matches the zone type
                        if (draggedType === zone.id) {
                           zone.onDrop(draggedId);
                        } else {
                           toast.error(`Please drop a ${zone.label} here.`);
                        }
                      }}
                      className={cn(
                        "relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl transition-all duration-200",
                        zone.value
                          ? "border-primary bg-primary/5"
                          : zone.active
                          ? "border-primary/40 bg-slate-50 ring-4 ring-primary/5"
                          : "border-slate-200 bg-slate-50 opacity-60"
                      )}>
                      <div className="absolute -top-3 bg-white px-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest rounded-full border border-slate-100 shadow-sm">
                        Step {index + 1}: {zone.label}
                      </div>

                      {zone.value ? (
                        <div className="flex flex-col items-center gap-2 relative group w-full">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              zone.onClear();
                            }}
                            className="absolute -top-4 -right-4 md:-right-2 bg-white rounded-full p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 shadow-sm border border-slate-200 transition-all opacity-0 group-hover:opacity-100 z-10"
                            title={`Clear ${zone.label}`}
                          >
                            <HiOutlineXMark className="h-4 w-4" />
                          </button>
                          <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center shadow-sm text-primary">
                            <HiOutlineFolderOpen className="h-5 w-5" />
                          </div>
                          <span className="text-sm font-bold text-slate-800 text-center px-2">
                            {selectedItem?.name}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <HiOutlineFolderOpen className="h-8 w-8 opacity-50" />
                          <span className="text-xs font-medium text-center">
                            {zone.active ? "Drop here" : "Waiting for previous step..."}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Draggable Pool */}
              <div className="pt-6 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-4">
                  <HiOutlineFolderOpen className="h-5 w-5 text-primary" />
                  <h5 className="text-sm font-bold text-slate-800">Available Categories</h5>
                </div>

                <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 min-h-[200px]">
                  {(() => {
                    let currentOptions = [];
                    let currentType = "";

                    if (!formData.header) {
                      currentOptions = categories;
                      currentType = "header";
                    } else if (!formData.category) {
                      currentOptions =
                        categories.find((h) => (h._id || h.id) === formData.header)?.children ||
                        [];
                      currentType = "category";
                    } else if (!formData.subcategory) {
                      currentOptions =
                        categories
                          .find((h) => (h._id || h.id) === formData.header)
                          ?.children?.find((c) => (c._id || c.id) === formData.category)
                          ?.children || [];
                      currentType = "subcategory";
                    }

                    if (formData.header && formData.category && formData.subcategory) {
                      return (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 py-8">
                          <div className="h-12 w-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                            <HiOutlineFolderOpen className="h-6 w-6" />
                          </div>
                          <span className="text-sm font-semibold">All categories selected!</span>
                        </div>
                      );
                    }

                    if (currentOptions.length === 0) {
                       return (
                         <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 py-8">
                            <span className="text-sm font-semibold">No options available for this level.</span>
                         </div>
                       )
                    }

                    return (
                      <div className="flex flex-wrap gap-3">
                        {currentOptions.map((opt) => (
                          <div
                            key={opt._id || opt.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("categoryId", opt._id || opt.id);
                              e.dataTransfer.setData("categoryType", currentType);
                              e.currentTarget.classList.add("opacity-50", "scale-95");
                            }}
                            onDragEnd={(e) => {
                              e.currentTarget.classList.remove("opacity-50", "scale-95");
                            }}
                            className="group flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-primary hover:shadow-md transition-all">
                            <HiOutlineFolderOpen className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
                            <span className="text-sm font-bold text-slate-700 group-hover:text-primary transition-colors">
                              {opt.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {modalTab === "media" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
              {/* Main Image Section */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                  Main Cover Photo
                </label>
                <div className="flex flex-col md:flex-row items-start gap-6">
                  <div className="w-48 aspect-square rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center group hover:border-primary hover:bg-primary/5 transition-all cursor-pointer overflow-hidden relative">
                    <input
                      type="file"
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      onChange={(e) => handleImageUpload(e, "main")}
                    />
                    {formData.mainImage ? (
                      <img
                        src={formData.mainImage}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <>
                        <HiOutlinePhoto className="h-10 w-10 text-slate-200 group-hover:text-primary transition-colors" />
                        <p className="text-[9px] font-bold text-slate-600 mt-2 uppercase tracking-widest group-hover:text-primary">
                          Upload Cover
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex-1 space-y-2 pt-2">
                    <p className="text-xs font-bold text-slate-900">
                      Choose a primary image
                    </p>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      We show this image on the search page and the main
                      store listing. Make sure it is clear and bright.
                    </p>
                    <button className="text-[10px] font-black text-primary uppercase tracking-wider hover:underline">
                      Pick from Library
                    </button>
                  </div>
                </div>
              </div>

              {/* Gallery Section */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                  Gallery Photos (Max 5)
                </label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-md border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center group hover:border-primary hover:bg-primary/5 transition-all cursor-pointer relative overflow-hidden">
                      {formData.galleryImages[i - 1] ? (
                        <img
                          src={formData.galleryImages[i - 1]}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <>
                          <input
                            type="file"
                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                            onChange={(e) => handleImageUpload(e, "gallery")}
                          />
                          <HiOutlinePlus className="h-5 w-5 text-slate-200 group-hover:text-primary transition-colors" />
                          <p className="text-[8px] font-bold text-slate-600 mt-1 uppercase tracking-widest group-hover:text-primary">
                            Add
                          </p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-slate-600 font-medium italic text-center pt-4 border-t border-slate-50">
                Quick Tip: Using WebP format at 800x800px makes your store load
                3x faster.
              </p>
            </div>
          )}

          {modalTab === "addons" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Product Add-ons
                  </h4>
                  <p className="text-xs text-slate-600 font-medium mt-1">
                    Select items to recommend when customers buy this product (e.g. Sprite with Pizza).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sellerProducts.length === 0 ? (
                  <p className="text-sm text-slate-500 col-span-full">No other products available. Add more products first to use them as add-ons.</p>
                ) : (
                  sellerProducts.map(prod => {
                    const isSelected = formData.addons.includes(prod._id);
                    return (
                      <div 
                        key={prod._id}
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            addons: isSelected 
                              ? prev.addons.filter(id => id !== prod._id) 
                              : [...prev.addons, prod._id]
                          }))
                        }}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                          isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/50" : "border-slate-200 hover:border-slate-300 bg-white"
                        )}
                      >
                        <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                          {prod.mainImage ? (
                            <img src={prod.mainImage} alt={prod.name} className="w-full h-full object-cover" />
                          ) : (
                            <HiOutlinePhoto className="w-full h-full p-3 text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{prod.name}</p>
                          <p className="text-[10px] text-slate-500 font-medium">₹{prod.price}</p>
                        </div>
                        <div className={cn(
                          "w-5 h-5 rounded-full border flex items-center justify-center transition-all",
                          isSelected ? "bg-primary border-primary text-white" : "border-slate-300 text-transparent"
                        )}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          
        </div>
      </div>
    </div>
  );
};

export default AddProduct;
