import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, App as AntdApp } from 'antd'
import idID from 'antd/locale/id_ID'
import 'dayjs/locale/id'
import dayjs from 'dayjs'
import './index.css'
import App from './App.jsx'

dayjs.locale('id')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider locale={idID}>
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)
