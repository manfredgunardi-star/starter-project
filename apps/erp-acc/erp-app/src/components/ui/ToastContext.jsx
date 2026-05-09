import { App as AntdApp } from 'antd'

export function ToastProvider({ children }) {
  return <>{children}</>
}

export function useToast() {
  const { message } = AntdApp.useApp()
  return {
    success: (msg) => message.success(msg),
    error: (msg) => message.error(msg),
    info: (msg) => message.info(msg),
    warning: (msg) => message.warning(msg)
  }
}
