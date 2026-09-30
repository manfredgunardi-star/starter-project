-- Impor kas & biaya. Satu transaksi kas bisa punya beberapa rincian, jadi baris
-- dikelompokkan lewat kolom ref bebas dari berkas. ref kosong = baris berdiri sendiri,
-- dan agar kelompoknya tetap unik ia diberi kunci sintetis dari nomor barisnya.

create function public.impor_kas(p_baris jsonb) returns int
language plpgsql security definer set search_path = '' set statement_timeout = '600s' as $$
declare
  v_k record;
  v_n int := 0;
begin
  perform internal.wajib_peran('owner');
  perform internal.periksa_kiriman(p_baris, 'kas.csv');

  for v_k in
    with baris as (
      select ordinality as no, value as b,
             coalesce(nullif(trim(value ->> 'ref'), ''), '#' || ordinality::text) as kunci
        from jsonb_array_elements(p_baris) with ordinality
    )
    select kunci,
           min(no) as no_awal,
           count(distinct b ->> 'jenis') as n_jenis,
           count(distinct b ->> 'tanggal') as n_tanggal,
           count(distinct b ->> 'akun_kas') as n_akun_kas,
           count(distinct b ->> 'keterangan') as n_keterangan,
           (array_agg(b ->> 'jenis' order by no))[1] as jenis,
           (array_agg(b ->> 'tanggal' order by no))[1] as tanggal,
           (array_agg(b ->> 'akun_kas' order by no))[1] as akun_kas,
           (array_agg(b ->> 'keterangan' order by no))[1] as keterangan,
           jsonb_agg(jsonb_build_object(
             'akun_kode', trim(b ->> 'akun'),
             'jumlah', b ->> 'jumlah',
             'keterangan', coalesce(b ->> 'keterangan_baris', ''),
             'lini_kode', nullif(trim(b ->> 'lini'), ''),
             'truk_id', case when nullif(trim(b ->> 'nopol'), '') is null then null else
               internal.wajib_ketemu(
                 (select t.id from public.truk t where t.nopol = trim(b ->> 'nopol') and t.aktif),
                 'truk', b ->> 'nopol', no::int) end,
             'supir_id', case when nullif(trim(b ->> 'supir'), '') is null then null else
               internal.wajib_ketemu(
                 (select s.id from public.supir s where s.nama = trim(b ->> 'supir') and s.aktif),
                 'supir', b ->> 'supir', no::int) end,
             'pengurus_id', case when nullif(trim(b ->> 'pengurus'), '') is null then null else
               internal.wajib_ketemu(
                 (select g.id from public.pengurus g where g.nama = trim(b ->> 'pengurus') and g.aktif),
                 'pengurus', b ->> 'pengurus', no::int) end)
             order by no) as rincian
      from baris
     group by kunci
     order by min(no)
  loop
    if v_k.n_jenis > 1 or v_k.n_tanggal > 1 or v_k.n_akun_kas > 1 or v_k.n_keterangan > 1 then
      raise exception 'Baris %: ref "%" memakai jenis, tanggal, akun_kas, dan keterangan yang harus sama di semua barisnya',
        v_k.no_awal, v_k.kunci using errcode = 'P0001';
    end if;
    perform public.catat_kas(v_k.jenis, v_k.tanggal::date, trim(v_k.akun_kas), v_k.keterangan, v_k.rincian);
    v_n := v_n + 1;
  end loop;

  perform internal.catat_audit('impor', 'transaksi_kas', null, jsonb_build_object('transaksi', v_n));
  return v_n;
end;
$$;

select internal.terapkan_hak_akses();
