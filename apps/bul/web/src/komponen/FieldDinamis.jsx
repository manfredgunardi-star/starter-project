import { cloneElement } from 'react';
import { Form, Input, InputNumber, DatePicker, Select, Switch } from 'antd';
import { useOpsi } from '../lib/data.js';

function PilihanSumber({ sumber, ...props }) {
  const { options, isLoading } = useOpsi(sumber);
  return <Select showSearch optionFilterProp="label" allowClear loading={isLoading} options={options} {...props} />;
}

export default function FieldDinamis({ field, disabled }) {
  const aturan = field.wajib ? [{ required: true, message: `${field.label} wajib diisi` }] : [];
  let input;
  switch (field.tipe) {
    case 'uang':
      input = <InputNumber stringMode min="0" precision={2} style={{ width: '100%' }} decimalSeparator="," />;
      break;
    case 'qty':
      input = <InputNumber stringMode min="0" precision={3} style={{ width: '100%' }} decimalSeparator="," />;
      break;
    case 'angka':
      input = <InputNumber stringMode style={{ width: '100%' }} />;
      break;
    case 'tanggal':
      input = <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />;
      break;
    case 'pilihan':
      input = field.sumber
        ? <PilihanSumber sumber={field.sumber} />
        : <Select options={field.opsi} allowClear={!field.wajib} />;
      break;
    case 'saklar':
      input = <Switch />;
      break;
    default:
      input = <Input />;
  }
  return (
    <Form.Item
      name={field.name}
      label={field.label}
      rules={aturan}
      valuePropName={field.tipe === 'saklar' ? 'checked' : 'value'}
    >
      {disabled ? cloneElement(input, { disabled: true }) : input}
    </Form.Item>
  );
}
