-- Impor master data. Urutan pemrosesan ditetapkan di dalam fungsi, bukan oleh
-- urutan kunci yang dikirim klien, karena tarif/uang jalan/aturan upah bergantung
-- pada rute dan material yang mungkin baru dibuat di kiriman yang sama.

create function public.impor_master(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' set statement_timeout = '600s' as $$
declare
  v_d jsonb := coalesce(p_data, '{}'::jsonb);
  v_b jsonb;
  v_no int;
  v_id uuid;
  v_rute uuid;
  v_material uuid;
  v_n int;
  v_hasil jsonb := '{}'::jsonb;
  c_nol constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  perform internal.wajib_peran('owner');
  perform internal.periksa_kiriman(coalesce(v_d -> 'rute', '[]'::jsonb), 'rute.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'material', '[]'::jsonb), 'material.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'pelanggan', '[]'::jsonb), 'pelanggan.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'truk', '[]'::jsonb), 'truk.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'supir', '[]'::jsonb), 'supir.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'pengurus', '[]'::jsonb), 'pengurus.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'uang_jalan', '[]'::jsonb), 'uang-jalan.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'tarif', '[]'::jsonb), 'tarif.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'aturan_upah', '[]'::jsonb), 'aturan-upah.csv');

  -- 1. rute
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'rute', '[]'::jsonb)) with ordinality
  loop
    select r.id into v_id from public.rute r
     where r.nama = trim(v_b ->> 'nama')
       and r.asal = coalesce(trim(v_b ->> 'asal'), '')
       and r.tujuan = coalesce(trim(v_b ->> 'tujuan'), '');
    perform public.simpan_rute(
      p_id => v_id,
      p_nama => trim(v_b ->> 'nama'),
      p_asal => coalesce(trim(v_b ->> 'asal'), ''),
      p_tujuan => coalesce(trim(v_b ->> 'tujuan'), ''),
      p_aktif => true,
      p_tipe_rute_id => case when nullif(trim(v_b ->> 'tipe_rute'), '') is null then null else
        internal.wajib_ketemu(
          (select t.id from public.tipe_rute t where t.nama = trim(v_b ->> 'tipe_rute') and t.aktif),
          'tipe rute', v_b ->> 'tipe_rute', v_no) end);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('rute', v_n);

  -- 2. material
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'material', '[]'::jsonb)) with ordinality
  loop
    select m.id into v_id from public.material m
     where m.lini_kode = trim(v_b ->> 'lini') and m.nama = trim(v_b ->> 'nama');
    perform public.simpan_material(
      p_id => v_id,
      p_lini_kode => trim(v_b ->> 'lini'),
      p_nama => trim(v_b ->> 'nama'),
      p_satuan => trim(v_b ->> 'satuan'),
      p_aktif => true,
      p_standar_bongkar => nullif(trim(v_b ->> 'standar_bongkar'), '')::numeric);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('material', v_n);

  -- 3. pelanggan
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'pelanggan', '[]'::jsonb)) with ordinality
  loop
    select p.id into v_id from public.pelanggan p where p.nama = trim(v_b ->> 'nama');
    perform public.simpan_pelanggan(
      p_id => v_id,
      p_nama => trim(v_b ->> 'nama'),
      p_alamat => coalesce(v_b ->> 'alamat', ''),
      p_npwp => coalesce(v_b ->> 'npwp', ''),
      p_catatan => coalesce(v_b ->> 'catatan', ''),
      p_pemotong_pph => coalesce((v_b ->> 'pemotong_pph')::boolean, true),
      p_aktif => true);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('pelanggan', v_n);

  -- 4. truk
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'truk', '[]'::jsonb)) with ordinality
  loop
    select t.id into v_id from public.truk t where t.nopol = trim(v_b ->> 'nopol');
    perform public.simpan_truk(
      p_id => v_id, p_nopol => trim(v_b ->> 'nopol'),
      p_jenis => coalesce(v_b ->> 'jenis', ''), p_aktif => true);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('truk', v_n);

  -- 5. supir
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'supir', '[]'::jsonb)) with ordinality
  loop
    select s.id into v_id from public.supir s where s.nama = trim(v_b ->> 'nama');
    perform public.simpan_supir(
      p_id => v_id, p_nama => trim(v_b ->> 'nama'),
      p_telepon => coalesce(v_b ->> 'telepon', ''), p_aktif => true);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('supir', v_n);

  -- 6. pengurus
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'pengurus', '[]'::jsonb)) with ordinality
  loop
    select g.id into v_id from public.pengurus g where g.nama = trim(v_b ->> 'nama');
    perform public.simpan_pengurus(
      p_id => v_id, p_nama => trim(v_b ->> 'nama'),
      p_telepon => coalesce(v_b ->> 'telepon', ''), p_aktif => true);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('pengurus', v_n);

  -- 7. uang jalan per rute
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'uang_jalan', '[]'::jsonb)) with ordinality
  loop
    v_rute := internal.cari_rute(v_b ->> 'rute', v_b ->> 'rute_asal', v_b ->> 'rute_tujuan', v_no);
    perform public.simpan_uang_jalan_rute(
      v_rute, (v_b ->> 'berlaku_mulai')::date, (v_b ->> 'nominal')::numeric);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('uang_jalan', v_n);

  -- 8. tarif
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'tarif', '[]'::jsonb)) with ordinality
  loop
    v_rute := internal.cari_rute(v_b ->> 'rute', v_b ->> 'rute_asal', v_b ->> 'rute_tujuan', v_no);
    perform public.simpan_tarif(
      internal.wajib_ketemu(
        (select p.id from public.pelanggan p where p.nama = trim(v_b ->> 'pelanggan') and p.aktif),
        'pelanggan', v_b ->> 'pelanggan', v_no),
      v_rute,
      internal.wajib_ketemu(
        (select m.id from public.material m
          where m.lini_kode = trim(v_b ->> 'lini') and m.nama = trim(v_b ->> 'material') and m.aktif),
        'material', v_b ->> 'material', v_no),
      (v_b ->> 'berlaku_mulai')::date,
      (v_b ->> 'harga_satuan')::numeric);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('tarif', v_n);

  -- 9. aturan upah
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'aturan_upah', '[]'::jsonb)) with ordinality
  loop
    v_rute := case when nullif(trim(v_b ->> 'rute'), '') is null then null else
      internal.cari_rute(v_b ->> 'rute', v_b ->> 'rute_asal', v_b ->> 'rute_tujuan', v_no) end;
    v_material := case when nullif(trim(v_b ->> 'material'), '') is null then null else
      internal.wajib_ketemu(
        (select m.id from public.material m
          where m.lini_kode = trim(v_b ->> 'lini') and m.nama = trim(v_b ->> 'material') and m.aktif),
        'material', v_b ->> 'material', v_no) end;
    select a.id into v_id from public.aturan_upah a
     where a.aktif and a.berlaku_mulai = (v_b ->> 'berlaku_mulai')::date
       and coalesce(a.rute_id, c_nol) = coalesce(v_rute, c_nol)
       and coalesce(a.material_id, c_nol) = coalesce(v_material, c_nol);
    perform public.simpan_aturan_upah(
      p_id => v_id,
      p_nama => trim(v_b ->> 'nama'),
      p_rute_id => v_rute,
      p_material_id => v_material,
      p_berlaku_mulai => (v_b ->> 'berlaku_mulai')::date,
      p_basis => trim(v_b ->> 'basis'),
      p_nominal => (v_b ->> 'nominal')::numeric,
      p_aktif => true);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('aturan_upah', v_n);

  perform internal.catat_audit('impor', 'master', null, v_hasil);
  return v_hasil;
end;
$$;

select internal.terapkan_hak_akses();
