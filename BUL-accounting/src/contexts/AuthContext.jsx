import React, { createContext, useContext, useState, useEffect } from 'react'
import { auth, db } from '../firebase'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'firebase/auth'
import {
  doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, where
} from 'firebase/firestore'

const AuthContext = createContext()
export const useAuth = () => useContext(AuthContext)

// Roles: superadmin, admin, reader
export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  READER: 'reader'
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(true)

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const userDoc = await getDoc(doc(db, 'users', cred.user.uid))
    if (userDoc.exists()) {
      setUserRole(userDoc.data().role)
      setUserName(userDoc.data().name || email)
    }
    return cred
  }

  async function logout() {
    await signOut(auth)
    setCurrentUser(null)
    setUserRole(null)
    setUserName('')
  }

  async function createUser(email, password, name, role) {
    // Create user in Firebase Auth via secondary app to avoid logging out current user
    const { initializeApp, deleteApp } = await import('firebase/app')
    const { getAuth, createUserWithEmailAndPassword: createUser2 } = await import('firebase/auth')
    
    const secondaryApp = initializeApp(auth.app.options, 'secondary_' + Date.now())
    const secondaryAuth = getAuth(secondaryApp)
    
    try {
      const cred = await createUser2(secondaryAuth, email, password)
      await setDoc(doc(db, 'users', cred.user.uid), {
        email, name, role,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.uid
      })
      await deleteApp(secondaryApp)
      return cred
    } catch (err) {
      await deleteApp(secondaryApp)
      throw err
    }
  }

  async function deleteUser(uid) {
    await deleteDoc(doc(db, 'users', uid))
    // Note: actual auth user deletion requires admin SDK (server-side)
    // For now we just remove Firestore record; user won't be able to access
  }

  async function getAllUsers() {
    const snap = await getDocs(collection(db, 'users'))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }

  function can(action) {
    if (!userRole) return false
    const permissions = {
      superadmin: ['read', 'create', 'edit', 'delete', 'report', 'settings', 'manage_users', 'closing'],
      admin: ['create', 'read_own'],
      reader: ['read', 'report']
    }
    return permissions[userRole]?.includes(action) || false
  }

  function isSuperadmin() { return userRole === ROLES.SUPERADMIN }
  function isAdmin() { return userRole === ROLES.ADMIN }
  function isReader() { return userRole === ROLES.READER }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user)
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
          setUserRole(userDoc.data().role)
          setUserName(userDoc.data().name || user.email)
        } else {
          // First user auto-becomes superadmin
          const usersSnap = await getDocs(collection(db, 'users'))
          const role = usersSnap.empty ? ROLES.SUPERADMIN : ROLES.READER
          await setDoc(doc(db, 'users', user.uid), {
            email: user.email,
            name: user.email.split('@')[0],
            role,
            createdAt: new Date().toISOString()
          })
          setUserRole(role)
          setUserName(user.email.split('@')[0])
        }
      } else {
        setCurrentUser(null)
        setUserRole(null)
        setUserName('')
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const value = {
    currentUser, userRole, userName, loading,
    login, logout, createUser, deleteUser, getAllUsers,
    can, isSuperadmin, isAdmin, isReader
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
