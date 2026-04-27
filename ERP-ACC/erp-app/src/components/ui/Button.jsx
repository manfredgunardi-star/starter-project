import { Button as AntdButton } from 'antd'

const variantToType = {
  primary: 'primary',
  secondary: 'default',
  danger: 'primary',
  ghost: 'text'
}

const sizeMap = {
  sm: 'small',
  md: 'middle',
  lg: 'large'
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  type,
  children,
  ...props
}) {
  // AntdButton uses `htmlType` for HTML button type (submit/reset/button),
  // and `type` for visual style (primary/default/etc).
  // When caller passes type="submit", map it to htmlType so forms work correctly.
  const htmlType = ['submit', 'reset', 'button'].includes(type) ? type : undefined

  return (
    <AntdButton
      type={variantToType[variant] || 'default'}
      htmlType={htmlType}
      danger={variant === 'danger'}
      size={sizeMap[size] || 'middle'}
      loading={loading}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </AntdButton>
  )
}
