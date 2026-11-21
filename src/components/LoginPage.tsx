import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { loginWithCredentials, loginWithFirebaseToken, resetPassword } from '../api.ts';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type { UserAccount } from '../types.ts';
import { LlccCrest } from './LlccCrest.tsx';

interface LoginPageProps {
  collegeName: string;
  systemTitle: string;
  campusAddress: string;
  academicYear: string;
  logoUrl: string;
  onAuthenticated: (user: UserAccount, token: string, rememberMe: boolean) => void;
}

export function LoginPage({
  collegeName,
  systemTitle,
  campusAddress,
  academicYear,
  logoUrl,
  onAuthenticated,
}: LoginPageProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resetMode, setResetMode] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier.trim()) {
      setError('Please enter your institutional email address or username.');
      return;
    }
    if (!password) {
      setError('Please enter your account password.');
      return;
    }

    setLoading(true);
    try {
      const result = await loginWithCredentials(identifier.trim(), password, rememberMe);
      onAuthenticated(result.user, result.token, rememberMe);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const credential = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await credential.user.getIdToken();
      const result = await loginWithFirebaseToken(idToken);
      onAuthenticated(result.user, result.token, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In did not complete.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccess(null);

    if (!resetIdentifier.trim()) {
      setError('Enter your institutional email or username.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setResetLoading(true);
    try {
      const res = await resetPassword(resetIdentifier.trim(), newPassword);
      setResetSuccess(`Password updated for ${res.email}. You may now sign in with your new password.`);
      setIdentifier(res.email);
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-llcc-canvas flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div
        className="pointer-events-none absolute -top-28 -left-24 h-96 w-96 rounded-full bg-llcc-royal/18 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-llcc-gold/20 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto w-full max-w-5xl overflow-hidden rounded-2xl glass-panel grid grid-cols-1 lg:grid-cols-12">
        {/* Left Institutional Branding Panel */}
        <div className="lg:col-span-5 glass-navy border-0 text-white p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-400/20 blur-2xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -left-20 -bottom-24 h-64 w-64 rounded-full bg-llcc-gold/20 blur-2xl"
            aria-hidden="true"
          />

          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-4">
              <LlccCrest className="h-14 w-14 shadow-md" src={logoUrl} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-llcc-gold">
                  {academicYear}
                </p>
                <h1 className="font-display text-xl font-bold tracking-tight text-white">
                  {collegeName}
                </h1>
                <p className="text-xs text-slate-300 mt-0.5">{campusAddress}</p>
              </div>
            </div>

            <div className="h-px bg-white/15" />

            <div className="space-y-2.5">
              <h2 className="font-display text-2xl font-bold leading-snug text-white">
                {systemTitle}
              </h2>
              <p className="text-sm text-slate-200/90 leading-relaxed">
                Centralized institutional records control, version-tracked file preservation, and
                role-governed approval workflows for college administration, faculty, and students.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-llcc-gold">
                Institutional Access Tiers
              </p>
              <div className="space-y-2 text-xs text-slate-200">
                <div className="rounded-lg glass-subcard px-3.5 py-2">
                  <div className="font-semibold text-white">SUPER ADMIN</div>
                  <div className="text-slate-300 mt-0.5">
                    Complete system governance, user roles, department structure &amp; settings.
                  </div>
                </div>
                <div className="rounded-lg glass-subcard px-3.5 py-2">
                  <div className="font-semibold text-white">DEAN</div>
                  <div className="text-slate-300 mt-0.5">
                    Centralized viewer and approver across COT, HTM, and EDUC repositories.
                  </div>
                </div>
                <div className="rounded-lg glass-subcard px-3.5 py-2">
                  <div className="font-semibold text-white">DEPARTMENT HEAD</div>
                  <div className="text-slate-300 mt-0.5">
                    Full management of assigned college repository (COT, HTM, or EDUC).
                  </div>
                </div>
                <div className="rounded-lg glass-subcard px-3.5 py-2">
                  <div className="font-semibold text-white">STAFF &amp; STUDENT</div>
                  <div className="text-slate-300 mt-0.5">
                    Departmental record uploads for staff; published &amp; shared access for students.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-8 mt-8 border-t border-white/15 flex items-center gap-2 text-xs text-slate-300">
            <ShieldCheck className="h-4 w-4 text-llcc-gold shrink-0" />
            <span>Authenticated access required · Protected institutional repository</span>
          </div>
        </div>

        {/* Right Sign-In / Password Reset Panel */}
        <div className="lg:col-span-7 p-8 sm:p-10 lg:p-12 flex flex-col justify-center bg-white/55 backdrop-blur-md">
          <div className="flex flex-col items-start mb-6">
            <div className="flex items-center gap-3 lg:hidden mb-4">
              <LlccCrest className="h-11 w-11" src={logoUrl} />
              <div>
                <div className="font-display font-bold text-llcc-navy text-base">{collegeName}</div>
                <div className="text-xs text-slate-500">{campusAddress}</div>
              </div>
            </div>

            <span className="text-xs font-semibold uppercase tracking-wider text-llcc-royal">
              {resetMode ? 'Credential Recovery' : 'Authorized Portal Sign-In'}
            </span>
            <h2 className="font-display text-2xl font-bold text-llcc-navy mt-1">
              {resetMode ? 'Reset Account Password' : 'Welcome to LLCC Document Repository'}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {resetMode
                ? 'Verify your institutional email or username to set a new password.'
                : 'Sign in with your @llcc.edu.ph account or username to access the dashboard.'}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {resetSuccess && (
            <div
              role="status"
              className="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{resetSuccess}</span>
            </div>
          )}

          {resetMode ? (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label
                  htmlFor="reset-identifier"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Institutional Email or Username
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="reset-identifier"
                    type="text"
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                    placeholder="e.g. marco.villanueva@llcc.edu.ph"
                    className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-llcc-royal focus:outline-none focus:ring-2 focus:ring-llcc-royal/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="reset-new-password"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <KeyRound className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="reset-new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-llcc-royal focus:outline-none focus:ring-2 focus:ring-llcc-royal/20"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="reset-confirm-password"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="reset-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-llcc-royal focus:outline-none focus:ring-2 focus:ring-llcc-royal/20"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setResetMode(false);
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-llcc-navy"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Login
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="inline-flex items-center justify-center rounded-lg bg-llcc-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-llcc-royal disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  {resetLoading ? 'Updating Password...' : 'Update Password'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label
                  htmlFor="login-identifier"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Email or Username
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-identifier"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="name@llcc.edu.ph or username"
                    className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-llcc-royal focus:outline-none focus:ring-2 focus:ring-llcc-royal/20"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-11 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-llcc-royal focus:outline-none focus:ring-2 focus:ring-llcc-royal/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-llcc-royal focus:ring-llcc-royal"
                  />
                  <span>Remember me on this workstation</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setResetMode(true);
                    setError(null);
                    setResetSuccess(null);
                    setResetIdentifier(identifier);
                  }}
                  className="font-semibold text-llcc-royal hover:text-llcc-navy"
                >
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || googleLoading}
                className="w-full rounded-lg bg-llcc-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-llcc-royal disabled:opacity-60 transition-colors shadow-sm"
              >
                {loading ? 'Signing In...' : 'Sign In to Repository'}
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-slate-400 font-medium">
                    or continue with institutional SSO
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading || googleLoading}
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>{googleLoading ? 'Connecting Google Account...' : 'Sign in with Google (@llcc.edu.ph)'}</span>
              </button>
            </form>
          )}

          {/* Account Access Information */}
          <div className="mt-6 rounded-xl bg-white/60 backdrop-blur-sm border border-white/80 p-4 text-xs text-slate-600 space-y-1.5 shadow-xs">
            <div className="flex items-center gap-1.5 font-semibold text-llcc-navy">
              <Info className="h-3.5 w-3.5 text-llcc-gold" />
              <span>Account Access Information</span>
            </div>
            <p className="leading-relaxed">
              Access is provisioned by the LLCC Records Management &amp; MIS Office. Personnel and
              students must sign in using their assigned <span className="font-mono text-slate-800">@llcc.edu.ph</span>{' '}
              institutional email or repository username. All document views, downloads, and status
              transitions are recorded in the compliance log.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
