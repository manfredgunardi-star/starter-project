import { Modal as AntdModal } from 'antd'

const sizeToWidth = {
  sm: 400,
  md: 520,
  lg: 720
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md'
}) {
  return (
    <AntdModal
      open={isOpen}
      onCancel={onClose}
      title={title}
      width={sizeToWidth[size] || 520}
      footer={null}
      destroyOnClose
    >
      {children}
    </AntdModal>
  )
}
