import { App as AntdApp } from 'antd'

export function ToastProvider({ children }) {
  return <>{children}</>
}

// eslint-disable-next-line react-refresh/only-export-components -- HMR-only rule; splitting this hook into a separate file means updating 38+ import sites for zero runtime benefit
export function useToast() {
  const { message } = AntdApp.useApp()
  return {
    success: (msg) => message.success(msg),
    error: (msg) => message.error(msg),
    info: (msg) => message.info(msg),
    warning: (msg) => message.warning(msg)
  }
}
