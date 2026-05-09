import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { initBridgeAuth } from "./config/firebase-config.js";

// Inisialisasi bridge auth ke bul-accounting di background.
// Tidak memblokir render — jika gagal, fitur integrasi otomatis dinonaktifkan.
initBridgeAuth();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
