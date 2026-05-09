import { forwardRef } from 'react'
import { Select as AntdSelect } from 'antd'

const Select = forwardRef(({
  label,
  error,
  options = [],
  placeholder = 'Pilih...',
  value,
  onChange,
  ...props
}, ref) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label style={{ fontSize: 14, fontWeight: 500 }}>{label}</label>
      )}
      <AntdSelect
        ref={ref}
        placeholder={placeholder}
        value={value === '' ? undefined : value}
        onChange={(val) => onChange && onChange({ target: { value: val ?? '' } })}
        options={options.map(o => ({ value: o.value, label: o.label }))}
        status={error ? 'error' : undefined}
        allowClear
        showSearch
        optionFilterProp="label"
        style={{ width: '100%' }}
        {...props}
      />
      {error && <span style={{ color: '#ff4d4f', fontSize: 12 }}>{error}</span>}
    </div>
  )
})

Select.displayName = 'Select'

export default Select
