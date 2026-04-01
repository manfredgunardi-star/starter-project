// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { Package, AlertCircle } from 'lucide-react';

const LoginPage = ({ onLogin, alertMessage, setAlertMessage, appSettings }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = () => {
    if (username && password) {
      onLogin(username, password);
    } else {
      setAlertMessage('Username dan password harus diisi!');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          {/* Logo */}
          {appSettings?.logoUrl ? (
            <img
              src={appSettings.logoUrl}
              alt="Logo"
              className="h-20 mx-auto mb-4 object-contain"
            />
          ) : (
            <Package className="w-16 h-16 mx-auto text-blue-600 mb-4" />
          )}

          {/* Company Name */}
          {appSettings?.companyName && (
            <h1 className="text-2xl font-bold text-gray-800 mb-2">{appSettings.companyName}</h1>
          )}

          <h2 className="text-3xl font-bold text-gray-800">Monitoring Surat Jalan</h2>
          <p className="text-gray-600 mt-2">Silakan login untuk melanjutkan</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Masukkan username"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Masukkan password"
              autoComplete="current-password"
            />
          </div>

          <button
            onClick={handleSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition"
          >
            Login
          </button>
        </div>

        {/* Footer Text */}
        {appSettings?.loginFooterText && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg text-center">
            <p className="text-sm text-blue-800">
              {appSettings.loginFooterText}
            </p>
          </div>
        )}
      </div>

      {/* Alert Dialog in Login */}
      {alertMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-800">Informasi</h2>
            </div>
            <p className="text-gray-700 whitespace-pre-line mb-6">{alertMessage}</p>
            <button
              onClick={() => setAlertMessage('')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition font-medium"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
