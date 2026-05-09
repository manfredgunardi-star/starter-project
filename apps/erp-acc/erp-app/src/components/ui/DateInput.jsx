import { DatePicker } from 'antd'
import dayjs from 'dayjs'

export default function DateInput({
  label,
  error,
  value,
  onChange,
  placeholder = 'Pilih tanggal',
  disabled,
  ...props
}) {
  const dayjsValue = value ? dayjs(value) : null

  const handleChange = (d) => {
    const iso = d ? d.format('YYYY-MM-DD') : ''
    if (onChange) onChange({ target: { value: iso } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label style={{ fontSize: 14, fontWeight: 500 }}>{label}</label>
      )}
      <DatePicker
        value={dayjsValue && dayjsValue.isValid() ? dayjsValue : null}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        format="YYYY-MM-DD"
        status={error ? 'error' : undefined}
        style={{ width: '100%' }}
        {...props}
      />
      {error && <span style={{ color: '#ff4d4f', fontSize: 12 }}>{error}</span>}
    </div>
  )
}
