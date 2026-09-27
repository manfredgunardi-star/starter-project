-- Impor surat jalan riwayat. Uang jalan dan upah diambil dari berkas apa adanya
-- lewat parameter penimpa yang memang sudah disediakan buat_sj/selesaikan_sj,
-- karena angka yang dulu benar-benar dibayarkan adalah fakta, bukan hasil hitung.

create function public.impor_surat_jalan(p_baris jsonb) returns int
language plpgsql security definer set search_path = '' set statement_timeout = '600s' as $$
declare
  v_b jsonb;
  v_no int;
  v_id uuid;
  v_pengurus uuid;
  v_n int := 0;
begin
  perform internal.wajib_peran('owner');
  perform internal.periksa_kiriman(p_baris, 'surat-jalan.csv');

  for v_b, v_no in select value, ordinality from jsonb_array_elements(p_baris) with ordinality loop
    v_pengurus := case when nullif(trim(v_b ->> 'pengurus'), '') is null then null else
      internal.wajib_ketemu(
        (select g.id from public.pengurus g where g.nama = trim(v_b ->> 'pengurus') and g.aktif),
        'pengurus', v_b ->> 'pengurus', v_no) end;

    v_id := public.buat_sj(
      p_lini_kode => trim(v_b ->> 'lini'),
      p_nomor => trim(v_b ->> 'nomor'),
      p_tanggal => (v_b ->> 'tanggal')::date,
      p_pelanggan_id => internal.wajib_ketemu(
        (select p.id from public.pelanggan p where p.nama = trim(v_b ->> 'pelanggan') and p.aktif),
        'pelanggan', v_b ->> 'pelanggan', v_no),
      p_rute_id => internal.cari_rute(v_b ->> 'rute', v_b ->> 'rute_asal', v_b ->> 'rute_tujuan', v_no),
      p_material_id => internal.wajib_ketemu(
        (select m.id from public.material m
          where m.lini_kode = trim(v_b ->> 'lini') and m.nama = trim(v_b ->> 'material') and m.aktif),
        'material', v_b ->> 'material', v_no),
      p_truk_id => internal.wajib_ketemu(
        (select t.id from public.truk t where t.nopol = trim(v_b ->> 'nopol') and t.aktif),
        'truk', v_b ->> 'nopol', v_no),
      p_supir_id => internal.wajib_ketemu(
        (select s.id from public.supir s where s.nama = trim(v_b ->> 'supir') and s.aktif),
        'supir', v_b ->> 'supir', v_no),
      p_qty_muat => (v_b ->> 'qty_muat')::numeric,
      p_uang_jalan => (v_b ->> 'uang_jalan')::numeric,
      p_keterangan => coalesce(v_b ->> 'keterangan', ''));

    -- buat_sj tidak menerima pengurus sebagai parameter; ia menebak sendiri ketika
    -- pengurus aktif hanya satu. Untuk riwayat, pengurus yang benar ada di berkas.
    -- Harus dipasang SEBELUM penyelesaian, karena jurnal komisi membaca kolom ini.
    if v_pengurus is not null then
      update public.surat_jalan set pengurus_id = v_pengurus where id = v_id;
    end if;

    if nullif(trim(v_b ->> 'tanggal_selesai'), '') is not null then
      perform public.selesaikan_sj(
        v_id,
        (v_b ->> 'qty_bongkar')::numeric,
        (v_b ->> 'tanggal_selesai')::date,
        nullif(trim(v_b ->> 'upah'), '')::numeric);
    end if;

    v_n := v_n + 1;
  end loop;

  perform internal.catat_audit('impor', 'surat_jalan', null, jsonb_build_object('baris', v_n));
  return v_n;
end;
$$;

select internal.terapkan_hak_akses();
