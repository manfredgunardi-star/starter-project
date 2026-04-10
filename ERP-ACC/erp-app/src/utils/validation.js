export function required(value, fieldName) {
  if (!value && value !== 0) return `${fieldName} wajib diisi`
  return null
}

export function minValue(value, min, fieldName) {
  if (Number(value) < min) return `${fieldName} minimal ${min}`
  return null
}

export function maxValue(value, max, fieldName) {
  if (Number(value) > max) return `${fieldName} maksimal ${max}`
  return null
}

export function minLength(value, min, fieldName) {
  if (!value || String(value).length < min) return `${fieldName} minimal ${min} karakter`
  return null
}

export function maxLength(value, max, fieldName) {
  if (value && String(value).length > max) return `${fieldName} maksimal ${max} karakter`
  return null
}

export function email(value) {
  if (!value) return null
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(value) ? null : 'Email tidak valid'
}

export function numeric(value, fieldName) {
  if (!value && value !== 0) return null
  return isNaN(Number(value)) ? `${fieldName} harus berupa angka` : null
}

export function validateForm(data, rules) {
  const errors = {}
  for (const [field, validators] of Object.entries(rules)) {
    for (const validator of validators) {
      const error = validator(data[field])
      if (error) {
        errors[field] = error
        break
      }
    }
  }
  return Object.keys(errors).length ? errors : null
}

export function getFieldError(errors, fieldName) {
  return errors && errors[fieldName] ? errors[fieldName] : null
}
