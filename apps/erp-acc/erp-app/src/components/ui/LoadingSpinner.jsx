import { Spin } from 'antd'

export default function LoadingSpinner({ message = 'Memuat...' }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 256
    }}>
      <Spin size="large" tip={message}>
        <div style={{ padding: 50 }} />
      </Spin>
    </div>
  )
}
