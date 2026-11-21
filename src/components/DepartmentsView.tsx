import { useState, type FormEvent } from 'react';
import { Building2, Edit3, FolderOpen, Plus, Trash2, Users } from 'lucide-react';
import { createDepartment, deleteDepartment, updateDepartment } from '../api.ts';
import type { Department, DocumentRecord, RetentionPolicy, UserAccount } from '../types.ts';

interface DepartmentsViewProps {
  currentUser: UserAccount;
  departments: Department[];
  documents: DocumentRecord[];
  users: UserAccount[];
  onOpenDepartmentInRepo: (departmentId: number) => void;
  onRefresh: () => Promise<void>;
}

export function DepartmentsView({
  currentUser,
  departments,
  documents,
  users,
  onOpenDepartmentInRepo,
  onRefresh,
}: DepartmentsViewProps) {
  const isSuperAdmin = currentUser.roleSlug === 'super_admin';
  const isDeptHead = currentUser.roleSlug === 'department_head';

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [head, setHead] = useState('');
  const [description, setDescription] = useState('');
  const [retentionDefault, setRetentionDefault] = useState<RetentionPolicy>('5 Years');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editHead, setEditHead] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editRetention, setEditRetention] = useState<RetentionPolicy>('5 Years');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEditDept = (dept: Department): boolean => {
    if (isSuperAdmin) return true;
    return isDeptHead && currentUser.departmentId === dept.id;
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createDepartment({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        head: head.trim(),
        description: description.trim(),
        retentionDefault,
      });
      setCode('');
      setName('');
      setHead('');
      setDescription('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register department.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (id: number) => {
    setBusy(true);
    setError(null);
    try {
      await updateDepartment(id, {
        code: editCode.trim().toUpperCase(),
        name: editName.trim(),
        head: editHead.trim(),
        description: editDesc.trim(),
        retentionDefault: editRetention,
      });
      setEditingId(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update department.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    setBusy(true);
    setError(null);
    try {
      await deleteDepartment(id);
      setConfirmDeleteId(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete department.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl glass-panel p-5 space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-llcc-navy">
            Academic Departments (COT · HTM · EDUC)
          </h2>
          <p className="text-xs text-slate-500">
            Centralized college repositories governed by each Department Head with Academic Dean
            oversight and approval.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
            {error}
          </div>
        )}

        {isSuperAdmin && (
          <form
            onSubmit={handleAdd}
            className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-3"
          >
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code (e.g. ENG)"
              className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono uppercase"
            />
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Department Name"
              className="md:col-span-3 rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
            <input
              type="text"
              required
              value={head}
              onChange={(e) => setHead(e.target.value)}
              placeholder="Department Head"
              className="md:col-span-3 rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
            <select
              value={retentionDefault}
              onChange={(e) => setRetentionDefault(e.target.value as RetentionPolicy)}
              className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
            >
              <option value="3 Years">3 Years</option>
              <option value="5 Years">5 Years</option>
              <option value="7 Years">7 Years</option>
              <option value="Permanent">Permanent</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="md:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-llcc-navy px-3 py-2 text-xs font-semibold text-white hover:bg-llcc-royal"
            >
              <Plus className="h-3.5 w-3.5" />
              Add College
            </button>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Department mandate / description"
              className="md:col-span-12 rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {departments.map((dept) => {
          const deptDocs = documents.filter((d) => d.departmentId === dept.id);
          const pendingDocs = deptDocs.filter(
            (d) => d.status === 'Pending' || d.status === 'Under Review'
          ).length;
          const personnel = users.filter((u) => u.departmentId === dept.id);
          const isEditing = editingId === dept.id;
          const editable = canEditDept(dept);

          return (
            <div
              key={dept.id}
              className="rounded-xl glass-panel p-5 flex flex-col justify-between space-y-3"
            >
              {isEditing ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={editCode}
                      disabled={!isSuperAdmin}
                      onChange={(e) => setEditCode(e.target.value)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-mono uppercase disabled:bg-slate-50"
                    />
                    <input
                      type="text"
                      value={editName}
                      disabled={!isSuperAdmin}
                      onChange={(e) => setEditName(e.target.value)}
                      className="col-span-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold disabled:bg-slate-50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editHead}
                      onChange={(e) => setEditHead(e.target.value)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                    />
                    <select
                      value={editRetention}
                      onChange={(e) => setEditRetention(e.target.value as RetentionPolicy)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="3 Years">3 Years</option>
                      <option value="5 Years">5 Years</option>
                      <option value="7 Years">7 Years</option>
                      <option value="Permanent">Permanent</option>
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-xs text-slate-500 px-2 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSaveEdit(dept.id)}
                      className="rounded-md bg-llcc-navy px-3 py-1 text-xs font-semibold text-white"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-llcc-royal shrink-0" />
                          <span className="font-mono text-xs font-bold text-llcc-royal">
                            {dept.code}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-xs text-slate-500">
                            Retention: {dept.retentionDefault}
                          </span>
                        </div>
                        <h3 className="font-display text-base font-bold text-llcc-navy mt-1">
                          {dept.name}
                        </h3>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-display text-lg font-bold text-llcc-navy tabular-nums">
                          {deptDocs.length}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {pendingDocs > 0 ? `${pendingDocs} pending` : 'documents'}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600">{dept.description}</p>

                    <div className="rounded-lg bg-slate-50 border border-slate-200/70 p-3 text-xs space-y-1.5">
                      <div>
                        <span className="text-slate-500">Department Head:</span>{' '}
                        <span className="font-semibold text-slate-800">{dept.head}</span>
                      </div>
                      <div className="flex items-start gap-1.5 text-slate-600">
                        <Users className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>
                          Assigned Personnel ({personnel.length}):{' '}
                          {personnel.length > 0
                            ? personnel.map((u) => u.fullName).join(', ')
                            : 'No personnel assigned'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenDepartmentInRepo(dept.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-llcc-royal hover:text-llcc-navy"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Open {dept.code} Repository
                    </button>

                    {editable && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(dept.id);
                            setEditCode(dept.code);
                            setEditName(dept.name);
                            setEditHead(dept.head);
                            setEditDesc(dept.description);
                            setEditRetention(dept.retentionDefault);
                          }}
                          title="Edit department"
                          className="p-1.5 rounded-md text-slate-400 hover:text-llcc-navy hover:bg-slate-100"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        {isSuperAdmin &&
                          (confirmDeleteId === dept.id ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleDelete(dept.id)}
                              className="px-2 py-1 rounded bg-red-600 text-white text-[11px] font-semibold"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(dept.id)}
                              title="Delete department"
                              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
