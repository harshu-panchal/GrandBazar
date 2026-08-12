import React, { createContext, useContext } from 'react';

const defaultEarnings = {
  balances: {},
  ledger: [],
  monthlyChart: [],
  moduleEnabled: true,
};

const SellerEarningsContext = createContext({
  earningsData: defaultEarnings,
  earningsLoading: false,
  refreshEarnings: () => {},
});

export const useSellerEarnings = () => useContext(SellerEarningsContext);
export { defaultEarnings };
export default SellerEarningsContext;
