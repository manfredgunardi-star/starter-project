import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DB_URL, pastikanLokal } from './koneksi.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrasiDir = join(root, 'supabase', 'migrations');

const BERSIHKAN = `
do $$
declare r record;
begin
  for r in select format('%I.%I', schemaname, viewname) as n from pg_views where schemaname = 'public' loop
    execute 'drop view if exists ' || r.n || ' cascade';
  end loop;
  for r in select format('%I.%I', schemaname, tablename) as n from pg_tables where schemaname = 'public' loop
    execute 'drop table if exists ' || r.n || ' cascade';
  end loop;
  for r in select p.oid::regprocedure::text as n
           from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.prokind in ('f', 'p') loop
    execute 'drop routine if exists ' || r.n || ' cascade';
  end loop;
end $$;
drop schema if exists internal cascade;
delete from auth.users where email like '%@uji.bul';
`;

export async function resetDb() {
  pastikanLokal(DB_URL);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(BERSIHKAN);
    const files = (await readdir(migrasiDir)).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const isi = await readFile(join(migrasiDir, f), 'utf8');
      try {
        await client.query('begin');
        await client.query(isi);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw new Error(`Migrasi ${f} gagal: ${e.message}`);
      }
    }
    return files;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  resetDb()
    .then((files) => console.log(`Reset selesai: ${files.length} migrasi diterapkan`))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
