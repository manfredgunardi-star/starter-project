-- Master data: lini, material, pelanggan, rute, uang jalan, truk, supir, tarif, aturan upah.

create table public.lini (
  kode text primary key check (kode ~ '^[A-Z]{2,5}$'),
  nama text not null check (length(trim(nama)) > 0),
  aktif boolean not null default true
);
insert into public.lini (kode, nama) values ('SJP', 'Pasir'), ('SJT', 'Tanah/Clay'), ('SJS', 'Sodium');

create table public.material (
  id uuid primary key default gen_random_uuid(),
  lini_kode text not null references public.lini (kode),
  nama text not null check (length(trim(nama)) > 0),
  satuan text not null check (length(trim(satuan)) > 0),
  aktif boolean not null default true,
  unique (lini_kode, nama)
);

create table public.pelanggan (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique check (length(trim(nama)) > 0),
  alamat text not null default '',
  npwp text not null default '',
  catatan text not null default '',
  pemotong_pph boolean not null default true,
  aktif boolean not null default true
);

create table public.rute (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique check (length(trim(nama)) > 0),
  asal text not null default '',
  tujuan text not null default '',
  aktif boolean not null default true
);

create table public.uang_jalan_rute (
  id uuid primary key default gen_random_uuid(),
  rute_id uuid not null references public.rute (id),
  berlaku_mulai date not null,
  nominal numeric(18,2) not null check (nominal >= 0),
  unique (rute_id, berlaku_mulai)
);

create table public.truk (
  id uuid primary key default gen_random_uuid(),
  nopol text not null unique check (length(trim(nopol)) > 0),
  jenis text not null default '',
  aktif boolean not null default true
);

create table public.supir (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(trim(nama)) > 0),
  telepon text not null default '',
  aktif boolean not null default true
);

create table public.tarif (
  id uuid primary key default gen_random_uuid(),
  pelanggan_id uuid not null references public.pelanggan (id),
  rute_id uuid not null references public.rute (id),
  material_id uuid not null references public.material (id),
  berlaku_mulai date not null,
  harga_satuan numeric(18,2) not null check (harga_satuan >= 0),
  unique (pelanggan_id, rute_id, material_id, berlaku_mulai)
);

