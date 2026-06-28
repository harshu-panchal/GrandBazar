export const SELLER_PERMISSION_MODULES = [
  {
    id: 'storefront',
    label: 'Store Design',
    description: 'Shop banners, videos, and page layout',
  },
  {
    id: 'products',
    label: 'Products',
    description: 'Product catalog and catalog claims',
  },
  {
    id: 'inventory',
    label: 'Stock / Inventory',
    description: 'Inventory levels and stock adjustments',
  },
  {
    id: 'orders',
    label: 'Orders',
    description: 'Accept, decline, and process orders',
  },
  {
    id: 'returns',
    label: 'Returns',
    description: 'Return approvals and assignments',
  },
  {
    id: 'tracking',
    label: 'Track Orders',
    description: 'Delivery tracking and rider status',
  },
  {
    id: 'coupons',
    label: 'Offers & Coupons',
    description: 'Discounts and coupon management',
  },
  {
    id: 'analytics',
    label: 'Sales Reports',
    description: 'Analytics and performance metrics',
  },
  {
    id: 'withdrawals',
    label: 'Money & Earnings',
    description: 'Withdrawals, earnings, and transactions',
  },
];

export const permissionKey = (module, level) => `${module}:${level}`;

export function normalizeSellerPermissions(rawPermissions = []) {
  if (!Array.isArray(rawPermissions)) return [];

  const normalized = new Set();

  for (const entry of rawPermissions) {
    const value = String(entry || '').trim();
    if (!value) continue;

    if (value.includes(':')) {
      const [module, level] = value.split(':');
      if (level === 'read' || level === 'write') {
        normalized.add(permissionKey(module, level));
        if (level === 'write') {
          normalized.add(permissionKey(module, 'read'));
        }
      }
      continue;
    }

    normalized.add(permissionKey(value, 'read'));
    normalized.add(permissionKey(value, 'write'));
  }

  return [...normalized];
}

export function hasSellerModuleAccess(permissions = [], module, level = 'read') {
  const normalized = normalizeSellerPermissions(permissions);

  if (level === 'write') {
    return normalized.includes(permissionKey(module, 'write'));
  }

  return (
    normalized.includes(permissionKey(module, 'read')) ||
    normalized.includes(permissionKey(module, 'write'))
  );
}

export function buildPermissionsFromMatrix(matrix = {}) {
  const permissions = [];
  Object.entries(matrix).forEach(([module, access]) => {
    if (access?.read) permissions.push(permissionKey(module, 'read'));
    if (access?.write) permissions.push(permissionKey(module, 'write'));
  });
  return permissions;
}

export function matrixFromPermissions(permissions = []) {
  const matrix = {};
  SELLER_PERMISSION_MODULES.forEach(({ id }) => {
    matrix[id] = {
      read: hasSellerModuleAccess(permissions, id, 'read'),
      write: hasSellerModuleAccess(permissions, id, 'write'),
    };
  });
  return matrix;
}
