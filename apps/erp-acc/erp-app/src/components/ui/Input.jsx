import { forwardRef } from 'react'
import { Input as AntdInput, InputNumber } from 'antd'

const Input = forwardRef(({
  label,
  error,
  type = 'text',
  placeholder,
  value,
  onChange,
  ...props
}, ref) => {
  const isNumber = type === 'number'
  const isTextarea = type === 'textarea'

  const field = isNumber ? (
    <InputNumber
      ref={ref}
      placeholder={placeholder}
      value={value === '' || value === undefined ? null : value}
      onChange={(val) => onChange && onChange({ target: { value: val ?? '' } })}
      status={error ? 'error' : undefined}
      style={{ width: '100%' }}
      {...props}
    />
  ) : isTextarea ? (
    <AntdInput.TextArea
      ref={ref}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      status={error ? 'error' : undefined}
      {...props}
    />
  ) : (
    <AntdInput
      ref={ref}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      status={error ? 'error' : undefined}
      {...props}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label style={{ fontSize: 14, fontWeight: 500 }}>{label}</label>
      )}
      {field}
      {error && <span style={{ color: '#ff4d4f', fontSize: 12 }}>{error}</span>}
    </div>
  )
})

Input.displayName = 'Input'

export default Input
