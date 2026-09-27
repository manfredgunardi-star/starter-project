-- Komisi pengurus terposting walau SJ tidak punya pengurus_id — gerbangnya hanya
-- komisi_berlaku(tipe_rute, tanggal), sama sekali tidak memeriksa pengurus. Ini bertentangan
-- langsung dengan peringatan di layar Impor ("... tidak akan menghasilkan komisi pengurus").
-- Satu-satunya perubahan: tambah v_sj.pengurus_id is not null pada gerbang; badan fungsi lain
-- byte-identik dengan 20260923000100_komisi_pengurus.sql.
create or replace function public.selesaikan_sj(p_id uuid, p_qty_bongkar numeric, p_tanggal_selesai date, p_upah numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_sj public.surat_jalan;
  v_upah numeric;
  v_tipe_rute_id uuid;
  v_komisi numeric;
  v_jurnal uuid;
  v_dim jsonb;
  v_baris jsonb := '[]'::jsonb;
begin
  v_uid := internal.wajib_peran('owner', 'operasional');
  select * into v_sj from public.surat_jalan where id = p_id for update;
  if not found then
    raise exception 'Surat jalan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_sj.status <> 'berangkat' then
    raise exception 'SJ % berstatus %, tidak bisa diselesaikan', v_sj.nomor, v_sj.status using errcode = 'P0001';
  end if;
  if p_qty_bongkar is null or p_qty_bongkar <= 0 then
    raise exception 'Qty bongkar harus lebih dari 0' using errcode = 'P0001';
  end if;
  if p_tanggal_selesai is null or p_tanggal_selesai < v_sj.tanggal then
    raise exception 'Tanggal selesai tidak boleh sebelum tanggal SJ (%)', v_sj.tanggal using errcode = 'P0001';
  end if;
  v_upah := coalesce(p_upah, public.upah_berlaku(v_sj.rute_id, v_sj.material_id, v_sj.tanggal, p_qty_bongkar));
  if v_upah is null then
    raise exception 'Tidak ada aturan upah yang berlaku untuk SJ %; isi upah manual', v_sj.nomor using errcode = 'P0001';
  end if;
  if v_upah < 0 then
    raise exception 'Upah tidak boleh negatif' using errcode = 'P0001';
  end if;
  v_dim := jsonb_build_object(
    'lini_kode', v_sj.lini_kode, 'truk_id', v_sj.truk_id, 'supir_id', v_sj.supir_id,
    'pelanggan_id', v_sj.pelanggan_id, 'rute_id', v_sj.rute_id);
  if v_upah > 0 then
    v_baris := v_baris || jsonb_build_array(
      v_dim || jsonb_build_object('akun_kode', internal.akun_posting('beban_upah_sopir'), 'debit', v_upah),
      v_dim || jsonb_build_object('akun_kode', internal.akun_posting('hutang_upah_sopir'), 'kredit', v_upah));
  end if;
  select tipe_rute_id into v_tipe_rute_id from public.rute where id = v_sj.rute_id;
  v_komisi := public.komisi_berlaku(v_tipe_rute_id, v_sj.tanggal);
  if v_sj.pengurus_id is not null and v_komisi is not null and v_komisi > 0 then
    v_baris := v_baris || jsonb_build_array(
      (v_dim || jsonb_build_object('pengurus_id', v_sj.pengurus_id))
        || jsonb_build_object('akun_kode', internal.akun_posting('beban_komisi_pengurus'), 'debit', v_komisi),
      (v_dim || jsonb_build_object('pengurus_id', v_sj.pengurus_id))
        || jsonb_build_object('akun_kode', internal.akun_posting('hutang_komisi_pengurus'), 'kredit', v_komisi));
  end if;
  if jsonb_array_length(v_baris) > 0 then
    v_jurnal := internal.posting_jurnal(
      p_tanggal_selesai, 'SJ selesai ' || v_sj.lini_kode || ' ' || v_sj.nomor, 'sj_selesai', v_sj.id, v_baris);
  end if;
  update public.surat_jalan
     set status = 'selesai', qty_bongkar = p_qty_bongkar, tanggal_selesai = p_tanggal_selesai, upah = v_upah,
         jurnal_upah_id = v_jurnal, diubah_oleh = v_uid, diubah_pada = now()
   where id = p_id;
  perform internal.catat_audit('selesai', 'surat_jalan', p_id::text,
    jsonb_build_object('qty_bongkar', p_qty_bongkar, 'upah', v_upah, 'komisi', v_komisi));
  return p_id;
end;
$$;
