-- Migration 024: Company Invoice Fields
-- Menambahkan field untuk info bank dan tanda tangan invoice

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS bank_name            text,
  ADD COLUMN IF NOT EXISTS bank_account_number  text,
  ADD COLUMN IF NOT EXISTS bank_account_name    text,
  ADD COLUMN IF NOT EXISTS signer_name          text,
  ADD COLUMN IF NOT EXISTS signer_title         text;
