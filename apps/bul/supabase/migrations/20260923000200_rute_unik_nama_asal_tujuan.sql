-- Rute: nama boleh berulang untuk client dengan banyak lokasi; keunikan sekarang di (nama, asal, tujuan).
alter table public.rute drop constraint rute_nama_key;
alter table public.rute add constraint rute_nama_asal_tujuan_key unique (nama, asal, tujuan);
