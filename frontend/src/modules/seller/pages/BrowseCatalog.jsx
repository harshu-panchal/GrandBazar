import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "@core/api/axios";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import { sellerApi } from "../services/sellerApi";
import { toast } from "sonner";
import {
  HiOutlineMagnifyingGlass,
  HiOutlineChevronRight,
  HiOutlineTag,
  HiOutlineXMark,
  HiOutlineInboxStack,
  HiOutlineCurrencyDollar,
  HiOutlineArchiveBox,
  HiOutlineArrowPath,
  HiOutlineSquaresPlus,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePhoto,
  HiOutlineSparkles,
} from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";

const BrowseCatalog = () => {
  const navigate = useNavigate();
  const [catalogItems, setCatalogItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sellerProducts, setSellerProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // Claim Form Inputs
  const [claimData, setClaimData] = useState({
    name: "",
    price: "",
    salePrice: "",
    stock: "",
    sku: "",
    variants: [],
    imagesList: [],
    isSignatureProduct: false,
    addons: [],
  });

  const fetchCategories = async () => {
    try {
      const [catsRes, prodsRes] = await Promise.all([
        sellerApi.getCategoryTree(),
        sellerApi.getProducts({ limit: 100 })
      ]);
      if (catsRes.data.success) {
        setCategories(catsRes.data.results || catsRes.data.result || []);
      }
      if (prodsRes.data.success) {
        setSellerProducts(prodsRes.data.result?.items || prodsRes.data.results?.items || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCatalog = async () => {
    setIsLoading(true);
    try {
      const params = { page: 1, limit: 40, status: "active" };
      if (searchTerm) params.search = searchTerm;
      if (filterCategory !== "all") {
        const isHeader = categories.some(h => (h._id || h.id) === filterCategory);
        if (isHeader) {
          params.headerId = filterCategory;
        } else {
          params.categoryId = filterCategory;
        }
      }

      const response = await sellerApi.getCatalogProducts(params);
      if (response.data.success) {
        setCatalogItems(response.data.result?.items || []);
      }
    } catch (error) {
      toast.error("Failed to load catalog products");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCatalog();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, filterCategory]);

  useEffect(() => {
    if (isClaimModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isClaimModalOpen]);

  const handleBulkClaim = async () => {
    if (selectedItems.length === 0) return;
    setIsBulkSubmitting(true);
    try {
      const payload = {
        products: catalogItems
          .filter(item => selectedItems.includes(item._id || item.id))
          .map(item => ({
            catalogProductId: item._id || item.id,
            price: 100, // Default price
            stock: 10,  // Default stock
            name: item.name,
            mainImage: item.mainImage
          }))
      };
      
      const res = await sellerApi.bulkClaimCatalogProducts(payload);
      if (res.data.success) {
        toast.success(res.data.message || "Bulk clone successful!");
        setSelectedItems([]);
        navigate("/seller/products");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to bulk clone products");
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const openClaimModal = (product) => {
    const initialImages = [];
    if (product.mainImage) {
      initialImages.push({
        url: product.mainImage,
        isCatalog: true,
        isSelected: true,
        isMain: true
      });
    }
    if (Array.isArray(product.galleryImages)) {
      product.galleryImages.forEach(img => {
        if (img && img !== product.mainImage) {
          initialImages.push({
            url: img,
            isCatalog: true,
            isSelected: true,
            isMain: false
          });
        }
      });
    }

    setSelectedProduct(product);
    setClaimData({
      name: product.name || "",
      price: "",
      salePrice: "",
      stock: "10",
      sku: "",
      variants: [],
      imagesList: initialImages,
      isSignatureProduct: false,
      addons: []
    });
    setIsClaimModalOpen(true);
  };

  const uploadImageFile = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await axiosInstance.post("/media/upload", fd, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    if (res.data && res.data.success) {
      return res.data.result?.url || res.data.result?.secureUrl;
    }
    throw new Error("Upload failed");
  };

  const handleSingleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    toast.loading("Uploading image...");
    try {
      const url = await uploadImageFile(file);
      setClaimData(prev => {
        const hasMain = prev.imagesList.some(img => img.isSelected && img.isMain);
        return {
          ...prev,
          imagesList: [
            ...prev.imagesList,
            {
              url,
              isCatalog: false,
              isSelected: true,
              isMain: !hasMain
            }
          ]
        };
      });
      toast.success("Custom image uploaded successfully");
    } catch (error) {
      toast.error("Failed to upload image");
    } finally {
      toast.dismiss();
    }
  };

  const toggleImageSelection = (index) => {
    setClaimData(prev => {
      const newList = prev.imagesList.map((img, idx) => {
        if (idx === index) {
          const isSelected = !img.isSelected;
          const isMain = isSelected ? img.isMain : false;
          return { ...img, isSelected, isMain };
        }
        return img;
      });

      // If we deselected the main image, set the first other selected image as main
      const wasMain = prev.imagesList[index].isMain && prev.imagesList[index].isSelected;
      if (wasMain) {
        const firstSelected = newList.find(img => img.isSelected);
        if (firstSelected) {
          firstSelected.isMain = true;
        }
      }

      return { ...prev, imagesList: newList };
    });
  };

  const setImageAsMain = (index) => {
    setClaimData(prev => {
      const newList = prev.imagesList.map((img, idx) => ({
        ...img,
        isMain: idx === index,
        isSelected: idx === index ? true : img.isSelected
      }));
      return { ...prev, imagesList: newList };
    });
  };

  const deleteCustomImage = (index) => {
    setClaimData(prev => {
      const newList = prev.imagesList.filter((_, idx) => idx !== index);
      // If we deleted the main image, make sure another one is selected as main
      if (prev.imagesList[index].isMain) {
        const firstSelected = newList.find(img => img.isSelected);
        if (firstSelected) {
          firstSelected.isMain = true;
        }
      }
      return { ...prev, imagesList: newList };
    });
  };

  const addVariantRow = () => {
    setClaimData(prev => ({
      ...prev,
      variants: [
        ...prev.variants,
        { id: Date.now(), name: "", price: "", salePrice: "", stock: "", sku: "" }
      ]
    }));
  };

  const removeVariantRow = (id) => {
    setClaimData(prev => ({
      ...prev,
      variants: prev.variants.filter(v => v.id !== id)
    }));
  };

  const updateVariantField = (id, field, value) => {
    setClaimData(prev => ({
      ...prev,
      variants: prev.variants.map(v => v.id === id ? { ...v, [field]: value } : v)
    }));
  };

  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    if (!claimData.name || !claimData.name.trim()) {
      toast.error("Please enter a valid product title.");
      return;
    }
    if (!claimData.price || Number(claimData.price) <= 0) {
      toast.error("Please enter a valid selling price.");
      return;
    }
    if (claimData.stock === "" || Number(claimData.stock) < 0) {
      toast.error("Please enter a valid stock level.");
      return;
    }

    // Verify variants if any
    for (const v of claimData.variants) {
      if (!v.name.trim() || !v.price || Number(v.price) <= 0 || !v.stock) {
        toast.error("Please complete all fields for added variants.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const selectedMainImage = claimData.imagesList.find(img => img.isSelected && img.isMain)?.url;
      const selectedGallery = claimData.imagesList
        .filter(img => img.isSelected && !img.isMain)
        .map(img => img.url);

      if (!selectedMainImage) {
        toast.error("Please select at least one cover photo.");
        setIsSubmitting(false);
        return;
      }

      const payload = {
        catalogProductId: selectedProduct._id || selectedProduct.id,
        name: claimData.name.trim(),
        price: Number(claimData.price),
        salePrice: Number(claimData.salePrice) || 0,
        stock: Number(claimData.stock),
        sku: claimData.sku.trim(),
        mainImage: selectedMainImage,
        galleryImages: selectedGallery,
        variants: claimData.variants.map(v => ({
          name: v.name.trim(),
          price: Number(v.price),
          salePrice: Number(v.salePrice) || 0,
          stock: Number(v.stock),
          sku: v.sku.trim()
        })),
        isSignatureProduct: claimData.isSignatureProduct,
        addons: claimData.addons
      };

      const res = await sellerApi.claimCatalogProduct(payload);
      if (res.data.success) {
        toast.success("Product successfully added to your store!");
        setIsClaimModalOpen(false);
        navigate("/seller/products");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to claim product");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            Browse Master Catalog
            <Badge variant="success" className="text-[9px] px-1.5 py-0 font-bold uppercase tracking-wider">
              Easy Selling
            </Badge>
          </h1>
          <p className="text-gray-500 mt-1">
            Pick pre-approved products from our centralized database and start selling instantly.
          </p>
        </div>
        {selectedItems.length > 0 && (
          <button
            onClick={handleBulkClaim}
            disabled={isBulkSubmitting}
            className="px-5 py-2.5 bg-black text-white hover:bg-slate-800 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
          >
            {isBulkSubmitting ? <HiOutlineArrowPath className="h-5 w-5 animate-spin" /> : <HiOutlineSquaresPlus className="h-5 w-5" />}
            <span>Clone {selectedItems.length} Products</span>
          </button>
        )}
      </div>

      {/* Filters & Search */}
      <Card className="border-none shadow-sm ring-1 ring-slate-100 p-3 bg-white/60 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row gap-3 items-center">
          <div className="relative flex-1 group w-full">
            <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-black transition-all" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search master catalog products..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100/50 border-none rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-black/5 transition-all outline-none"
            />
          </div>
          <div className="flex gap-2 shrink-0 w-full lg:w-auto">
            {catalogItems.length > 0 && catalogItems.some(i => !i.isClaimed) && (
              <button
                onClick={() => {
                  const claimableItems = catalogItems.filter(i => !i.isClaimed);
                  if (selectedItems.length === claimableItems.length && claimableItems.length > 0) {
                    setSelectedItems([]);
                  } else {
                    setSelectedItems(claimableItems.map(item => item._id || item.id));
                  }
                }}
                className="px-4 py-2.5 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {selectedItems.length === catalogItems.filter(i => !i.isClaimed).length && catalogItems.filter(i => !i.isClaimed).length > 0 ? "Deselect All" : "Select All"}
              </button>
            )}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="flex-1 lg:flex-none px-4 py-2.5 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-black/5 outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Categories</option>
              {categories.map((h) => (
                <optgroup key={h._id || h.id} label={h.name}>
                  <option value={h._id || h.id}>All {h.name}</option>
                  {(h.children || []).map((c) => (
                    <option key={c._id || c.id} value={c._id || c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Products Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="animate-pulse border-none ring-1 ring-slate-100 p-4 space-y-4">
              <div className="h-44 bg-slate-200 rounded-lg" />
              <div className="h-4 bg-slate-200 rounded w-2/3" />
              <div className="h-3 bg-slate-200 rounded w-1/2" />
              <div className="h-8 bg-slate-200 rounded" />
            </Card>
          ))}
        </div>
      ) : catalogItems.length === 0 ? (
        <Card className="p-12 text-center border-none shadow-sm ring-1 ring-slate-100 bg-white">
          <HiOutlineInboxStack className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No Catalog Products Available</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            There are currently no products in the master catalog matching your search filters.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {catalogItems.map((item) => (
            <Card
              key={item._id || item.id}
              className="border-none shadow-sm hover:shadow-xl ring-1 ring-slate-100 p-4 flex flex-col justify-between group bg-white transition-all duration-300"
            >
              <div className="space-y-3">
                {/* Image */}
                <div className="h-40 rounded-lg overflow-hidden bg-slate-50 border border-slate-200 relative shrink-0">
                  {!item.isClaimed && (
                    <input
                      type="checkbox"
                      className="absolute top-2 right-2 z-20 w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer shadow-sm"
                      checked={selectedItems.includes(item._id || item.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedItems(prev => [...prev, item._id || item.id]);
                        } else {
                          setSelectedItems(prev => prev.filter(id => id !== (item._id || item.id)));
                        }
                      }}
                    />
                  )}
                  <img
                    src={item.mainImage || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=200&h=200"}
                    alt={item.name}
                    className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  {item.brand && (
                    <span className="absolute top-2 left-2 text-[9px] font-bold text-slate-900 bg-white px-2 py-0.5 rounded shadow-sm uppercase tracking-wider">
                      {item.brand}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div>
                  <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                    {item.categoryId?.name || "Category"}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 mt-0.5 group-hover:text-black transition-colors" title={item.name}>
                    {item.name}
                  </h3>
                  <p className="text-xs text-slate-400 line-clamp-2 mt-1" title={item.description}>
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Action */}
              <div className="pt-4 mt-auto">
                <button
                  onClick={() => !item.isClaimed && openClaimModal(item)}
                  disabled={item.isClaimed}
                  className={`w-full flex items-center justify-center gap-1 transition-colors py-2 rounded-lg text-xs font-semibold ${
                    item.isClaimed 
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                      : "bg-black text-white hover:bg-slate-800"
                  }`}
                >
                  {item.isClaimed ? <HiOutlineSparkles className="h-4 w-4" /> : <HiOutlinePlus className="h-4 w-4" />}
                  <span>{item.isClaimed ? "Already Added" : "Add this product"}</span>
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Claim Customization Modal */}
      <AnimatePresence>
        {isClaimModalOpen && selectedProduct && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 overflow-hidden overscroll-contain">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
              onClick={() => setIsClaimModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-4xl relative z-10 bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                    <HiOutlineInboxStack className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      Configure Listing details
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      You are adding {selectedProduct.name} to your shop.
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsClaimModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                  <HiOutlineXMark className="h-5 w-5" />
                </button>
              </div>

              {/* Form Scroll Container */}
              <form onSubmit={handleClaimSubmit} className="flex-1 flex flex-col overflow-hidden">
                <div 
                  className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar-light"
                  data-lenis-prevent
                  data-lenis-prevent-touch
                  data-lenis-prevent-wheel
                >
                  {/* Canonical Preview (Read Only) */}
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex gap-4">
                  <img
                    src={selectedProduct.mainImage}
                    alt={selectedProduct.name}
                    className="h-20 w-20 object-cover rounded-lg border border-slate-200 bg-white shrink-0"
                  />
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Master Product Details (Read-Only)</p>
                    <h4 className="text-sm font-semibold text-slate-900 mt-0.5">{selectedProduct.name}</h4>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{selectedProduct.description}</p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold uppercase">
                        {selectedProduct.brand || "No Brand"}
                      </span>
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold">
                        {selectedProduct.categoryId?.name}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Listing Title configuration */}
                <div className="flex flex-col space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Listing Title *</label>
                  <input
                    type="text"
                    value={claimData.name}
                    onChange={(e) => setClaimData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-black/5"
                    placeholder="e.g. Fresh Red Apple"
                    required
                  />
                  {((selectedProduct.alternativeNames && selectedProduct.alternativeNames.length > 0) || selectedProduct.name) && (
                    <div className="flex flex-wrap gap-1.5 items-center mt-1">
                      <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Suggestions:</span>
                      {[selectedProduct.name, ...(selectedProduct.alternativeNames || [])].map((sName, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setClaimData(prev => ({ ...prev, name: sName }))}
                          className={`text-[9.5px] font-bold px-3 py-1 rounded-full transition-all border ${
                            claimData.name === sName 
                              ? 'bg-black border-black text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-350'
                          }`}
                        >
                          {sName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Images Selection & Upload Grid */}
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Product Images Selection</h4>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                      Select which images to display on your listing. Click an image to select/deselect it, set one as Main cover, or upload your own.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    {claimData.imagesList.map((img, idx) => (
                      <div
                        key={idx}
                        className={`relative aspect-square rounded-xl overflow-hidden border-2 bg-white transition-all group ${
                          img.isSelected 
                            ? "border-black shadow-sm" 
                            : "border-slate-200 opacity-60 hover:opacity-85"
                        }`}
                      >
                        {/* Image Preview */}
                        <img
                          src={img.url}
                          alt={`Product ${idx}`}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => toggleImageSelection(idx)}
                        />

                        {/* Top-Right Toggle Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleImageSelection(idx)}
                          className={`absolute top-2 right-2 h-5 w-5 rounded-full flex items-center justify-center border z-10 transition-all ${
                            img.isSelected
                              ? "bg-black border-black text-white"
                              : "bg-white/85 border-slate-350 text-transparent"
                          }`}
                        >
                          <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20">
                            <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                          </svg>
                        </button>

                        {/* Star/Main Badge in Bottom-Left */}
                        {img.isSelected && (
                          <div className="absolute bottom-2 left-2 z-10">
                            {img.isMain ? (
                              <span className="text-[9px] font-bold bg-black text-white px-2 py-0.5 rounded-full uppercase tracking-wider shadow">
                                Cover Photo
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setImageAsMain(idx)}
                                className="text-[9px] font-bold bg-white text-slate-700 border border-slate-255/80 hover:bg-slate-50 px-2 py-0.5 rounded-full uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity shadow"
                              >
                                Set Cover
                              </button>
                            )}
                          </div>
                        )}

                        {/* Delete Button for Custom Images */}
                        {!img.isCatalog && (
                          <button
                            type="button"
                            onClick={() => deleteCustomImage(idx)}
                            className="absolute top-2 left-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <HiOutlineXMark className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}

                    {/* Upload Custom Image card */}
                    <div className="aspect-square border-2 border-dashed border-slate-350 rounded-xl flex flex-col items-center justify-center bg-white hover:bg-slate-100/50 transition-colors relative cursor-pointer">
                      <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full">
                        <HiOutlinePhoto className="h-7 w-7 text-slate-400 mb-1" />
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Upload Custom</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleSingleImageUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Seller Config */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Selling Price (₹) *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                      <input
                        type="number"
                        value={claimData.price}
                        onChange={(e) => setClaimData(prev => ({ ...prev, price: e.target.value }))}
                        className="w-full pl-7 pr-4 py-2.5 bg-slate-100 border-none rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-black/5"
                        placeholder="e.g. 999"
                        required
                        min="1"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Discount/Sale Price (₹, Optional)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                      <input
                        type="number"
                        value={claimData.salePrice}
                        onChange={(e) => setClaimData(prev => ({ ...prev, salePrice: e.target.value }))}
                        className="w-full pl-7 pr-4 py-2.5 bg-slate-100 border-none rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-black/5"
                        placeholder="e.g. 799"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stock Available *</label>
                    <input
                      type="number"
                      value={claimData.stock}
                      onChange={(e) => setClaimData(prev => ({ ...prev, stock: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-black/5"
                      placeholder="e.g. 50"
                      required
                      min="0"
                    />
                  </div>

                  <div className="flex flex-col space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Seller SKU (Optional)</label>
                    <input
                      type="text"
                      value={claimData.sku}
                      onChange={(e) => setClaimData(prev => ({ ...prev, sku: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-black/5"
                      placeholder="Leave blank for auto SKU"
                    />
                  </div>
                </div>

                {/* Seller Variants Section */}
                <div className="space-y-4 pt-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Store Variants (Optional)</label>
                    <button
                      type="button"
                      onClick={addVariantRow}
                      className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      <HiOutlinePlus className="h-4 w-4" />
                      <span>Add Variant</span>
                    </button>
                  </div>

                  {claimData.variants.length > 0 && (
                    <div className="space-y-3">
                      <datalist id="variant-suggestions">
                        <option value="100g" />
                        <option value="250g" />
                        <option value="500g" />
                        <option value="1kg" />
                        <option value="2kg" />
                        <option value="5kg" />
                        <option value="1 Pack" />
                        <option value="2 Pack" />
                        <option value="1 Piece" />
                        <option value="1 Dozen" />
                        <option value="250ml" />
                        <option value="500ml" />
                        <option value="1L" />
                        <option value="Small" />
                        <option value="Medium" />
                        <option value="Large" />
                      </datalist>
                      {claimData.variants.map((v) => (
                        <div key={v.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 border border-slate-100 p-3 rounded-lg bg-slate-50/50 items-end relative">
                          <button
                            type="button"
                            onClick={() => removeVariantRow(v.id)}
                            className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 hover:bg-red-200 transition-all border border-red-200"
                          >
                            <HiOutlineXMark className="h-3.5 w-3.5" />
                          </button>

                          <div className="flex flex-col space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Variant Name *</span>
                            <input
                              type="text"
                              list="variant-suggestions"
                              value={v.name}
                              onChange={(e) => updateVariantField(v.id, "name", e.target.value)}
                              placeholder="e.g. 1kg, 1 Pack"
                              className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-semibold outline-none"
                            />
                          </div>

                          <div className="flex flex-col space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Price (₹) *</span>
                            <input
                              type="number"
                              value={v.price}
                              onChange={(e) => updateVariantField(v.id, "price", e.target.value)}
                              placeholder="₹"
                              className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-semibold outline-none"
                            />
                          </div>

                          <div className="flex flex-col space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Discount Price</span>
                            <input
                              type="number"
                              value={v.salePrice}
                              onChange={(e) => updateVariantField(v.id, "salePrice", e.target.value)}
                              placeholder="₹"
                              className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-semibold outline-none"
                            />
                          </div>

                          <div className="flex flex-col space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Stock *</span>
                            <input
                              type="number"
                              value={v.stock}
                              onChange={(e) => updateVariantField(v.id, "stock", e.target.value)}
                              placeholder="Quantity"
                              className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-semibold outline-none"
                            />
                          </div>

                          <div className="flex flex-col space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Variant SKU</span>
                            <input
                              type="text"
                              value={v.sku}
                              onChange={(e) => updateVariantField(v.id, "sku", e.target.value)}
                              placeholder="SKU"
                              className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-semibold outline-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Signature Product Toggle */}
                <div className="flex items-center space-x-3 pt-4 border-t border-slate-100">
                  <input
                    type="checkbox"
                    id="signatureProduct"
                    checked={claimData.isSignatureProduct}
                    onChange={(e) => setClaimData(prev => ({ ...prev, isSignatureProduct: e.target.checked }))}
                    className="w-5 h-5 rounded border-slate-305 text-indigo-600 focus:ring-indigo-600/20 transition-all cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <label htmlFor="signatureProduct" className="text-xs font-bold text-slate-800 cursor-pointer">
                      Mark as Signature Product
                    </label>
                    <span className="text-[10px] text-slate-500 font-semibold">This product will be highlighted on your store and the main home page.</span>
                  </div>
                </div>

                {/* Product Add-ons Selection */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <HiOutlineSparkles className="h-4 w-4 text-indigo-600" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Product Add-ons</h4>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        Select items to recommend when customers buy this product (e.g. Sprite with Pizza).
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-48 overflow-y-auto p-1 border border-slate-150 rounded-xl bg-slate-50/50">
                    {sellerProducts.length === 0 ? (
                      <p className="text-[11px] text-slate-500 col-span-full p-2 italic text-center">
                        No other products available. Add more products first to use them as add-ons.
                      </p>
                    ) : (
                      sellerProducts.map(prod => {
                        const isSelected = claimData.addons.includes(prod._id);
                        return (
                          <div 
                            key={prod._id}
                            onClick={() => {
                              setClaimData(prev => ({
                                ...prev,
                                addons: isSelected 
                                  ? prev.addons.filter(id => id !== prod._id) 
                                  : [...prev.addons, prod._id]
                              }))
                            }}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-left ${
                              isSelected ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600" : "border-slate-200 hover:border-slate-350 bg-white"
                            }`}
                          >
                            <div className="w-8 h-8 rounded bg-slate-100 overflow-hidden flex-shrink-0">
                              {prod.mainImage || prod.image ? (
                                <img src={prod.mainImage || prod.image} alt={prod.name} className="w-full h-full object-cover" />
                              ) : (
                                <HiOutlinePhoto className="w-full h-full p-2 text-slate-300" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-slate-800 truncate">{prod.name}</p>
                              <p className="text-[9px] text-slate-500 font-semibold">₹{prod.price}</p>
                            </div>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                              isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 text-transparent"
                            }`}>
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                
                </div>

                {/* Footer buttons inside form */}
                <div className="flex items-center justify-end border-t border-slate-100 p-5 space-x-3 bg-slate-50/50">
                  <button
                    type="button"
                    onClick={() => setIsClaimModalOpen(false)}
                    className="px-4 py-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-xs font-bold text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-black text-white hover:bg-slate-800 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSubmitting && <HiOutlineArrowPath className="h-4 w-4 animate-spin" />}
                    <span>Add to My Store</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BrowseCatalog;
