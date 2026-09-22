import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { ambil } from '../lib/rpc.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      qc.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const uid = session?.user?.id;
  const profilQ = useQuery({
    queryKey: ['profil', uid],
    enabled: Boolean(uid),
    queryFn: async () => (await ambil(supabase.from('profil').select('*').eq('id', uid)))[0] ?? null,
  });

  const nilai = {
    session,
    profil: profilQ.data ?? null,
    peran: profilQ.data?.aktif ? profilQ.data.peran : null,
    loading: session === undefined || (Boolean(uid) && profilQ.isLoading),
    keluar: () => supabase.auth.signOut(),
  };
  return <AuthContext.Provider value={nilai}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth di luar AuthProvider');
  return v;
}
