// src/hooks/useUsers.js
import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase-config.js';
import { createUserWithRoleFn } from '../config/firebase-config.js';
import { upsertItemToFirestore, softDeleteItemInFirestore } from '../firestoreService.js';

export const useUsers = ({ currentUser, setAlertMessage }) => {
  const [usersList, setUsersList] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .filter((u) => !(u && u.deletedAt));
        setUsersList(rows);
      },
      (err) => {
        console.warn('[subscription] users collection tidak dapat diakses (role tidak cukup):', err.code);
        setUsersList([]);
      }
    );
    return () => unsub();
  }, []);

  const addUser = async (data) => {
    const username = (data?.username || '').trim();
    const password = (data?.password || '').trim();
    const name = (data?.name || '').trim();
    const role = (data?.role || '').trim();

    if (!username || !password || !name || !role) {
      setAlertMessage('Username, Password, Nama Lengkap, dan Role harus diisi!');
      return false;
    }

    try {
      const result = await createUserWithRoleFn({ username, password, name, role });
      if (result?.data?.ok) {
        setAlertMessage(`User "${name}" berhasil dibuat dengan email ${result.data.email}.`);
        return true;
      }
      setAlertMessage('Gagal membuat user. Coba lagi.');
      return false;
    } catch (err) {
      if (err?.code === 'functions/already-exists') {
        setAlertMessage('Username sudah digunakan. Gunakan username lain.');
      } else if (err?.code === 'functions/permission-denied') {
        setAlertMessage('Akses ditolak. Hanya superadmin yang dapat menambah user.');
      } else {
        setAlertMessage(`Gagal membuat user: ${err?.message || 'Unknown error'}`);
      }
      return false;
    }
  };

  const updateUser = async (id, updates) => {
    let updatedUser = null;
    const newList = usersList.map((u) => {
      if (u.id !== id) return u;
      updatedUser = {
        ...u,
        ...updates,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'system',
      };
      return updatedUser;
    });
    const sorted = [...newList].sort((a, b) => String(a?.username || '').localeCompare(String(b?.username || '')));
    setUsersList(sorted);
    if (updatedUser) {
      try {
        await upsertItemToFirestore(db, 'users', updatedUser);
      } catch (e) {
        console.error('updateUser -> Firestore failed', e);
        setAlertMessage('Gagal update user ke Firebase. Perubahan tersimpan di cache lokal.');
      }
    }
  };

  const deleteUser = async (id, setConfirmDialog) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus user ini?',
      onConfirm: async () => {
        try {
          await softDeleteItemInFirestore(db, 'users', id, currentUser?.name || 'system');
        } catch (e) {
          console.error('deleteUser -> Firestore failed', e);
          setAlertMessage('Gagal menghapus user di Firebase. Perubahan tersimpan di cache lokal.');
        }
        setUsersList((prev) => prev.filter((u) => u.id !== id));
        setConfirmDialog({ show: false, message: '', onConfirm: null });
      },
    });
  };

  const toggleUserActive = async (id) => {
    const user = usersList.find((u) => u.id === id);
    if (user) {
      await updateUser(id, { isActive: !user.isActive });
    }
  };

  return { usersList, setUsersList, addUser, updateUser, deleteUser, toggleUserActive };
};
