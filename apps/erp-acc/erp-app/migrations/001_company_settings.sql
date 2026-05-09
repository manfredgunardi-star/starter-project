-- Migration: 001_company_settings
-- Dibuat: 2026-04-16
-- Tujuan: Tabel singleton untuk pengaturan perusahaan (nama, alamat, logo, dll.)
--         digunakan di header invoice dan dokumen cetak lainnya.

-- =============================================================================
-- TABEL: company_settings
-- =============================================================================

-- Buat tabel company_settings (singleton: selalu 1 baris)
CREATE TABLE IF NOT EXISTS company_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL DEFAULT 'Nama Perusahaan',
  address     text,
  phone       text,
  email       text,
  npwp        text,
  logo_url    text,
  updated_at  timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Semua user authenticated boleh baca (untuk header invoice)
CREATE POLICY "company_settings_select" ON company_settings
  FOR SELECT TO authenticated USING (true);

-- Hanya admin dan staff yang boleh update
CREATE POLICY "company_settings_update" ON company_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'staff')
    )
  );

-- Seed satu baris default
INSERT INTO company_settings (name)
SELECT 'Nama Perusahaan'
WHERE NOT EXISTS (SELECT 1 FROM company_settings);

-- =============================================================================
-- STORAGE BUCKET: company-assets
-- =============================================================================
-- Bucket ini menyimpan logo perusahaan dan aset dokumen lainnya.
-- Bucket bersifat PUBLIC agar URL logo bisa dipakai di PDF tanpa auth.

-- Buat bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: semua authenticated user bisa baca (untuk render logo di invoice)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'company_assets_read'
  ) THEN
    CREATE POLICY "company_assets_read" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'company-assets');
  END IF;

  -- Policy: hanya admin/staff yang bisa upload
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'company_assets_write'
  ) THEN
    CREATE POLICY "company_assets_write" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'company-assets' AND
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN ('admin', 'staff')
        )
      );
  END IF;

  -- Policy: hanya admin/staff yang bisa update (overwrite logo)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'company_assets_upsert'
  ) THEN
    CREATE POLICY "company_assets_upsert" ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'company-assets' AND
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN ('admin', 'staff')
        )
      );
  END IF;
END $$;
