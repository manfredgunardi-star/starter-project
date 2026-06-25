import { useMemo } from 'react';
import { canApproveFinancialDocument, getApprovalBlockReason } from '../utils/approval.js';
import { useAuth } from './useAuth.js';
import { useCompany } from './useCompany.js';

export function useApprovalPermission() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();

  const actor = useMemo(
    () => ({
      uid: user.id,
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: activeCompany?.role || 'reader',
      permissions: activeCompany?.permissions || [],
    }),
    [activeCompany?.permissions, activeCompany?.role, user]
  );

  return useMemo(
    () => ({
      actor,
      canApprove: (document) => canApproveFinancialDocument({ actor, document }),
      getApprovalReason: (document) => getApprovalBlockReason({ actor, document }),
    }),
    [actor]
  );
}
