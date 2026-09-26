-- Fondasi impor riwayat 2026: kunci alami untuk supir/pengurus, dan penolong
-- bersama yang dipakai ketiga RPC impor.

alter table public.supir add constraint supir_nama_key unique (nama);
alter table public.pengurus add constraint pengurus_nama_key unique (nama);

-- Menerjemahkan nama menjadi id. Argumen pertama diisi subkueri agar pemanggilnya
-- tetap satu baris; fungsi ini hanya bertugas mengangkat galat yang menyebut baris.
create function internal.wajib_ketemu(p_id uuid, p_jenis text, p_nilai text, p_no int)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_id is null then
    raise exception 'Baris %: % "%" tidak ditemukan atau tidak aktif',
      p_no, p_jenis, coalesce(p_nilai, '') using errcode = 'P0001';
  end if;
  return p_id;
end;
$$;

-- rute dikunci oleh (nama, asal, tujuan) sejak migrasi 20260923000200, jadi nama
-- saja bisa ambigu. asal/tujuan kosong berarti "jangan disaring".
create function internal.cari_rute(p_nama text, p_asal text, p_tujuan text, p_no int)
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
    raise exception 'Baris %: rute "%" tidak ditemukan atau tidak aktif',
      p_no, coalesce(p_nama, '') using errcode = 'P0001';
  end if;
  if v_n > 1 then
    raise exception 'Baris %: rute "%" ada lebih dari satu; isi juga rute_asal dan rute_tujuan',
      p_no, coalesce(p_nama, '') using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

-- Penjaga bentuk kiriman. Batas 5000 bukan target penggunaan, hanya pencegah
-- kiriman salah bentuk menjadi transaksi raksasa.
create function internal.periksa_kiriman(p_baris jsonb, p_berkas text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' then
    raise exception '% harus berupa daftar baris', p_berkas using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_baris) > 5000 then
    raise exception '% berisi % baris; maksimal 5000 baris per impor',
      p_berkas, jsonb_array_length(p_baris) using errcode = 'P0001';
  end if;
end;
$$;

select internal.terapkan_hak_akses();
