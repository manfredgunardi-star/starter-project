import { Modal as AntdModal, Button as AntdButton, Space } from 'antd'

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Hapus',
  variant = 'danger'
}) {
  return (
    <AntdModal
      open={isOpen}
      onCancel={onClose}
      title={title}
      width={400}
      footer={
        <Space>
          <AntdButton onClick={onClose}>Batal</AntdButton>
          <AntdButton
            type="primary"
            danger={variant === 'danger'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmText}
          </AntdButton>
        </Space>
      }
      destroyOnClose
    >
      <p>{message}</p>
    </AntdModal>
  )
}
