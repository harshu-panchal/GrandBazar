import React, { useEffect, useState } from "react";
import { HiOutlineChartBar } from "react-icons/hi2";
import { sellerApi } from "../services/sellerApi";

const SellerRewards = () => {
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    sellerApi.getRewardAnalytics().then((res) => {
      setAnalytics(res.data?.result ?? null);
    }).catch(console.error);
  }, []);

  const grantStats = analytics?.grants ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HiOutlineChartBar className="w-8 h-8 text-primary-600" />
          Rewards Dashboard
        </h1>
        <p className="text-gray-500 mt-1">Campaign performance and reward costs</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {grantStats.length === 0 ? (
          <div className="col-span-3 bg-white dark:bg-gray-800 rounded-xl p-8 text-center border border-gray-100">
            <p className="text-gray-500">No reward data yet</p>
          </div>
        ) : (
          grantStats.map((row) => (
            <div key={row._id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100">
              <p className="text-sm text-gray-500 capitalize">{row._id}</p>
              <p className="text-2xl font-bold">{row.count}</p>
              <p className="text-sm text-green-600 mt-1">₹{row.totalAmount} issued</p>
            </div>
          ))
        )}
      </div>

      {analytics?.settlements?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100">
          <h3 className="font-semibold mb-3">Settlement Summary</h3>
          <p className="text-sm text-gray-500">
            Total reward cost: ₹{analytics.settlements[0]?.totalRewardCost ?? 0}
          </p>
        </div>
      )}
    </div>
  );
};

export default SellerRewards;
