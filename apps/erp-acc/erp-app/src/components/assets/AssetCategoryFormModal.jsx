import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../ui/ToastContext'
import * as svc from '../../services/assetCategoryService'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { Row, Col, Flex, Alert } from 'antd'

export default function AssetCategoryFormModal({
  open,
  onClose,
  onSaved,
  editData
}) {
  const toast = useToast()

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    default_useful_life_months: '',
    asset_account_id: '',
    accumulated_depreciation_account_id: '',
    depreciation_expense_account_id: ''
  })

  const [coaList, setCoaList] = useState([])
  const [loadingCOA, setLoadingCOA] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState({})

  // Load COA list when modal opens
  useEffect(() => {
    if (open) {
      loadCOAList()
      if (editData) {
        setFormData({
          code: editData.code || '',
          name: editData.name || '',
          default_useful_life_months: editData.default_useful_life_months || '',
          asset_account_id: editData.asset_account_id || '',
          accumulated_depreciation_account_id: editData.accumulated_depreciation_account_id || '',
          depreciation_expense_account_id: editData.depreciation_expense_account_id || ''
        })
      } else {
        setFormData({
          code: '',
          name: '',
          default_useful_life_months: '',
          asset_account_id: '',
          accumulated_depreciation_account_id: '',
          depreciation_expense_account_id: ''
        })
      }
      setFormErrors({})
    }
  }, [open, editData])

  const loadCOAList = async () => {
    try {
      setLoadingCOA(true)
      const { data, error } = await supabase
        .from('coa')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code')
      if (error) throw error
      setCoaList(data || [])
    } catch (err) {
      toast.error(`Gagal memuat daftar akun: ${err.message}`)
    } finally {
      setLoadingCOA(false)
    }
  }

  // Filter COA by code pattern
  const getFilteredAccounts = (pattern) => {
    return coaList
      .filter(acc => acc.code.match(pattern))
      .map(acc => ({
        value: acc.id,
        label: `${acc.code} — ${acc.name}`
      }))
  }

  const assetAccountOptions = getFilteredAccounts(/^1-2/)
  const accumulatedAccountOptions = getFilteredAccounts(/^1-29/)
  const depreciationExpenseOptions = getFilteredAccounts(/^5-17/)

  const validateForm = () => {
    const errors = {}

    if (!formData.code.trim()) {
      errors.code = 'Kode kategori wajib diisi'
    } else if (formData.code.length > 3) {
      errors.code = 'Kode maksimal 3 karakter'
    } else if (!/^[A-Z0-9]+$/.test(formData.code)) {
      errors.code = 'Kode harus huruf besar atau angka'
    }

    if (!formData.name.trim()) {
      errors.name = 'Nama kategori wajib diisi'
    }

    if (!formData.default_useful_life_months || formData.default_useful_life_months < 1) {
      errors.default_useful_life_months = 'Umur manfaat harus minimal 1 bulan'
    }

    if (!formData.asset_account_id) {
      errors.asset_account_id = 'Akun aset wajib dipilih'
    }

    if (!formData.accumulated_depreciation_account_id) {
      errors.accumulated_depreciation_account_id = 'Akun akumulasi depresiasi wajib dipilih'
    }

    if (!formData.depreciation_expense_account_id) {
      errors.depreciation_expense_account_id = 'Akun beban depresiasi wajib dipilih'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    try {
      const input = {
        code: formData.code.toUpperCase(),
        name: formData.name.trim(),
        default_useful_life_months: parseInt(formData.default_useful_life_months),
        asset_account_id: formData.asset_account_id,
        accumulated_depreciation_account_id: formData.accumulated_depreciation_account_id,
        depreciation_expense_account_id: formData.depreciation_expense_account_id
      }

      let result
      if (editData) {
        result = await svc.updateCategory(editData.id, input)
        toast.success('Kategori aset berhasil diperbarui')
      } else {
        result = await svc.createCategory(input)
        toast.success('Kategori aset berhasil ditambahkan')
      }

      if (onSaved) {
        onSaved(result)
      }
      onClose()
    } catch (err) {
      toast.error(err.message)
      setFormErrors({ submit: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={editData ? 'Edit Kategori Aset Tetap' : 'Tambah Kategori Aset Tetap'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formErrors.submit && (
          <Alert type="error" message={formErrors.submit} showIcon />
        )}

        <Row gutter={16}>
          <Col span={12}>
            <Input
              label="Kode Kategori"
              placeholder="Contoh: EQP"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              error={formErrors.code}
              maxLength="3"
              autoFocus
              disabled={isSubmitting || loadingCOA}
            />
          </Col>
          <Col span={12}>
            <Input
              label="Nama Kategori"
              placeholder="Contoh: Equipment"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={formErrors.name}
              disabled={isSubmitting || loadingCOA}
            />
          </Col>
        </Row>

        <Input
          label="Umur Manfaat Default (bulan)"
          type="number"
          placeholder="Contoh: 60"
          value={formData.default_useful_life_months}
          onChange={(e) => setFormData({ ...formData, default_useful_life_months: e.target.value })}
          error={formErrors.default_useful_life_months}
          min="1"
          disabled={isSubmitting || loadingCOA}
        />

        <Select
          label="Akun Aset"
          placeholder="Pilih akun aset (1-2___)"
          options={assetAccountOptions}
          value={formData.asset_account_id}
          onChange={(e) => setFormData({ ...formData, asset_account_id: e.target.value })}
          error={formErrors.asset_account_id}
          disabled={isSubmitting || loadingCOA}
        />

        <Select
          label="Akun Akumulasi Depresiasi"
          placeholder="Pilih akun akumulasi (1-29___)"
          options={accumulatedAccountOptions}
          value={formData.accumulated_depreciation_account_id}
          onChange={(e) => setFormData({ ...formData, accumulated_depreciation_account_id: e.target.value })}
          error={formErrors.accumulated_depreciation_account_id}
          disabled={isSubmitting || loadingCOA}
        />

        <Select
          label="Akun Beban Depresiasi"
          placeholder="Pilih akun beban (5-17___)"
          options={depreciationExpenseOptions}
          value={formData.depreciation_expense_account_id}
          onChange={(e) => setFormData({ ...formData, depreciation_expense_account_id: e.target.value })}
          error={formErrors.depreciation_expense_account_id}
          disabled={isSubmitting || loadingCOA}
        />

        <Flex gap={8} justify="flex-end" style={{ paddingTop: 8 }}>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting || loadingCOA}
          >
            Batal
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={isSubmitting || loadingCOA}
            disabled={isSubmitting || loadingCOA}
          >
            {editData ? 'Simpan' : 'Tambah'}
          </Button>
        </Flex>
      </form>
    </Modal>
  )
}
