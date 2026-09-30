-- Ganti tanda tangan lama supaya pemanggilan empat argumen tetap tidak ambigu.
-- Tanpa CASCADE: kegagalan dependensi menghentikan migrasi, bukan menghapus pemanggil.
drop function internal.wajib_ketemu(uuid, text, text, int);
drop function internal.cari_rute(text, text, text, int);

-- Pesan galat impor menyebut berkas dan pengenal barisnya. Parameter barunya OPSIONAL:
-- impor_master dan impor_kas memanggil tanpa keduanya dan mendapat bunyi yang persis sama
-- seperti sebelumnya, jadi migrasi ini tidak menyentuh perilaku keduanya.

create or replace function internal.wajib_ketemu(
  p_id uuid, p_jenis text, p_nilai text, p_no int,
  p_berkas text default null, p_penanda text default null)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_id is null then
    raise exception '%: % "%" tidak ditemukan atau tidak aktif',
      (case when p_berkas is null then 'Baris ' else p_berkas || ' baris ' end) || p_no ||
      coalesce(' (' || p_penanda || ')', ''), p_jenis, coalesce(p_nilai, '')
      using errcode = 'P0001';
  end if;
  return p_id;
end $$;

-- rute dikunci oleh (nama, asal, tujuan) sejak migrasi 20260923000200, jadi nama
-- saja bisa ambigu. asal/tujuan kosong berarti "jangan disaring".
create or replace function internal.cari_rute(
  p_nama text, p_asal text, p_tujuan text, p_no int,
  p_berkas text default null, p_penanda text default null)
returns uuid language plpgsql stable set search_path = '' as $$
declare
  v_id uuid;
  v_n int;
begin
  select count(*), min(r.id::text)::uuid into v_n, v_id
    from public.rute r
   where r.nama = trim(p_nama) and r.aktif
     and (coalesce(trim(p_asal), '') = '' or r.asal = trim(p_asal))
     and (coalesce(trim(p_tujuan), '') = '' or r.tujuan = trim(p_tujuan));
  if v_n = 0 then
    raise exception '%: rute "%" tidak ditemukan atau tidak aktif',
      (case when p_berkas is null then 'Baris ' else p_berkas || ' baris ' end) || p_no ||
      coalesce(' (' || p_penanda || ')', ''), coalesce(p_nama, '') using errcode = 'P0001';
  end if;
  if v_n > 1 then
    raise exception '%: rute "%" ada lebih dari satu; isi juga rute_asal dan rute_tujuan',
      (case when p_berkas is null then 'Baris ' else p_berkas || ' baris ' end) || p_no ||
      coalesce(' (' || p_penanda || ')', ''), coalesce(p_nama, '') using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

-- Impor surat jalan riwayat. Uang jalan dan upah diambil dari berkas apa adanya
-- lewat parameter penimpa yang memang sudah disediakan buat_sj/selesaikan_sj,
-- karena angka yang dulu benar-benar dibayarkan adalah fakta, bukan hasil hitung.

create or replace function public.impor_surat_jalan(p_baris jsonb) returns int
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
    v_no := coalesce((v_b ->> '__baris')::int, v_no);
    v_pengurus := case when nullif(trim(v_b ->> 'pengurus'), '') is null then null else
      internal.wajib_ketemu(
        (select g.id from public.pengurus g where g.nama = trim(v_b ->> 'pengurus') and g.aktif),
        'pengurus', v_b ->> 'pengurus', v_no, 'surat-jalan.csv', v_b ->> 'nomor') end;

    v_id := public.buat_sj(
      p_lini_kode => trim(v_b ->> 'lini'),
      p_nomor => trim(v_b ->> 'nomor'),
      p_tanggal => (v_b ->> 'tanggal')::date,
      p_pelanggan_id => internal.wajib_ketemu(
        (select p.id from public.pelanggan p where p.nama = trim(v_b ->> 'pelanggan') and p.aktif),
        'pelanggan', v_b ->> 'pelanggan', v_no, 'surat-jalan.csv', v_b ->> 'nomor'),
      p_rute_id => internal.cari_rute(v_b ->> 'rute', v_b ->> 'rute_asal', v_b ->> 'rute_tujuan', v_no, 'surat-jalan.csv', v_b ->> 'nomor'),
      p_material_id => internal.wajib_ketemu(
        (select m.id from public.material m
          where m.lini_kode = trim(v_b ->> 'lini') and m.nama = trim(v_b ->> 'material') and m.aktif),
        'material', v_b ->> 'material', v_no, 'surat-jalan.csv', v_b ->> 'nomor'),
      p_truk_id => internal.wajib_ketemu(
        (select t.id from public.truk t where t.nopol = trim(v_b ->> 'nopol') and t.aktif),
        'truk', v_b ->> 'nopol', v_no, 'surat-jalan.csv', v_b ->> 'nomor'),
      p_supir_id => internal.wajib_ketemu(
        (select s.id from public.supir s where s.nama = trim(v_b ->> 'supir') and s.aktif),
        'supir', v_b ->> 'supir', v_no, 'surat-jalan.csv', v_b ->> 'nomor'),
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
