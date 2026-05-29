import React from "react";
import { HiOutlineTag } from "react-icons/hi2";

const SellerCoupons = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <HiOutlineTag className="w-8 h-8 text-primary-600" />
            Offers & Coupons
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your store's promotional offers and discount coupons
          </p>
        </div>
        <button className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors">
          Create New Coupon
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-600 mb-4">
          <HiOutlineTag className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Coupons Yet
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          Create promotional coupons to boost your sales and attract more customers to your store.
        </p>
      </div>
    </div>
  );
};

export default SellerCoupons;
