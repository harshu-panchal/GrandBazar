// Hierarchical permission catalog that mirrors the admin sidebar.
// Parent keys gate top-level nav items & their route groups. Child keys gate
// individual sub-nav items so admins can scope a role to specific screens
// within a section (e.g. grant "orders.returns" without the rest of orders).
//
// Convention: child keys are "<parent>.<slug>". When any child is selected
// the parent is implicitly selected too so the sidebar can show the section.
export const PERMISSION_TREE = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    desc: 'Overview of platform statistics',
  },
  {
    key: 'categories',
    label: 'Categories',
    desc: 'Create, update & structure categories',
    children: [
      { key: 'categories.all', label: 'All Categories', desc: 'Hierarchy explorer' },
      { key: 'categories.header', label: 'Header Categories', desc: 'Top navigation categories' },
      { key: 'categories.level2', label: 'Main Categories', desc: 'Level-2 category pages' },
      { key: 'categories.sub', label: 'Sub-Categories', desc: 'Leaf category records' },
    ],
  },
  {
    key: 'products',
    label: 'Products',
    desc: 'Manage catalogue products & pricing',
    children: [
      { key: 'products.list', label: 'Products', desc: 'Live product catalogue' },
      { key: 'products.catalog', label: 'Master Catalog', desc: 'Shared SKU catalog' },
      { key: 'products.bundles', label: 'Catalog Bundles', desc: 'Bundled SKU groupings' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing Tools',
    desc: 'Banners, coupons, and push campaigns',
    children: [
      { key: 'marketing.sections', label: 'Create Sections', desc: 'Home-page experience studio' },
      { key: 'marketing.hero', label: 'Hero & Categories', desc: 'Per-page hero configuration' },
      { key: 'marketing.notifications', label: 'Send Notifications', desc: 'Push & in-app campaigns' },
      { key: 'marketing.coupons', label: 'Coupons & Promos', desc: 'Promo codes & discounts' },
      { key: 'marketing.reward_campaigns', label: 'Reward Campaigns', desc: 'Loyalty campaign builder' },
      { key: 'marketing.advance_booking', label: 'Advance Booking', desc: 'Pre-order campaigns' },
      { key: 'marketing.reward_analytics', label: 'Reward Analytics', desc: 'Campaign performance' },
      { key: 'marketing.offer_sections', label: 'Offer Sections', desc: 'Offer rails on home' },
      { key: 'marketing.shop_by_store', label: 'Shop by Store', desc: 'Store spotlight rails' },
    ],
  },
  {
    key: 'support',
    label: 'Customer Support',
    desc: 'Help tickets & review moderation',
    children: [
      { key: 'support.tickets', label: 'Help Tickets', desc: 'Customer support inbox' },
      { key: 'support.moderation', label: 'Review Content', desc: 'Reviews & UGC moderation' },
    ],
  },
  {
    key: 'sellers',
    label: 'Sellers',
    desc: 'Approve, reject & manage vendor stores',
    children: [
      { key: 'sellers.active', label: 'Active Sellers', desc: 'Approved sellers directory' },
      { key: 'sellers.pending', label: 'Seller Applications', desc: 'Pending approvals' },
      { key: 'sellers.subscriptions', label: 'Subscriptions', desc: 'Seller subscription plans' },
      { key: 'sellers.locations', label: 'Seller Locations', desc: 'Geo distribution of stores' },
    ],
  },
  {
    key: 'delivery',
    label: 'Delivery Drivers',
    desc: 'Onboard riders, tracking, cash',
    children: [
      { key: 'delivery.active', label: 'Active Drivers', desc: 'Approved rider roster' },
      { key: 'delivery.pending', label: 'Waiting for Review', desc: 'Rider applications' },
      { key: 'delivery.tracking', label: 'Track Drivers', desc: 'Live fleet map' },
      { key: 'delivery.funds', label: 'Send Money', desc: 'Payouts to riders' },
    ],
  },
  { key: 'wallet', label: 'Wallet', desc: 'Platform balances & commission ledgers' },
  { key: 'withdrawals', label: 'Money Requests', desc: 'Approve seller/rider payouts' },
  { key: 'seller_payments', label: 'Seller Payments', desc: 'Settle merchant accounts' },
  { key: 'bulk_settlements', label: 'Bulk Settlements', desc: 'Wholesale/bulk settlements' },
  { key: 'cash_collection', label: 'Collect Cash', desc: 'Receive COD dues' },
  { key: 'customers', label: 'Customers', desc: 'End-user registry & logs' },
  { key: 'faqs', label: 'FAQs', desc: 'Publish static FAQ lists' },
  {
    key: 'orders',
    label: 'Orders',
    desc: 'Live deliveries & return queues',
    children: [
      { key: 'orders.all', label: 'All Orders', desc: 'Full order log' },
      { key: 'orders.pending', label: 'New Orders', desc: 'Unprocessed orders' },
      { key: 'orders.processed', label: 'Being Prepared', desc: 'Orders in prep' },
      { key: 'orders.out_for_delivery', label: 'On the Way', desc: 'Out for delivery' },
      { key: 'orders.delivered', label: 'Delivered', desc: 'Completed deliveries' },
      { key: 'orders.cancelled', label: 'Cancelled', desc: 'Cancelled orders' },
      { key: 'orders.returned', label: 'Returned', desc: 'Returned orders' },
      { key: 'orders.returns', label: 'Return Requests', desc: 'Return approvals' },
      { key: 'orders.refunds', label: 'Refund Ledger', desc: 'Refund records' },
      { key: 'orders.create_phone_order', label: 'Create Phone Order', desc: 'Place orders on behalf of a customer by phone' },
      { key: 'orders.reschedule', label: 'Reschedule Orders', desc: 'Change delivery date/window on behalf of a seller' },
      { key: 'orders.adjust_price', label: 'Adjust Price', desc: 'Modify item prices/quantities on an order' },
      { key: 'orders.replacement', label: 'Product Replacement', desc: 'Propose a substitute item to the customer' },
      { key: 'orders.split_delivery', label: 'Split Delivery', desc: 'Split an order into two deliveries' },
    ],
  },
  {
    key: 'billing',
    label: 'Fees & Charges',
    desc: 'Commissions & platform costs',
    children: [
      { key: 'billing.fees', label: 'Fees & Charges', desc: 'Base billing config' },
      { key: 'billing.city_commissions', label: 'City Commissions', desc: 'City-wise commission tables' },
    ],
  },
  { key: 'settings', label: 'Settings', desc: 'Global platform configuration' },
  { key: 'system', label: 'System Settings', desc: 'Developer environment keys & config' },
];

// Flat list of every selectable key (parents + children) for select-all helpers.
export const ALL_PERMISSION_KEYS = PERMISSION_TREE.flatMap((node) => [
  node.key,
  ...(node.children?.map((c) => c.key) || []),
]);

export const PARENT_KEYS = PERMISSION_TREE.map((n) => n.key);

export const getParentKey = (key) => (key.includes('.') ? key.split('.')[0] : key);

export const getChildKeys = (parentKey) => {
  const node = PERMISSION_TREE.find((n) => n.key === parentKey);
  return node?.children?.map((c) => c.key) || [];
};

// Normalize a permission list so that selecting any child implies the parent,
// and (optionally) selecting a parent explicitly fans out to its children.
export const normalizePermissions = (keys, { fanOutParents = false } = {}) => {
  const set = new Set(keys || []);
  // Ensure parent is set for any child selection — the sidebar/routes gate
  // on the parent key, so without this the user wouldn't see the section.
  for (const key of Array.from(set)) {
    if (key.includes('.')) set.add(getParentKey(key));
  }
  if (fanOutParents) {
    for (const parent of PARENT_KEYS) {
      if (set.has(parent)) {
        for (const child of getChildKeys(parent)) set.add(child);
      }
    }
  }
  return Array.from(set);
};
