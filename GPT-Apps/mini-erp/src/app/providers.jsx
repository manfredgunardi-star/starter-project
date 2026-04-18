import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { isFirebaseConfigured } from '../firebase.js';
import { signInWithEmailPassword, signOutCurrentUser, subscribeAuthState } from '../services/authService.js';
import { demoCompany, subscribeCompanyMemberships } from '../services/companyService.js';

export const AuthContext = createContext(null);
export const CompanyContext = createContext(null);

const demoUser = {
  id: 'demo-user',
  displayName: 'Admin Demo',
  email: 'admin@mini-erp.local',
};

export function AppProviders({ children }) {
  const [user, setUser] = useState(isFirebaseConfigured ? null : demoUser);
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured);
  const [authError, setAuthError] = useState('');
  const [memberships, setMemberships] = useState(isFirebaseConfigured ? [] : [demoCompany]);
  const [activeCompany, setActiveCompany] = useState(isFirebaseConfigured ? null : demoCompany);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState('');

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;

    let unsubscribe = () => {};
    let mounted = true;

    subscribeAuthState(
      (firebaseUser) => {
        if (!mounted) return;
        setUser(
          firebaseUser
            ? {
                id: firebaseUser.uid,
                displayName: firebaseUser.displayName || firebaseUser.email || 'User',
                email: firebaseUser.email,
              }
            : null
        );
        setAuthLoading(false);
      },
      (error) => {
        if (!mounted) return;
        setAuthError(error.message);
        setAuthLoading(false);
      }
    ).then((nextUnsubscribe) => {
      unsubscribe = nextUnsubscribe;
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;

    if (!user?.id) {
      setMemberships([]);
      setActiveCompany(null);
      setCompanyLoading(false);
      return undefined;
    }

    let unsubscribe = () => {};
    let mounted = true;
    setCompanyLoading(true);
    setCompanyError('');

    subscribeCompanyMemberships({
      userId: user.id,
      onData: (nextMemberships) => {
        if (!mounted) return;
        setMemberships(nextMemberships);
        setActiveCompany((current) => {
          if (current && nextMemberships.some((membership) => membership.id === current.id)) {
            return current;
          }

          return nextMemberships[0] || null;
        });
        setCompanyLoading(false);
      },
      onError: (error) => {
        if (!mounted) return;
        setCompanyError(error.message);
        setCompanyLoading(false);
      },
    }).then((nextUnsubscribe) => {
      unsubscribe = nextUnsubscribe;
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [user?.id]);

  const signIn = useCallback(async ({ email, password }) => {
    setAuthError('');
    await signInWithEmailPassword(email, password);
  }, []);

  const signOut = useCallback(async () => {
    if (!isFirebaseConfigured) return;
    await signOutCurrentUser();
  }, []);

  const authValue = useMemo(
    () => ({
      user,
      authError,
      authMode: isFirebaseConfigured ? 'firebase' : 'demo',
      isAuthenticated: Boolean(user),
      loading: authLoading,
      signIn,
      signOut,
    }),
    [authError, authLoading, signIn, signOut, user]
  );
  const companyValue = useMemo(
    () => ({
      activeCompany,
      companyError,
      loading: companyLoading,
      setActiveCompany,
      memberships,
    }),
    [activeCompany, companyError, companyLoading, memberships]
  );

  return (
    <AuthContext.Provider value={authValue}>
      <CompanyContext.Provider value={companyValue}>{children}</CompanyContext.Provider>
    </AuthContext.Provider>
  );
}
