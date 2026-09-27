-- Perbaikan: dimensi pengurus tidak pernah masuk modul kas ketika komisi pengurus dibuat.
-- Akibatnya pelunasan 2125 Hutang Komisi Pengurus menghasilkan baris jurnal tanpa pengurus_id,
-- sehingga v_hutang_komisi_pengurus menaruhnya di baris NULL dan saldo pengurus tidak pernah berkurang.

alter table public.transaksi_kas_baris add column pengurus_id uuid references public.pengurus (id);

create or replace function public.catat_kas(p_jenis text, p_tanggal date, p_akun_kas_kode text, p_keterangan text, p_baris jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid := gen_random_uuid();
  v_nomor text;
  v_kas public.akun;
  v_akun public.akun;
  v_b jsonb;
  v_jml numeric;
  v_total numeric := 0;
  v_jurnal_baris jsonb := '[]'::jsonb;
  v_piutang text;
  v_hutang_upah text;
  v_hutang_komisi text;
  v_hutang_bonus text;
  v_jurnal uuid;
  v_awalan text;
begin
  v_uid := internal.wajib_peran('owner', 'keuangan');
  if p_jenis is null or p_jenis not in ('keluar', 'masuk') then
    raise exception 'Jenis harus keluar atau masuk; gunakan transfer_kas untuk transfer' using errcode = 'P0001';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal wajib diisi' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_keterangan), '') = '' then
    raise exception 'Keterangan wajib diisi' using errcode = 'P0001';
  end if;
  v_kas := internal.wajib_akun_kas(p_akun_kas_kode);
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) = 0 then
    raise exception 'Minimal satu baris' using errcode = 'P0001';
  end if;
  v_piutang := internal.akun_posting('piutang_usaha');
  v_hutang_upah := internal.akun_posting('hutang_upah_sopir');
  -- Pencarian lunak: kunci posting yang belum ada tidak boleh mematikan catat_kas.
  -- 'hutang_bonus' baru muncul pada migrasi bonus; sampai saat itu guard-nya tidak aktif
  -- karena perbandingan dengan NULL selalu menghasilkan NULL (bukan true).
  select pp.akun_kode into v_hutang_komisi from public.pengaturan_posting pp where pp.kunci = 'hutang_komisi_pengurus';
  select pp.akun_kode into v_hutang_bonus from public.pengaturan_posting pp where pp.kunci = 'hutang_bonus';

  for v_b in select value from jsonb_array_elements(p_baris) loop
    select * into v_akun from public.akun where kode = v_b ->> 'akun_kode';
    if not found then
      raise exception 'Akun % tidak ada', v_b ->> 'akun_kode' using errcode = 'P0001';
    end if;
    if v_akun.kas_bank then
      raise exception 'Gunakan transfer_kas untuk memindahkan dana antar kas/bank' using errcode = 'P0001';
    end if;
    if v_akun.kode = v_piutang then
      raise exception 'Penerimaan piutang dicatat lewat Pembayaran' using errcode = 'P0001';
    end if;
    if v_akun.kode = v_hutang_upah and nullif(v_b ->> 'supir_id', '') is null then
      raise exception 'Pembayaran upah wajib memilih supir' using errcode = 'P0001';
    end if;
    if v_akun.kode = v_hutang_komisi and nullif(v_b ->> 'pengurus_id', '') is null then
      raise exception 'Pembayaran komisi pengurus wajib memilih pengurus' using errcode = 'P0001';
    end if;
    if v_akun.kode = v_hutang_bonus
       and nullif(v_b ->> 'supir_id', '') is null and nullif(v_b ->> 'pengurus_id', '') is null then
      raise exception 'Pembayaran bonus wajib memilih supir atau pengurus' using errcode = 'P0001';
    end if;
    v_jml := nullif(v_b ->> 'jumlah', '')::numeric;
    if v_jml is null or v_jml <= 0 then
      raise exception 'Jumlah setiap baris harus lebih dari 0' using errcode = 'P0001';
    end if;
    v_total := v_total + v_jml;
    v_jurnal_baris := v_jurnal_baris || jsonb_build_array(
      jsonb_build_object(
        'akun_kode', v_akun.kode,
        case when p_jenis = 'keluar' then 'debit' else 'kredit' end, v_jml,
        'keterangan', coalesce(nullif(trim(v_b ->> 'keterangan'), ''), trim(p_keterangan)),
        'lini_kode', v_b ->> 'lini_kode', 'truk_id', v_b ->> 'truk_id', 'supir_id', v_b ->> 'supir_id',
        'pengurus_id', v_b ->> 'pengurus_id'));
  end loop;

  v_jurnal_baris := v_jurnal_baris || jsonb_build_array(jsonb_build_object(
    'akun_kode', v_kas.kode,
    case when p_jenis = 'keluar' then 'kredit' else 'debit' end, v_total,
    'keterangan', trim(p_keterangan)));

  v_awalan := case when p_jenis = 'keluar' then 'KK' else 'KM' end;
  v_nomor := v_awalan || '-' || to_char(p_tanggal, 'YYYY') || '-'
    || lpad(internal.nomor_berikut('kas-' || v_awalan || '-' || to_char(p_tanggal, 'YYYY'))::text, 6, '0');
  v_jurnal := internal.posting_jurnal(p_tanggal, v_nomor || ' ' || trim(p_keterangan), 'kas', v_id, v_jurnal_baris);

  insert into public.transaksi_kas (id, nomor, jenis, tanggal, akun_kas_kode, total, keterangan, jurnal_id, dibuat_oleh)
  values (v_id, v_nomor, p_jenis, p_tanggal, v_kas.kode, v_total, trim(p_keterangan), v_jurnal, v_uid);

  insert into public.transaksi_kas_baris (transaksi_id, urutan, akun_kode, jumlah, keterangan, lini_kode, truk_id, supir_id, pengurus_id)
  select v_id, e.ord, e.val ->> 'akun_kode', (e.val ->> 'jumlah')::numeric,
         coalesce(nullif(trim(e.val ->> 'keterangan'), ''), trim(p_keterangan)),
         nullif(e.val ->> 'lini_kode', ''), nullif(e.val ->> 'truk_id', '')::uuid,
         nullif(e.val ->> 'supir_id', '')::uuid, nullif(e.val ->> 'pengurus_id', '')::uuid
    from jsonb_array_elements(p_baris) with ordinality as e(val, ord);

  perform internal.catat_audit('buat', 'transaksi_kas', v_id::text,
    jsonb_build_object('nomor', v_nomor, 'jenis', p_jenis, 'total', v_total));
  return v_id;
end;
$$;

select internal.terapkan_hak_akses();
