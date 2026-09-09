// ============================================================
//  CarePoint — Firebase initialisation
// ============================================================
import { initializeApp } from 'firebase/app';
import { getAuth }       from 'firebase/auth';
import { getFirestore }  from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            'AIzaSyAZl_12zYnyv0n_AgoUZ2yXc_7IBVKzFgc',
  authDomain:        'carepoint-9e657.firebaseapp.com',
  projectId:         'carepoint-9e657',
  storageBucket:     'carepoint-9e657.firebasestorage.app',
  messagingSenderId: '178723846438',
  appId:             '1:178723846438:web:e0ff4cc7b5584a0ea6e9e7',
  measurementId:     'G-8P02YRTHPC',
};

const app = initializeApp(firebaseConfig);

/** Firebase Auth instance – email/password provider */
export const auth = getAuth(app);

/** Firestore instance – available for future data persistence */
export const db   = getFirestore(app);

export default app;
