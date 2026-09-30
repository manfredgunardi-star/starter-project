import { supabase } from './supabase.js';
import { pesanError } from './errors.js';

export class RpcError extends Error {
  constructor(asli) {
    super(pesanError(asli));
    this.name = 'RpcError';
    this.code = asli?.code;
    this.asli = asli;
  }
}

export async function panggilRpc(nama, args = {}) {
  const { data, error } = await supabase.rpc(nama, args);
  if (error) throw new RpcError(error);
  return data;
}

export async function ambil(query) {
  const { data, error } = await query;
  if (error) throw new RpcError(error);
  return data ?? [];
}
