// Paste the config from Firebase console → Project settings → Your apps → Web app.
// These values are not secret; access is controlled by firestore.rules.
// Until apiKey is filled in, the Member login tab shows "not switched on yet".

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyDcrknBeZ1Sj__5gVs2a-r0lNdqwDFbYyY",
  authDomain: "sunshreesuntec-74743.firebaseapp.com",
  projectId: "sunshreesuntec-74743",
  storageBucket: "sunshreesuntec-74743.firebasestorage.app",
  messagingSenderId: "368937917441",
  appId: "1:368937917441:web:0ff1a071ca3fcde9ae3400",
  measurementId: "G-LZ9KTDHEJK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);