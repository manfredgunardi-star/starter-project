import { useContext } from 'react';
import { CompanyContext } from '../app/providers.jsx';

export function useCompany() {
  const context = useContext(CompanyContext);

  if (!context) {
    throw new Error('useCompany must be used inside AppProviders');
  }

  return context;
}
