-- Migration: 002_closing_period
-- Dibuat: 2026-04-18
-- Tujuan: Tambah kolom closed_periods ke company_settings untuk menyimpan
--         daftar periode akuntansi yang sudah ditutup (format: ['YYYY-MM', ...])

ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS closed_periods JSONB NOT NULL DEFAULT '[]'::JSONB;
