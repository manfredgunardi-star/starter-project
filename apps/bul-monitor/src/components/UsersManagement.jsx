import { Plus, Edit, Trash2, XCircle, CheckCircle } from 'lucide-react';

const UsersManagement = ({ usersList, currentUser, onAddUser, onEditUser, onDeleteUser, onToggleActive }) => {
  const getRoleBadgeColor = (role) => {
    const colors = {
      superadmin: 'bg-red-100 text-red-800',
      admin_sj: 'bg-green-100 text-green-800',
      admin_keuangan: 'bg-green-100 text-green-800',
      admin_invoice: 'bg-purple-100 text-purple-800',
      reader: 'bg-gray-100 text-gray-800'
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getRoleLabel = (role) => {
    const labels = {
      superadmin: 'Super Administrator',
      admin_sj: 'Admin Surat Jalan',
      admin_keuangan: 'Admin Keuangan',
      admin_invoice: 'Admin Invoice',
      reader: 'Reader'
    };
    return labels[role] || role;
  };

  return (
    <div>
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Kelola User</h2>
            <p className="text-sm text-gray-600">Total: {usersList.length} user</p>
          </div>
          <button
            onClick={onAddUser}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah User</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {usersList.map(user => {
          const displayUsername = user.username || (user.email ? user.email.split('@')[0] : '-');
          const displayName = user.name || displayUsername;
          const createdAtRaw = user.createdAt;
          const displayCreatedAt = createdAtRaw
            ? (createdAtRaw?.toDate
                ? createdAtRaw.toDate().toLocaleDateString('id-ID')
                : new Date(createdAtRaw).toLocaleDateString('id-ID'))
            : '-';
          return (
          <div key={user.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-bold text-gray-800">{displayName}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {user.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Username:</p>
                    <p className="font-semibold text-gray-800">{displayUsername}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Dibuat:</p>
                    <p className="font-semibold text-gray-800">{displayCreatedAt}</p>
                  </div>
                </div>
                {user.createdBy && (
                  <p className="text-xs text-gray-500 mt-2">
                    Dibuat oleh: {user.createdBy}
                  </p>
                )}
              </div>

              <div className="flex flex-col space-y-2 ml-4">
                {user.role !== 'superadmin' && (
                  <>
                    <button
                      onClick={() => onToggleActive(user.id)}
                      className={`px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap ${
                        user.isActive
                          ? 'bg-orange-600 hover:bg-orange-700 text-white'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {user.isActive ? (
                        <>
                          <XCircle className="w-4 h-4" />
                          <span>Nonaktifkan</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>Aktifkan</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => onEditUser(user)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => onDeleteUser(user.id)}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Hapus</span>
                    </button>
                  </>
                )}
                {user.role === 'superadmin' && (
                  <div className="text-xs text-gray-500 italic px-4 py-2">
                    Super Admin tidak dapat diubah
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
};

export default UsersManagement;
