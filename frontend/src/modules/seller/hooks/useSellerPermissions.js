import { useMemo } from 'react';
import { useAuth } from '@core/context/AuthContext';
import { hasSellerModuleAccess } from '../constants/sellerPermissions';

export function useSellerPermissions() {
  const { user } = useAuth();
  const isOwner = Boolean(user && !user?.subSellerId);
  const permissions = user?.allowedPermissions || [];

  return useMemo(
    () => ({
      isOwner,
      permissions,
      canRead: (module) => isOwner || hasSellerModuleAccess(permissions, module, 'read'),
      canWrite: (module) => isOwner || hasSellerModuleAccess(permissions, module, 'write'),
    }),
    [isOwner, permissions],
  );
}
