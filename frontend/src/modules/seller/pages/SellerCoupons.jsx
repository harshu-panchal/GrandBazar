import React, { useState, useEffect, useMemo } from "react";
import {
  HiOutlineTag,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePencilSquare,
} from "react-icons/hi2";
import { useToast } from "@shared/components/ui/Toast";
import Modal from "@shared/components/ui/Modal";
import { sellerApi } from "../services/sellerApi";

const COUPON_TYPES = [
  { value: "generic", label: "Generic" },
  { value: "min_order_value", label: "Minimum Order Value" },
  { value: "free_delivery", label: "Free Delivery" },
  { value: "category_based", label: "Category Based" },
  { value: "bulk_order", label: "Bulk Order" },
];

const DISCOUNT_TYPES = [
  { value: "percentage", label: "Percentage" },
  { value: "fixed", label: "Fixed Amount" },
  { value: "free_delivery", label: "Free Delivery" },
];

const normalizeCouponCode = (code = "") =>
  String(code).trim().toUpperCase().replace(/\s+/g, " ");

const emptyForm = {
  code: "",
  title: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  maxDiscount: "",
  minOrderValue: "",
  validFrom: "",
  validTill: "",
  isActive: true,
};

const SellerCoupons = () => {
  const { showToast } = useToast();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const today = new Date().toISOString().split("T")[0];

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await sellerApi.getCoupons();
      const list = res.data?.results || res.data?.result || [];
      setCoupons(Array.isArray(list) ? list : []);
    } catch {
      showToast("Failed to load coupons", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const stats = useMemo(
    () => ({
      total: coupons.length,
      active: coupons.filter((c) => c.isActive).length,
      redeemed: coupons.reduce((sum, c) => sum + (c.usedCount || 0), 0),
    }),
    [coupons],
  );

  const openModal = (coupon = null) => {
    if (coupon) {
      setEditingCoupon(coupon);
      setFormData({
        code: coupon.code || "",
        title: coupon.title || "",
        description: coupon.description || "",
        discountType: coupon.discountType || "percentage",
        discountValue: coupon.discountValue ?? "",
        maxDiscount: coupon.maxDiscount ?? "",
        minOrderValue: coupon.minOrderValue ?? "",
        validFrom: coupon.validFrom ? coupon.validFrom.substring(0, 10) : today,
        validTill: coupon.validTill ? coupon.validTill.substring(0, 10) : "",
        isActive: coupon.isActive !== false,
      });
    } else {
      setEditingCoupon(null);
      setFormData({ ...emptyForm, validFrom: today });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const normalizedCode = normalizeCouponCode(formData.code);
      if (!normalizedCode) {
        showToast("Coupon code is required", "error");
        return;
      }

      const payload = {
        ...formData,
        code: normalizedCode,
        discountValue: Number(formData.discountValue) || 0,
        maxDiscount: formData.maxDiscount ? Number(formData.maxDiscount) : undefined,
        minOrderValue: formData.minOrderValue ? Number(formData.minOrderValue) : 0,
      };
      if (editingCoupon) {
        await sellerApi.updateCoupon(editingCoupon._id, payload);
        showToast("Coupon updated", "success");
      } else {
        await sellerApi.createCoupon(payload);
        showToast("Coupon created", "success");
      }
      setIsModalOpen(false);
      fetchCoupons();
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to save coupon", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this coupon?")) return;
    try {
      await sellerApi.deleteCoupon(id);
      showToast("Coupon deleted", "success");
      fetchCoupons();
    } catch {
      showToast("Failed to delete coupon", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <HiOutlineTag className="w-8 h-8 text-primary-600" />
            Offers & Coupons
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your store&apos;s promotional offers and discount coupons
          </p>
        </div>
        <button
          type="button"
          onClick={() => openModal()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-sm font-semibold shadow-sm transition-colors shrink-0"
        >
          <HiOutlinePlus className="w-5 h-5" />
          Create Coupon
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Coupons", value: stats.total },
          { label: "Active", value: stats.active },
          { label: "Total Redemptions", value: stats.redeemed },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4"
          >
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading coupons...</p>
      ) : coupons.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center">
          <HiOutlineTag className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Coupons Yet</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-6">
            Create promotional coupons to boost your sales and attract more customers.
          </p>
          <button
            type="button"
            onClick={() => openModal()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
          >
            <HiOutlinePlus className="w-5 h-5" />
            Create Coupon
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {["Code", "Title", "Discount", "Usage", "Valid Till", "Status", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {coupons.map((coupon) => (
                <tr key={coupon._id}>
                  <td className="px-4 py-3 font-mono text-sm">{coupon.code}</td>
                  <td className="px-4 py-3 text-sm">{coupon.title || "—"}</td>
                  <td className="px-4 py-3 text-sm">
                    {coupon.discountType === "percentage"
                      ? `${coupon.discountValue}%`
                      : coupon.discountType === "free_delivery"
                        ? "Free Delivery"
                        : `₹${coupon.discountValue}`}
                  </td>
                  <td className="px-4 py-3 text-sm">{coupon.usedCount || 0}</td>
                  <td className="px-4 py-3 text-sm">
                    {coupon.validTill
                      ? new Date(coupon.validTill).toLocaleDateString("en-IN")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        coupon.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {coupon.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openModal(coupon)}
                        className="p-1.5 text-gray-500 hover:text-primary-600"
                      >
                        <HiOutlinePencilSquare className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(coupon._id)}
                        className="p-1.5 text-gray-500 hover:text-red-600"
                      >
                        <HiOutlineTrash className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCoupon ? "Edit Coupon" : "Create Coupon"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Code</label>
              <input
                required
                value={formData.code}
                onChange={(e) =>
                  setFormData({ ...formData, code: normalizeCouponCode(e.target.value) })
                }
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800"
                placeholder="e.g. SALE20"
              />
              <p className="mt-1 text-xs text-gray-500">Use letters and numbers; spaces are allowed.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Discount Type</label>
              <select
                value={formData.discountType}
                onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800"
              >
                {DISCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Discount Value</label>
              <input
                type="number"
                min="0"
                value={formData.discountValue}
                onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Min Order Value</label>
              <input
                type="number"
                min="0"
                value={formData.minOrderValue}
                onChange={(e) => setFormData({ ...formData, minOrderValue: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Discount</label>
              <input
                type="number"
                min="0"
                value={formData.maxDiscount}
                onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Valid From</label>
              <input
                type="date"
                required
                value={formData.validFrom}
                onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Valid Till</label>
              <input
                type="date"
                required
                value={formData.validTill}
                onChange={(e) => setFormData({ ...formData, validTill: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg font-medium"
            >
              {editingCoupon ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SellerCoupons;
