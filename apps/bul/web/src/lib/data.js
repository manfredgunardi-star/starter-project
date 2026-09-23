import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { supabase } from './supabase.js';
import { ambil, panggilRpc } from './rpc.js';

export function useDaftar(tabel, { select = '*', order, filter = [], enabled = true } = {}) {
  return useQuery({
    queryKey: ['tabel', tabel, select, order, filter],
    enabled,
    queryFn: () => {
      let q = supabase.from(tabel).select(select);
      for (const [op, kolom, nilai] of filter) q = q[op](kolom, nilai);
      if (order) q = q.order(order.kolom, { ascending: order.naik ?? true });
      return ambil(q.limit(5000));
    },
  });
}

export function useFungsi(nama, args, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['fungsi', nama, args],
    enabled,
    queryFn: () => panggilRpc(nama, args),
  });
}

export function useOpsi(sumber) {
  const { tabel, label, value = 'id', filterAktif = true } = sumber ?? {};
  const q = useDaftar(tabel, {
    enabled: Boolean(tabel),
    filter: filterAktif ? [['eq', 'aktif', true]] : [],
    order: { kolom: sumber?.order ?? label },
  });
  const options = (q.data ?? []).map((r) => ({
    value: r[value],
    label: typeof label === 'function' ? label(r) : r[label],
  }));
  return { options, isLoading: q.isLoading };
}

export function useRpc(nama, { invalidate = [], pesanSukses = 'Tersimpan' } = {}) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (args) => panggilRpc(nama, args),
    onSuccess: async () => {
      await Promise.all(invalidate.flatMap((k) => [
        qc.invalidateQueries({ queryKey: ['tabel', k] }),
        qc.invalidateQueries({ queryKey: ['fungsi', k] }),
      ]));
      if (pesanSukses) message.success(pesanSukses);
    },
    onError: (e) => message.error(e.message),
  });
}