create table public.aturan_upah (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(trim(nama)) > 0),
  rute_id uuid references public.rute (id),
  material_id uuid references public.material (id),
  berlaku_mulai date not null,
  basis text not null check (basis in ('per_sj', 'per_satuan')),
  nominal numeric(18,2) not null check (nominal >= 0),
  aktif boolean not null default true
);
create unique index aturan_upah_unik on public.aturan_upah (
  coalesce(rute_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(material_id, '00000000-0000-0000-0000-000000000000'::uuid),
  berlaku_mulai
) where aktif;

-- ---------- RPC simpan ----------

create function public.simpan_lini(p_kode text, p_nama text, p_aktif boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_kode text := upper(trim(p_kode));
begin
  perform internal.wajib_peran('owner');
  insert into public.lini (kode, nama, aktif) values (v_kode, trim(p_nama), coalesce(p_aktif, true))
  on conflict (kode) do update set nama = excluded.nama, aktif = excluded.aktif;
  perform internal.catat_audit('simpan', 'lini', v_kode, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_kode;
end;
$$;

create function public.simpan_material(p_id uuid, p_lini_kode text, p_nama text, p_satuan text, p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if not exists (select 1 from public.lini l where l.kode = p_lini_kode and l.aktif) then
    raise exception 'Lini % tidak ada atau tidak aktif', p_lini_kode using errcode = 'P0001';
  end if;
  if coalesce(trim(p_satuan), '') = '' then
    raise exception 'Satuan material wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.material (lini_kode, nama, satuan, aktif)
    values (p_lini_kode, trim(p_nama), trim(p_satuan), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.material
       set lini_kode = p_lini_kode, nama = trim(p_nama), satuan = trim(p_satuan), aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Material tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'material', v_id::text, jsonb_build_object('nama', p_nama, 'satuan', p_satuan));
  return v_id;
end;
$$;

create function public.simpan_pelanggan(
  p_id uuid, p_nama text, p_alamat text default '', p_npwp text default '', p_catatan text default '',
  p_pemotong_pph boolean default true, p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan', 'operasional');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama pelanggan wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.pelanggan (nama, alamat, npwp, catatan, pemotong_pph, aktif)
    values (trim(p_nama), coalesce(p_alamat, ''), coalesce(p_npwp, ''), coalesce(p_catatan, ''),
            coalesce(p_pemotong_pph, true), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.pelanggan
       set nama = trim(p_nama), alamat = coalesce(p_alamat, ''), npwp = coalesce(p_npwp, ''),
           catatan = coalesce(p_catatan, ''), pemotong_pph = coalesce(p_pemotong_pph, true),
           aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Pelanggan tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'pelanggan', v_id::text, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.simpan_rute(p_id uuid, p_nama text, p_asal text default '', p_tujuan text default '', p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama rute wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.rute (nama, asal, tujuan, aktif)
    values (trim(p_nama), coalesce(p_asal, ''), coalesce(p_tujuan, ''), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.rute
       set nama = trim(p_nama), asal = coalesce(p_asal, ''), tujuan = coalesce(p_tujuan, ''), aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Rute tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'rute', v_id::text, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.simpan_uang_jalan_rute(p_rute_id uuid, p_berlaku_mulai date, p_nominal numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if p_berlaku_mulai is null then
    raise exception 'Tanggal berlaku wajib diisi' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.rute r where r.id = p_rute_id) then
    raise exception 'Rute tidak ditemukan' using errcode = 'P0002';
  end if;
  insert into public.uang_jalan_rute (rute_id, berlaku_mulai, nominal)
  values (p_rute_id, p_berlaku_mulai, p_nominal)
  on conflict (rute_id, berlaku_mulai) do update set nominal = excluded.nominal
  returning id into v_id;
  perform internal.catat_audit('simpan', 'uang_jalan_rute', v_id::text,
    jsonb_build_object('rute_id', p_rute_id, 'berlaku_mulai', p_berlaku_mulai, 'nominal', p_nominal));
  return v_id;
end;
$$;

create function public.simpan_truk(p_id uuid, p_nopol text, p_jenis text default '', p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nopol text := upper(regexp_replace(trim(coalesce(p_nopol, '')), '\s+', ' ', 'g'));
begin
  perform internal.wajib_peran('owner', 'operasional');
  if v_nopol = '' then
    raise exception 'Nomor polisi wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.truk (nopol, jenis, aktif) values (v_nopol, coalesce(p_jenis, ''), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.truk set nopol = v_nopol, jenis = coalesce(p_jenis, ''), aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Truk tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'truk', v_id::text, jsonb_build_object('nopol', v_nopol, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.simpan_supir(p_id uuid, p_nama text, p_telepon text default '', p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama supir wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.supir (nama, telepon, aktif) values (trim(p_nama), coalesce(p_telepon, ''), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.supir set nama = trim(p_nama), telepon = coalesce(p_telepon, ''), aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Supir tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'supir', v_id::text, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.simpan_tarif(p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid, p_berlaku_mulai date, p_harga_satuan numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if p_berlaku_mulai is null then
    raise exception 'Tanggal berlaku wajib diisi' using errcode = 'P0001';
  end if;
  insert into public.tarif (pelanggan_id, rute_id, material_id, berlaku_mulai, harga_satuan)
  values (p_pelanggan_id, p_rute_id, p_material_id, p_berlaku_mulai, p_harga_satuan)
  on conflict (pelanggan_id, rute_id, material_id, berlaku_mulai) do update set harga_satuan = excluded.harga_satuan
  returning id into v_id;
  perform internal.catat_audit('simpan', 'tarif', v_id::text,
    jsonb_build_object('pelanggan_id', p_pelanggan_id, 'rute_id', p_rute_id, 'material_id', p_material_id,
                       'berlaku_mulai', p_berlaku_mulai, 'harga_satuan', p_harga_satuan));
  return v_id;
end;
$$;

create function public.simpan_aturan_upah(
  p_id uuid, p_nama text, p_rute_id uuid, p_material_id uuid, p_berlaku_mulai date, p_basis text,
  p_nominal numeric, p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if p_id is null then
    insert into public.aturan_upah (nama, rute_id, material_id, berlaku_mulai, basis, nominal, aktif)
    values (trim(p_nama), p_rute_id, p_material_id, p_berlaku_mulai, p_basis, p_nominal, coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.aturan_upah
       set nama = trim(p_nama), rute_id = p_rute_id, material_id = p_material_id, berlaku_mulai = p_berlaku_mulai,
           basis = p_basis, nominal = p_nominal, aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Aturan upah tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'aturan_upah', v_id::text,
    jsonb_build_object('nama', p_nama, 'basis', p_basis, 'nominal', p_nominal, 'aktif', p_aktif));
  return v_id;
end;
$$;

-- ---------- Nilai berlaku (baca) ----------

create function public.uang_jalan_berlaku(p_rute_id uuid, p_tanggal date) returns numeric
language sql stable set search_path = '' as $$
  select u.nominal from public.uang_jalan_rute u
  where u.rute_id = p_rute_id and u.berlaku_mulai <= p_tanggal
  order by u.berlaku_mulai desc limit 1
$$;

create function public.tarif_berlaku(p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid, p_tanggal date) returns numeric
language sql stable set search_path = '' as $$
  select t.harga_satuan from public.tarif t
  where t.pelanggan_id = p_pelanggan_id and t.rute_id = p_rute_id and t.material_id = p_material_id
    and t.berlaku_mulai <= p_tanggal
  order by t.berlaku_mulai desc limit 1
$$;

-- Urutan: rute+material > rute saja > material saja > default; lalu tanggal berlaku terbaru.
create function public.upah_berlaku(p_rute_id uuid, p_material_id uuid, p_tanggal date, p_qty numeric) returns numeric
language sql stable set search_path = '' as $$
  select case a.basis when 'per_sj' then a.nominal else round(a.nominal * coalesce(p_qty, 0), 2) end
  from public.aturan_upah a
  where a.aktif and a.berlaku_mulai <= p_tanggal
    and (a.rute_id is null or a.rute_id = p_rute_id)
    and (a.material_id is null or a.material_id = p_material_id)
  order by (a.rute_id is not null)::int * 2 + (a.material_id is not null)::int desc, a.berlaku_mulai desc
  limit 1
$$;

select internal.terapkan_hak_akses();
