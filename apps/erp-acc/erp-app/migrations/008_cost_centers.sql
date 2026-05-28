-- ============================================================
-- Migration 008: Cost Centers
-- ============================================================

-- Tabel cost_centers
CREATE TABLE cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tambah cost_center_id ke journal_items (nullable — opsional per baris)
ALTER TABLE journal_items
  ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id);

-- RLS
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read cost_centers"
  ON cost_centers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/staff insert cost_centers"
  ON cost_centers FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff());

CREATE POLICY "Admin/staff update cost_centers"
  ON cost_centers FOR UPDATE TO authenticated
  USING (is_admin_or_staff());

CREATE POLICY "Admin delete cost_centers"
  ON cost_centers FOR DELETE TO authenticated
  USING (is_admin());

-- RPC: Upsert cost center
CREATE OR REPLACE FUNCTION save_cost_center(
  p_id UUID,
  p_code TEXT,
  p_name TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_code IS NULL OR trim(p_code) = '' THEN
    RAISE EXCEPTION 'Kode cost center wajib diisi';
  END IF;
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Nama cost center wajib diisi';
  END IF;

  IF p_id IS NOT NULL THEN
    -- Update
    UPDATE cost_centers
    SET
      code        = trim(p_code),
      name        = trim(p_name),
      description = p_description,
      updated_at  = now()
    WHERE id = p_id;
    v_id := p_id;
  ELSE
    -- Insert
    INSERT INTO cost_centers (code, name, description)
    VALUES (trim(p_code), trim(p_name), p_description)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- RPC: Soft delete cost center
CREATE OR REPLACE FUNCTION soft_delete_cost_center(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_count INT;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  -- Cek apakah masih dipakai di journal_items yang posted
  SELECT COUNT(*) INTO ref_count
  FROM journal_items ji
  JOIN journals j ON j.id = ji.journal_id
  WHERE ji.cost_center_id = p_id
    AND j.is_posted = true;

  IF ref_count > 0 THEN
    RAISE EXCEPTION 'Cost center masih digunakan di % baris jurnal terposting', ref_count;
  END IF;

  UPDATE cost_centers
  SET
    is_active  = false,
    deleted_at = now(),
    deleted_by = auth.uid()
  WHERE id = p_id;
END;
$$;
