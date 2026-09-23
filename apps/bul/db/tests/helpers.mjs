import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { DB_URL, pastikanLokal } from '../koneksi.mjs';

pastikanLokal(DB_URL);

// numeric → string (tanpa float), date → 'YYYY-MM-DD'
pg.types.setTypeParser(1700, (v) => v);
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

export async function sql(text, params = []) {
  return (await pool.query(text, params)).rows;
}

export async function buatAuthUser() {
  const id = randomUUID();
  await pool.query(
    `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '{}'::jsonb, now(), now())`,
    [id, `${id}@uji.bul`],
  );
  return id;
}

export async function buatPengguna(peran = 'owner', aktif = true) {
  const id = await buatAuthUser();
  await pool.query('update public.profil set peran = $2, aktif = $3 where id = $1', [id, peran, aktif]);
  return id;
}

async function jalankan(role, claims, text, params) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await c.query(`set local role ${role}`);
    const r = await c.query(text, params);
    await c.query('set constraints all immediate');
    await c.query('commit');
    return r.rows;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export const sebagai = (userId, text, params = []) =>
  jalankan('authenticated', { sub: userId, role: 'authenticated' }, text, params);

export const sebagaiAnon = (text, params = []) => jalankan('anon', { role: 'anon' }, text, params);

export const unik = (awalan = 'U') => `${awalan}${randomUUID().slice(0, 8).toUpperCase()}`;

export async function tutup() {
  await pool.end();
}
