const rolePermissions = {
  owner: ['*'],
  admin: [
    'dashboard:read',
    'masterdata:read',
    'masterdata:write',
    'masterdata:delete',
    'accounting:read',
    'accounting:write',
    'reports:read',
    'settings:manage',
    'users:manage',
  ],
  accounting: ['dashboard:read', 'masterdata:read', 'accounting:read', 'accounting:write', 'accounting:post', 'reports:read'],
  staff: ['dashboard:read', 'masterdata:read', 'masterdata:write'],
  reader: ['dashboard:read', 'masterdata:read', 'accounting:read', 'reports:read'],
};

export function canAccess(role, permission) {
  const permissions = rolePermissions[role] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

export function getRolePermissions(role) {
  return rolePermissions[role] || [];
}
