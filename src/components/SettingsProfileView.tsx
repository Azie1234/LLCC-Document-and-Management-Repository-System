import { useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, Save, Settings, User } from 'lucide-react';
import { changeOwnPassword, updateOwnProfile, updateSystemSettings } from '../api.ts';
import type { SystemSettings, UserAccount } from '../types.ts';
import { LlccCrest } from './LlccCrest.tsx';

interface SettingsProfileViewProps {
  currentUser: UserAccount;
  systemSettings: SystemSettings;
  onRefresh: () => Promise<void>;
}

export function SettingsProfileView({
  currentUser,
  systemSettings,
  onRefresh,
}: SettingsProfileViewProps) {
  const isSuperAdmin = currentUser.roleSlug === 'super_admin';

  // Profile form
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [email, setEmail] = useState(currentUser.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // System settings form (Super Admin)
  const [collegeName, setCollegeName] = useState(systemSettings.collegeName);
  const [systemTitle, setSystemTitle] = useState(systemSettings.systemTitle);
  const [campusAddress, setCampusAddress] = useState(systemSettings.campusAddress);
  const [academicYear, setAcademicYear] = useState(systemSettings.academicYear);
  const [logoUrl, setLogoUrl] = useState(systemSettings.logoUrl);
  const [maxUploadMb, setMaxUploadMb] = useState(String(systemSettings.maxUploadMb));
  const [allowedFormats, setAllowedFormats] = useState(systemSettings.allowedFormats.join(', '));
  const [notifyOnUpload, setNotifyOnUpload] = useState(systemSettings.notifyOnUpload);
  const [notifyOnApproval, setNotifyOnApproval] = useState(systemSettings.notifyOnApproval);
  const [notifyOnShare, setNotifyOnShare] = useState(systemSettings.notifyOnShare);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await updateOwnProfile({ fullName: fullName.trim(), email: email.trim() });
      setMessage('Personal profile updated.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update profile.');
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await changeOwnPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change password.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSystemSettings = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const formats = allowedFormats
        .split(',')
        .map((f) => f.trim().replace('.', '').toLowerCase())
        .filter(Boolean);
      await updateSystemSettings({
        collegeName: collegeName.trim(),
        systemTitle: systemTitle.trim(),
        campusAddress: campusAddress.trim(),
        academicYear: academicYear.trim(),
        logoUrl: logoUrl.trim() || '/assets/aistudio/image_65e8ffc2.png',
        maxUploadMb: Math.max(1, Number(maxUploadMb) || 25),
        allowedFormats: formats,
        notifyOnUpload,
        notifyOnApproval,
        notifyOnShare,
      });
      setMessage('System repository settings saved.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save system settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-5">
      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Profile Information */}
        <form
          onSubmit={handleSaveProfile}
          className="rounded-xl glass-panel p-5 space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="h-4 w-4 text-llcc-royal" />
            <h2 className="font-display text-base font-bold text-llcc-navy">My Profile</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Institutional Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 rounded-lg p-3 border border-slate-200/70">
              <div>
                <div className="text-slate-400">Role</div>
                <div className="font-semibold text-llcc-navy mt-0.5">{currentUser.roleName}</div>
              </div>
              <div>
                <div className="text-slate-400">Department</div>
                <div className="font-semibold text-slate-800 mt-0.5">
                  {currentUser.departmentName || 'Institution-Wide'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-llcc-navy px-4 py-2 text-xs font-semibold text-white hover:bg-llcc-royal"
            >
              <Save className="h-3.5 w-3.5" />
              Save Profile
            </button>
          </div>
        </form>

        {/* Change Password */}
        <form
          onSubmit={handleChangePassword}
          className="rounded-xl glass-panel p-5 space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <KeyRound className="h-4 w-4 text-llcc-royal" />
            <h2 className="font-display text-base font-bold text-llcc-navy">Security &amp; Password</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-llcc-royal px-4 py-2 text-xs font-semibold text-white hover:bg-llcc-navy"
            >
              Update Password
            </button>
          </div>
        </form>
      </div>

      {/* System Settings (Super Admin) */}
      {isSuperAdmin && (
        <form
          onSubmit={handleSaveSystemSettings}
          className="rounded-xl glass-panel p-6 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-llcc-royal" />
              <h2 className="font-display text-base font-bold text-llcc-navy">
                System Settings &amp; Institutional Branding
              </h2>
            </div>
            <span className="text-xs font-semibold text-llcc-gold">SUPER ADMIN</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                College Name
              </label>
              <input
                type="text"
                required
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                System Title
              </label>
              <input
                type="text"
                required
                value={systemTitle}
                onChange={(e) => setSystemTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Campus Address / Subtitle
              </label>
              <input
                type="text"
                value={campusAddress}
                onChange={(e) => setCampusAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Academic Year
              </label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Logo Asset Path / URL
              </label>
              <div className="flex items-center gap-3">
                <LlccCrest className="h-10 w-10" src={logoUrl} />
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Upload Size Limit (MB)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxUploadMb}
                onChange={(e) => setMaxUploadMb(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Allowed File Formats (comma-separated)
              </label>
              <input
                type="text"
                value={allowedFormats}
                onChange={(e) => setAllowedFormats(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-slate-700">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOnUpload}
                onChange={(e) => setNotifyOnUpload(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>Notify admins on new uploads</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOnApproval}
                onChange={(e) => setNotifyOnApproval(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>Notify submitters on approval/rejection</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOnShare}
                onChange={(e) => setNotifyOnShare(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>Notify users when documents are shared</span>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-llcc-navy px-5 py-2.5 text-xs font-semibold text-white hover:bg-llcc-royal"
            >
              <Save className="h-3.5 w-3.5" />
              Save System Settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
