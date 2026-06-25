import { canAccess } from './permissions.js';

function actorId(actor) {
  return actor?.uid || actor?.id || '';
}

export function canApproveFinancialDocument({ actor, document }) {
  if (!actor || !document) return false;
  if (!canAccess(actor.role, 'accounting:approve', actor.permissions || [])) return false;

  const makerId = document.createdBy || document.submittedBy || '';
  const isOwnDocument = makerId && makerId === actorId(actor);

  if (isOwnDocument && !canAccess(actor.role, 'approval:self-approve', actor.permissions || [])) {
    return false;
  }

  return true;
}

export function getApprovalBlockReason({ actor, document }) {
  if (!actor) return 'User tidak ditemukan.';
  if (!canAccess(actor.role, 'accounting:approve', actor.permissions || [])) {
    return 'Role Anda belum memiliki permission approval accounting.';
  }

  const makerId = document?.createdBy || document?.submittedBy || '';
  if (makerId && makerId === actorId(actor) && !canAccess(actor.role, 'approval:self-approve', actor.permissions || [])) {
    return 'Maker tidak boleh approve dokumen yang dibuat sendiri.';
  }

  return '';
}
