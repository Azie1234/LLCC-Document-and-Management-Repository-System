import { useState, type FormEvent } from 'react';
import { Edit3, KeyRound, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
import { createUser, deleteUser, updateUser } from '../api.ts';
import type { Department, RoleSlug, UserAccount } from '../types.ts';
import { formatDateTime } from '../utils/format.ts';

interface UserManagementViewProps {
  currentUser: UserAccount;
  users: UserAccount[];
  departments: Department[];
  onRefresh: () => Promise<void>;
}

export function UserManagementView({
  currentUser,
  users,
  departments,
  onRefresh,
}: UserManagementViewProps) {
  const isSuper = currentUser.roleSlug === 'super_admin';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roleSlug, setRoleSlug] = useState<RoleSlug>('faculty_staff');
  const [departmentId, setDepartmentId] = useState<string>(
    departments[0] ? String(departments[0].id) : ''
  );

  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [editRole, setEditRole] = useState<RoleSlug>('faculty_staff');
  const [editDeptId, setEditDeptId] = useState<string>('');
  const [editFullName, setEditFullName] = useState('');
  const [resetPassUserId, setResetPassUserId] = useState<number | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await createUser({
        fullName: fullName.trim(),
        email: email.trim(),
        username: username.trim(),
        password,
        roleSlug,
        departmentId: departmentId ? Number(departmentId) : null,
      });
      setFullName('');
      setEmail('');
      setUsername('');
      setPassword('');
      setSuccess('Account provisioned successfully.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create user.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await updateUser(editingUser.id, {
        fullName: editFullName.trim(),
        roleSlug: editRole,
        departmentId: editDeptId ? Number(editDeptId) : null,
      });
      setEditingUser(null);
      setSuccess('User role and profile updated.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update user.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (userId: number) => {
    if (newPasswordInput.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateUser(userId, { resetPassword: newPasswordInput });
      setResetPassUserId(null);
      setNewPasswordInput('');
      setSuccess('User password has been reset.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-llcc-navy">User Management</h2>
          <p className="text-xs text-slate-500">
            Provision LLCC accounts, assign role tiers and departments, and control account status.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
            {success}
          </div>
        )}

        <form
          onSubmit={handleCreate}
          className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-3"
        >
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full Name"
            className="md:col-span-3 rounded-lg border border-slate-200 px-3 py-2 text-xs"
          />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@llcc.edu.ph"
            className="md:col-span-3 rounded-lg border border-slate-200 px-3 py-2 text-xs"
          />
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Initial Password"
            className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
          />
          <select
            value={roleSlug}
            onChange={(e) => setRoleSlug(e.target.value as RoleSlug)}
            className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
          >
            {isSuper && <option value="super_admin">SUPER ADMIN</option>}
            <option value="admin">ADMIN</option>
            <option value="faculty_staff">FACULTY / STAFF</option>
            <option value="student">STUDENT</option>
          </select>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="md:col-span-4 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
          >
            <option value="">No Department Assigned</option>
            {departments.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
          <div className="md:col-span-8 flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-llcc-navy px-4 py-2 text-xs font-semibold text-white hover:bg-llcc-royal"
            >
              <Plus className="h-3.5 w-3.5" />
              Add User Account
            </button>
          </div>
        </form>
      </div>

      {editingUser && (
        <form
          onSubmit={handleSaveEdit}
          className="rounded-xl bg-white border border-llcc-royal/40 p-5 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-llcc-navy">
              Edit User: {editingUser.email}
            </h3>
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="text-xs text-slate-500"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as RoleSlug)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            >
              {isSuper && <option value="super_admin">SUPER ADMIN</option>}
              <option value="admin">ADMIN</option>
              <option value="faculty_staff">FACULTY / STAFF</option>
              <option value="student">STUDENT</option>
            </select>
            <select
              value={editDeptId}
              onChange={(e) => setEditDeptId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            >
              <option value="">No Department</option>
              {departments.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-llcc-navy px-4 py-1.5 text-xs font-semibold text-white"
            >
              Save User Changes
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Department</th>
                <th className="py-3 px-3">Status &amp; Last Login</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{u.fullName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {u.email} · @{u.username}
                    </div>
                  </td>
                  <td className="py-3 px-3 font-semibold text-llcc-navy whitespace-nowrap">
                    {u.roleName}
                  </td>
                  <td className="py-3 px-3 text-slate-600">
                    {u.departmentCode ? `${u.departmentCode} — ${u.departmentName}` : 'Unassigned'}
                  </td>
                  <td className="py-3 px-3 tabular-nums">
                    <div
                      className={`font-semibold ${
                        u.isActive ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Deactivated'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {u.lastLoginAt ? `Login: ${formatDateTime(u.lastLoginAt)}` : 'Never signed in'}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        title="Edit role & department"
                        onClick={() => {
                          setEditingUser(u);
                          setEditFullName(u.fullName);
                          setEditRole(u.roleSlug);
                          setEditDeptId(u.departmentId ? String(u.departmentId) : '');
                        }}
                        className="p-1.5 rounded-md text-slate-500 hover:text-llcc-navy hover:bg-slate-100"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Reset password"
                        onClick={() => {
                          setResetPassUserId(resetPassUserId === u.id ? null : u.id);
                          setNewPasswordInput('');
                        }}
                        className="p-1.5 rounded-md text-slate-500 hover:text-llcc-royal hover:bg-slate-100"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      {u.id !== currentUser.id && (
                        <>
                          <button
                            type="button"
                            title={u.isActive ? 'Deactivate account' : 'Activate account'}
                            onClick={async () => {
                              await updateUser(u.id, { isActive: !u.isActive });
                              await onRefresh();
                            }}
                            className={`p-1.5 rounded-md ${
                              u.isActive
                                ? 'text-slate-500 hover:text-amber-700 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            {u.isActive ? (
                              <UserX className="h-3.5 w-3.5" />
                            ) : (
                              <UserCheck className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {confirmDeleteId === u.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteUser(u.id);
                                setConfirmDeleteId(null);
                                await onRefresh();
                              }}
                              className="px-2 py-1 rounded bg-red-600 text-white text-[11px] font-semibold"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Delete account"
                              onClick={() => setConfirmDeleteId(u.id)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {resetPassUserId === u.id && (
                      <div className="mt-2 flex items-center justify-end gap-1.5">
                        <input
                          type="password"
                          value={newPasswordInput}
                          onChange={(e) => setNewPasswordInput(e.target.value)}
                          placeholder="New password"
                          className="rounded border border-slate-200 px-2 py-1 text-xs w-36"
                        />
                        <button
                          type="button"
                          onClick={() => void handleResetPassword(u.id)}
                          className="rounded bg-llcc-navy px-2.5 py-1 text-xs font-semibold text-white"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
