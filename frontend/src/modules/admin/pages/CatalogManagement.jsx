import React, { useState, useEffect, useMemo } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import { adminApi } from "../services/adminApi";
import { toast } from "sonner";
import {
  HiOutlinePlus,
  HiOutlineCube,
  HiOutlineMagnifyingGlass,
  HiOutlineFunnel,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlineArrowPath,
  HiOutlineXMark,
  HiOutlineChevronRight,
  HiOutlineCheckCircle,
  HiOutlineFolderOpen,
  HiOutlineSquaresPlus,
  HiOutlineSparkles,
} from "react-icons/hi2";
import Modal from "@shared/components/ui/Modal";
import Pagination from "@shared/components/ui/Pagination";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import axiosInstance from '@core/api/axios'; // Direct import for uploading images to media upload

const CatalogManagement = () => {
  const [catalogItems, setCatalogItems] = useState([]);
  const [categories, setCategories] = useState([]); // Tree format
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  
  // Tabs inside creation/edit: 'single' | 'bulk'
  const [activeTab, setActiveTab] = useState("single");
  const [modalTab, setModalTab] = useState("general");

  // Single Product Form Data
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    brand: "",
    weight: "",
    tags: "",
    alternativeNames: "",
    headerId: "",
    categoryId: "",
    subcategoryId: "",
    mainImage: "",
    galleryImages: [],
    syncToSellers: false,
  });

  // Bulk Products Rows
  const [bulkRows, setBulkRows] = useState([
    {
      id: Date.now(),
      name: "",
      description: "",
      brand: "",
      weight: "",
      tags: "",
      headerId: "",
      categoryId: "",
      subcategoryId: "",
      mainImage: "",
      galleryImages: [],
      isUploadingMain: false,
      isUploadingGallery: false,
    }
  ]);

  const fetchCategories = async () => {
    try {
      const response = await adminApi.getCategoryTree();
      if (response.data.success) {
        setCategories(response.data.results || response.data.result || []);
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const fetchCatalog = async (requestedPage = 1) => {
    setIsLoading(true);
    try {
      const params = { page: requestedPage, limit: pageSize };
      if (searchTerm) params.search = searchTerm;
      if (filterCategory !== "all") params.categoryId = filterCategory;

      const response = await adminApi.getCatalogProducts(params);
      if (response.data.success) {
        const payload = response.data.result || {};
        setCatalogItems(payload.items || []);
        setTotal(payload.total || 0);
        setPage(payload.page || requestedPage);
      }
    } catch (error) {
      toast.error("Failed to fetch catalog items");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCatalog(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, filterCategory, pageSize]);

  // Prevent background scrolling when any modal is open
  useEffect(() => {
    if (isModalOpen || isDeleteModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isModalOpen, isDeleteModalOpen]);

  // Image Upload helper using project's direct media uploader
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

  // Single form image upload
  const handleSingleImageUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    toast.loading("Uploading image...");
    try {
      const url = await uploadImageFile(file);
      if (type === "main") {
        setFormData(prev => ({ ...prev, mainImage: url }));
        toast.success("Main image uploaded successfully");
      } else {
        setFormData(prev => ({ ...prev, galleryImages: [...prev.galleryImages, url] }));
        toast.success("Gallery image added");
      }
    } catch (error) {
      toast.error("Failed to upload image");
    } finally {
      toast.dismiss();
    }
  };

  // Save Single Product
  const handleSaveSingle = async () => {
    if (!formData.name || !formData.description || !formData.mainImage || !formData.headerId || !formData.categoryId || !formData.subcategoryId) {
      toast.error("Please fill in all required fields, categories, and main image.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        tags: formData.tags.split(",").map(t => t.trim()).filter(Boolean),
        alternativeNames: formData.alternativeNames.split(",").map(n => n.trim()).filter(Boolean)
      };

      if (editingItem) {
        await adminApi.updateCatalogProduct(editingItem._id || editingItem.id, payload);
        toast.success("Catalog product updated successfully");
      } else {
        await adminApi.createCatalogProduct(payload);
        toast.success("Catalog product created successfully");
      }
      setIsModalOpen(false);
      fetchCatalog(page);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save product");
    } finally {
      setIsSaving(false);
    }
  };

  // Add Bulk Row
  const addBulkRow = () => {
    setBulkRows(prev => [
      ...prev,
      {
        id: Date.now(),
        name: "",
        description: "",
        brand: "",
        weight: "",
        tags: "",
        headerId: "",
        categoryId: "",
        subcategoryId: "",
        mainImage: "",
        galleryImages: [],
        isUploadingMain: false,
        isUploadingGallery: false,
      }
    ]);
  };

  // Remove Bulk Row
  const removeBulkRow = (rowId) => {
    if (bulkRows.length === 1) {
      toast.error("At least one product is required.");
      return;
    }
    setBulkRows(prev => prev.filter(r => r.id !== rowId));
  };

  // Update Bulk Row fields
  const updateBulkRowField = (rowId, field, value) => {
    setBulkRows(prev => prev.map(row => {
      if (row.id === rowId) {
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  // Upload main image for specific bulk row
  const handleBulkMainUpload = async (e, rowId) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkRows(prev => prev.map(r => r.id === rowId ? { ...r, isUploadingMain: true } : r));
    try {
      const url = await uploadImageFile(file);
      setBulkRows(prev => prev.map(r => r.id === rowId ? { ...r, mainImage: url, isUploadingMain: false } : r));
      toast.success("Row main image uploaded");
    } catch (error) {
      toast.error("Failed to upload row image");
      setBulkRows(prev => prev.map(r => r.id === rowId ? { ...r, isUploadingMain: false } : r));
    }
  };

  // Save Bulk Products
  const handleSaveBulk = async () => {
    // Validate all rows
    for (let i = 0; i < bulkRows.length; i++) {
      const r = bulkRows[i];
      if (!r.name.trim() || !r.description.trim() || !r.mainImage || !r.headerId || !r.categoryId || !r.subcategoryId) {
        toast.error(`Please complete all required fields and main image for product row #${i + 1}`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const products = bulkRows.map(r => ({
        name: r.name.trim(),
        description: r.description.trim(),
        brand: r.brand.trim(),
        weight: r.weight.trim(),
        tags: r.tags.split(",").map(t => t.trim()).filter(Boolean),
        mainImage: r.mainImage,
        galleryImages: r.galleryImages,
        headerId: r.headerId,
        categoryId: r.categoryId,
        subcategoryId: r.subcategoryId,
        status: "active"
      }));

      await adminApi.createCatalogProductsBulk({ products });
      toast.success(`${products.length} products added to catalog successfully!`);
      setIsModalOpen(false);
      fetchCatalog(1);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to bulk create products.");
    } finally {
      setIsSaving(false);
    }
  };

  // Open creation/edit modal
  const openModal = (item = null) => {
    if (item) {
      setFormData({
        name: item.name || "",
        description: item.description || "",
        brand: item.brand || "",
        weight: item.weight || "",
        tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
        alternativeNames: Array.isArray(item.alternativeNames) ? item.alternativeNames.join(", ") : "",
        headerId: item.headerId?._id || item.headerId || "",
        categoryId: item.categoryId?._id || item.categoryId || "",
        subcategoryId: item.subcategoryId?._id || item.subcategoryId || "",
        mainImage: item.mainImage || "",
        galleryImages: item.galleryImages || [],
        syncToSellers: false,
      });
      setEditingItem(item);
      setActiveTab("single"); // Editing is single only
    } else {
      setFormData({
        name: "",
        description: "",
        brand: "",
        weight: "",
        tags: "",
        alternativeNames: "",
        headerId: "",
        categoryId: "",
        subcategoryId: "",
        mainImage: "",
        galleryImages: [],
        syncToSellers: false,
      });
      setBulkRows([
        {
          id: Date.now(),
          name: "",
          description: "",
          brand: "",
          weight: "",
          tags: "",
          headerId: "",
          categoryId: "",
          subcategoryId: "",
          mainImage: "",
          galleryImages: [],
          isUploadingMain: false,
          isUploadingGallery: false,
        }
      ]);
      setEditingItem(null);
      setActiveTab("single");
    }
    setModalTab("general");
    setIsModalOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await adminApi.deleteCatalogProduct(itemToDelete._id || itemToDelete.id);
      toast.success("Catalog product deleted successfully");
      setIsDeleteModalOpen(false);
      fetchCatalog(page);
    } catch (error) {
      toast.error("Failed to delete catalog product");
    }
  };

  // Helper for generating dynamic subcategory selections based on headers & categories
  const currentCategoriesList = useMemo(() => {
    if (!formData.headerId) return [];
    const matchedHeader = categories.find(c => c._id === formData.headerId);
    return matchedHeader?.children || [];
  }, [formData.headerId, categories]);

  const currentSubcategoriesList = useMemo(() => {
    if (!formData.categoryId) return [];
    const matchedCat = currentCategoriesList.find(c => c._id === formData.categoryId);
    return matchedCat?.children || [];
  }, [formData.categoryId, currentCategoriesList]);

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            Master Product Catalog
            <Badge variant="primary" className="text-[9px] px-1.5 py-0 font-bold uppercase tracking-wider">
              Centralized
            </Badge>
          </h1>
          <p className="text-gray-500 mt-1">
            Create standard catalog items that sellers can pick, price, and sell.
          </p>
        </div>
        <button
          onClick={() => openModal(null)}
          className="flex items-center gap-2 bg-black text-white px-4 py-2.5 rounded-lg hover:bg-brand-700 transition-colors text-sm font-semibold"
        >
          <HiOutlinePlus className="h-5 w-5" />
          Create Catalog Item
        </button>
      </div>

      {/* Filter and Search Section */}
      <Card className="border-none shadow-sm ring-1 ring-slate-100 p-3 bg-white/60 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row gap-3 items-center">
          <div className="relative flex-1 group w-full">
            <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-black transition-all" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search catalog items by name..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100/50 border-none rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-black/5 transition-all outline-none"
            />
          </div>
          <div className="flex gap-2 shrink-0 w-full lg:w-auto">
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

      {/* Table Data */}
      <Card className="border-none shadow-xl ring-1 ring-slate-100 overflow-hidden rounded-xl bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[40%]">Product Details</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Brand</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Header</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Subcategory</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[12%]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <HiOutlineArrowPath className="h-8 w-8 text-black animate-spin" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading Catalog...</p>
                    </div>
                  </td>
                </tr>
              ) : catalogItems.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-20 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                    No catalog items found. Create one to get started.
                  </td>
                </tr>
              ) : (
                catalogItems.map((item) => (
                  <tr key={item._id || item.id} className="hover:bg-gray-50/50 transition-colors group border-b border-gray-100 last:border-b-0">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                          <img
                            src={item.mainImage || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=200&h=200"}
                            alt={item.name}
                            className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                          <p className="text-[11px] text-slate-400 truncate max-w-sm">{item.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {item.brand || "N/A"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium text-slate-900 bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full">
                        {item.headerId?.name || "N/A"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-semibold text-slate-950">
                        {item.categoryId?.name || "N/A"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium text-slate-500">
                        {item.subcategoryId?.name || "N/A"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => openModal(item)}
                          className="p-1.5 hover:text-black rounded-lg transition-all text-slate-400 hover:bg-slate-100"
                        >
                          <HiOutlinePencilSquare className="h-4.5 w-4.5" />
                        </button>
                        <button
                          onClick={() => { setItemToDelete(item); setIsDeleteModalOpen(true); }}
                          className="p-1.5 hover:text-rose-600 rounded-lg transition-all text-slate-400 hover:bg-rose-50"
                        >
                          <HiOutlineTrash className="h-4.5 w-4.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-slate-100">
          <Pagination
            page={page}
            totalPages={Math.ceil(total / pageSize) || 1}
            total={total}
            pageSize={pageSize}
            onPageChange={(p) => fetchCatalog(p)}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            loading={isLoading}
          />
        </div>
      </Card>

      {/* Main Creation/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 lg:p-12 overflow-hidden overscroll-contain">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-5xl relative z-10 bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              data-lenis-prevent
              data-lenis-prevent-touch
              data-lenis-prevent-wheel
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                    <HiOutlineCube className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {editingItem ? "Edit Catalog Item" : "Create Master Catalog Product"}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Define canonical catalog attributes.
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                  <HiOutlineXMark className="h-5 w-5" />
                </button>
              </div>

              {/* Edit Mode Tab Toggles (Only show on Create) */}
              {!editingItem && (
                <div className="flex border-b border-slate-100 bg-slate-50/50 px-5">
                  <button
                    onClick={() => setActiveTab("single")}
                    className={cn(
                      "px-4 py-3 text-xs font-bold border-b-2 transition-all",
                      activeTab === "single" ? "border-black text-black" : "border-transparent text-slate-500 hover:text-slate-950"
                    )}
                  >
                    Single Product
                  </button>
                  <button
                    onClick={() => setActiveTab("bulk")}
                    className={cn(
                      "px-4 py-3 text-xs font-bold border-b-2 transition-all",
                      activeTab === "bulk" ? "border-black text-black" : "border-transparent text-slate-500 hover:text-slate-950"
                    )}
                  >
                    Bulk Add Products
                  </button>
                </div>
              )}

              {/* Form Content Area */}
              <div 
                className="flex-1 overflow-y-auto p-6 custom-scrollbar-light max-h-[70vh]"
                data-lenis-prevent
                data-lenis-prevent-touch
                data-lenis-prevent-wheel
              >
                {activeTab === "single" ? (
                  <div className="space-y-6">
                    {/* Single Tab Layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2 flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product Title *</label>
                        <input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-black/5"
                          placeholder="e.g. iPhone 15 Pro Max"
                        />
                      </div>
                      <div className="space-y-2 flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Brand Name</label>
                        <input
                          value={formData.brand}
                          onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-black/5"
                          placeholder="e.g. Apple"
                        />
                      </div>
                    </div>

                    <div className="space-y-2 flex flex-col">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description *</label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-100 border-none rounded-xl text-sm font-semibold min-h-[100px] outline-none focus:ring-2 focus:ring-black/5"
                        placeholder="Describe the product details..."
                      />
                    </div>

                    {/* Categories dropdowns */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2 flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Header Category *</label>
                        <select
                          value={formData.headerId}
                          onChange={(e) => setFormData({ ...formData, headerId: e.target.value, categoryId: "", subcategoryId: "" })}
                          className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-semibold outline-none cursor-pointer"
                        >
                          <option value="">Select Header</option>
                          {categories.map(c => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2 flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Main Category *</label>
                        <select
                          value={formData.categoryId}
                          disabled={!formData.headerId}
                          onChange={(e) => setFormData({ ...formData, categoryId: e.target.value, subcategoryId: "" })}
                          className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-semibold outline-none cursor-pointer disabled:opacity-50"
                        >
                          <option value="">Select Category</option>
                          {currentCategoriesList.map(c => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2 flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sub-Category *</label>
                        <select
                          value={formData.subcategoryId}
                          disabled={!formData.categoryId}
                          onChange={(e) => setFormData({ ...formData, subcategoryId: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-semibold outline-none cursor-pointer disabled:opacity-50"
                        >
                          <option value="">Select Subcategory</option>
                          {currentSubcategoriesList.map(c => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2 flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Weight (e.g. 500g, 1kg)</label>
                        <input
                          value={formData.weight}
                          onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-black/5"
                          placeholder="e.g. 1kg"
                        />
                      </div>
                      <div className="space-y-2 flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tags (comma-separated)</label>
                        <input
                          value={formData.tags}
                          onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-black/5"
                          placeholder="e.g. mobile, electronics, apple"
                        />
                      </div>
                      <div className="space-y-2 flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Alternative Names (comma-separated)</label>
                        <input
                          value={formData.alternativeNames}
                          onChange={(e) => setFormData({ ...formData, alternativeNames: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-black/5"
                          placeholder="e.g. सेब, Fresh Apple, Washington Apple"
                        />
                      </div>
                    </div>

                    {/* Image uploads */}
                    <div className="space-y-4">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product Images</label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Main Image Upload Box */}
                        <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center min-h-[140px] relative overflow-hidden bg-slate-50 hover:bg-slate-100/50 transition-colors">
                          {formData.mainImage ? (
                            <>
                              <img src={formData.mainImage} alt="Main" className="absolute inset-0 w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, mainImage: "" }))}
                                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 transition-colors"
                              >
                                <HiOutlineXMark className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full">
                              <HiOutlinePhoto className="h-8 w-8 text-slate-400 mb-1" />
                              <span className="text-[11px] font-bold text-slate-500">Upload Main Image *</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleSingleImageUpload(e, "main")}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>

                        {/* Gallery Images Boxes */}
                        {formData.galleryImages.map((img, idx) => (
                          <div key={idx} className="border border-slate-200 rounded-xl min-h-[140px] relative overflow-hidden">
                            <img src={img} alt="Gallery" className="absolute inset-0 w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, galleryImages: prev.galleryImages.filter((_, i) => i !== idx) }))}
                              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 transition-colors"
                            >
                              <HiOutlineXMark className="h-4 w-4" />
                            </button>
                          </div>
                        ))}

                        {formData.galleryImages.length < 5 && (
                          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center min-h-[140px] bg-slate-50 hover:bg-slate-100/50 transition-colors">
                            <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full">
                              <HiOutlinePlus className="h-7 w-7 text-slate-400 mb-1" />
                              <span className="text-[10px] font-bold text-slate-500">Add Gallery Image</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleSingleImageUpload(e, "gallery")}
                                className="hidden"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Sync to Sellers Checkbox (Only on Edit) */}
                    {editingItem && (
                      <div className="flex items-center space-x-3 bg-brand-50 p-4 rounded-xl border border-brand-100">
                        <input
                          id="syncToSellers"
                          type="checkbox"
                          checked={formData.syncToSellers}
                          onChange={(e) => setFormData(prev => ({ ...prev, syncToSellers: e.target.checked }))}
                          className="h-4 w-4 rounded border-brand-300 text-black focus:ring-black"
                        />
                        <label htmlFor="syncToSellers" className="text-xs font-bold text-brand-700 cursor-pointer">
                          Sync updates to all active seller product listings linked to this catalog item.
                        </label>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Bulk Tab Layout */}
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs font-bold text-amber-700 flex items-center gap-2">
                      <HiOutlineSparkles className="h-5 w-5 shrink-0" />
                      <span>Admins can add multiple products at once. Images are uploaded instantly upon selection.</span>
                    </div>

                    <div className="space-y-4">
                      {bulkRows.map((row, index) => {
                        const rowCategories = categories.find(c => c._id === row.headerId)?.children || [];
                        const rowSubcategories = rowCategories.find(c => c._id === row.categoryId)?.children || [];

                        return (
                          <div key={row.id} className="border border-slate-200 rounded-xl p-5 bg-slate-50/30 space-y-4 relative">
                            {/* Remove Row Button */}
                            <button
                              type="button"
                              onClick={() => removeBulkRow(row.id)}
                              className="absolute top-4 right-4 text-slate-400 hover:text-red-500 p-1 hover:bg-slate-100 rounded-full transition-colors"
                              title="Delete Row"
                            >
                              <HiOutlineTrash className="h-5 w-5" />
                            </button>

                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                              Product Row #{index + 1}
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Name *</label>
                                <input
                                  value={row.name}
                                  onChange={(e) => updateBulkRowField(row.id, "name", e.target.value)}
                                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-black/5"
                                  placeholder="Product Name"
                                />
                              </div>

                              <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Brand</label>
                                <input
                                  value={row.brand}
                                  onChange={(e) => updateBulkRowField(row.id, "brand", e.target.value)}
                                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-black/5"
                                  placeholder="Brand Name"
                                />
                              </div>
                            </div>

                            <div className="flex flex-col space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description *</label>
                              <textarea
                                value={row.description}
                                onChange={(e) => updateBulkRowField(row.id, "description", e.target.value)}
                                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold min-h-[60px] max-h-[120px] outline-none resize-y"
                                placeholder="Write description..."
                              />
                            </div>

                            {/* Category pickers for row */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Header Category *</label>
                                <select
                                  value={row.headerId}
                                  onChange={(e) => {
                                    setBulkRows(prev => prev.map(item => item.id === row.id ? { ...item, headerId: e.target.value, categoryId: "", subcategoryId: "" } : item));
                                  }}
                                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none cursor-pointer"
                                >
                                  <option value="">Select Header</option>
                                  {categories.map(c => (
                                    <option key={c._id} value={c._id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Main Category *</label>
                                <select
                                  value={row.categoryId}
                                  disabled={!row.headerId}
                                  onChange={(e) => {
                                    setBulkRows(prev => prev.map(item => item.id === row.id ? { ...item, categoryId: e.target.value, subcategoryId: "" } : item));
                                  }}
                                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none cursor-pointer disabled:opacity-50"
                                >
                                  <option value="">Select Category</option>
                                  {rowCategories.map(c => (
                                    <option key={c._id} value={c._id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sub-Category *</label>
                                <select
                                  value={row.subcategoryId}
                                  disabled={!row.categoryId}
                                  onChange={(e) => updateBulkRowField(row.id, "subcategoryId", e.target.value)}
                                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none cursor-pointer disabled:opacity-50"
                                >
                                  <option value="">Select Subcategory</option>
                                  {rowSubcategories.map(c => (
                                    <option key={c._id} value={c._id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Weight</label>
                                <input
                                  value={row.weight}
                                  onChange={(e) => updateBulkRowField(row.id, "weight", e.target.value)}
                                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                                  placeholder="e.g. 500g"
                                />
                              </div>

                              <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tags (comma-separated)</label>
                                <input
                                  value={row.tags}
                                  onChange={(e) => updateBulkRowField(row.id, "tags", e.target.value)}
                                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                                  placeholder="e.g. organic, nuts"
                                />
                              </div>
                            </div>

                            {/* Row Image upload */}
                            <div className="flex items-center gap-4">
                              <div className="h-14 w-14 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden relative flex items-center justify-center shrink-0">
                                {row.mainImage ? (
                                  <img src={row.mainImage} alt="Preview" className="h-full w-full object-cover" />
                                ) : (
                                  <HiOutlinePhoto className="h-6 w-6 text-slate-400" />
                                )}
                              </div>
                              <div className="flex flex-col space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Main Image *</label>
                                <label className="cursor-pointer bg-white border border-slate-200 hover:bg-slate-50 transition-colors px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1.5 w-fit">
                                  {row.isUploadingMain ? (
                                    <>
                                      <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                                      <span>Uploading...</span>
                                    </>
                                  ) : (
                                    <>
                                      <HiOutlinePhoto className="h-4 w-4" />
                                      <span>Choose Main Image</span>
                                    </>
                                  )}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    disabled={row.isUploadingMain}
                                    onChange={(e) => handleBulkMainUpload(e, row.id)}
                                    className="hidden"
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={addBulkRow}
                      className="flex items-center justify-center gap-1.5 w-full py-3 border-2 border-dashed border-slate-200 text-slate-500 hover:text-black hover:border-black rounded-xl transition-all text-xs font-bold bg-white"
                    >
                      <HiOutlinePlus className="h-4 w-4" />
                      <span>Add Product Row</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end p-5 border-t border-slate-100 bg-slate-50/50 space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-xs font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={activeTab === "single" ? handleSaveSingle : handleSaveBulk}
                  disabled={isSaving}
                  className="px-5 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {isSaving && <HiOutlineArrowPath className="h-4 w-4 animate-spin" />}
                  <span>{editingItem ? "Save Changes" : "Save to Catalog"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Catalog Item"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Are you sure you want to delete this catalog item? This will remove the item from the master catalog, and unlink any sellers actively listing this product.
          </p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-4 py-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-xs font-bold text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CatalogManagement;
