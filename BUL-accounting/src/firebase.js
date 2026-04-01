import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

// ============================================================
// GANTI KONFIGURASI DI BAWAH DENGAN FIREBASE PROJECT ANDA
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAAV179nxAUpMcx8LEti83kxVWdc4fXVuA",
  authDomain: "bul-accounting.firebaseapp.com",
  projectId: "bul-accounting",
  storageBucket: "bul-accounting.firebasestorage.app",
  messagingSenderId: "657310894760",
  appId: "1:657310894760:web:e7225601052f04e556d09d"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export default app
