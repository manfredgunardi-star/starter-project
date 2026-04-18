import { useContext } from 'react';
import { AuthContext } from '../app/providers.jsx';

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AppProviders');
  }

  return context;
}
