import { useState } from 'react';
import { Boxes, LogIn } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { useAuth } from '../../hooks/useAuth.js';

export function LoginPage() {
  const { authError, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setLocalError('Email dan password wajib diisi.');
      return;
    }

    setLocalError('');
    setSubmitting(true);
    try {
      await signIn({ email: email.trim(), password });
    } catch (error) {
      setLocalError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ios-background px-4 py-10 text-ios-label">
      <section className="w-full max-w-md rounded-3xl border border-ios-separator bg-white p-6 shadow-ios">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ios-blue text-white">
            <Boxes size={24} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Masuk Mini ERP</h1>
            <p className="text-sm text-ios-secondary">Gunakan akun Firebase Auth perusahaan.</p>
          </div>
        </div>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-semibold text-ios-label">Email</span>
            <input
              autoComplete="email"
              className="mt-2 h-11 w-full rounded-xl border border-ios-separator bg-white px-3 text-sm outline-none transition focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/15"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@company.com"
              type="email"
              value={email}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ios-label">Password</span>
            <input
              autoComplete="current-password"
              className="mt-2 h-11 w-full rounded-xl border border-ios-separator bg-white px-3 text-sm outline-none transition focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/15"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
              value={password}
            />
          </label>

          {localError || authError ? (
            <div className="rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">
              {localError || authError}
            </div>
          ) : null}

          <Button className="w-full" icon={LogIn} type="submit" disabled={submitting}>
            {submitting ? 'Masuk...' : 'Masuk'}
          </Button>
        </form>
      </section>
    </main>
  );
}
