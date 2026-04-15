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
  children,
  ...props
}) {
  return (
    <AntdButton
      type={variantToType[variant] || 'default'}
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
