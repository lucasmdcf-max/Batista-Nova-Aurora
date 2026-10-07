/**
 * Firebase SDK & Firestore Initialization — Batista Nova Aurora
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: "AIzaSyDwFkNo-xOyV0yF1-__w2dBDEMiHRMH-DQ",
  authDomain: "batista-nova-aurora.firebaseapp.com",
  projectId: "batista-nova-aurora",
  storageBucket: "batista-nova-aurora.firebasestorage.app",
  messagingSenderId: "965144462957",
  appId: "1:965144462957:web:e096319f93d6068ec26164"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore
export const db = getFirestore(app);
