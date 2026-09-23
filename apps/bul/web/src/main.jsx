import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp } from 'antd';
import idID from 'antd/locale/id_ID';
import dayjs from 'dayjs';
import 'dayjs/locale/id';
import { AuthProvider } from './auth/AuthProvider.jsx';
import AppRoot from './App.jsx';

dayjs.locale('id');
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')).render(
  <StrictMode><ConfigProvider locale={idID}><AntApp><QueryClientProvider client={qc}><BrowserRouter><AuthProvider><AppRoot /></AuthProvider></BrowserRouter></QueryClientProvider></AntApp></ConfigProvider></StrictMode>,
);
