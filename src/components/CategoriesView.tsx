import { useMemo, useState, type FormEvent } from 'react';
import { Edit3, FolderOpen, Plus, Tags, Trash2 } from 'lucide-react';
import { createCategory, deleteCategory, updateCategory } from '../api.ts';
import type { Department, DocumentCategory, DocumentRecord, UserAccount } from '../types.ts';

interface CategoriesViewProps {
  currentUser: UserAccount;
  categories: DocumentCategory[];
  departments: Department[];
  documents: DocumentRecord[];
  onOpenCategoryInRepo: (categoryId: number) => void;
  onRefresh: () => Promise<void>;
}

export function CategoriesView({
  currentUser,
  categories,
  departments,
  documents,
  onOpenCategoryInRepo,
  onRefresh,
}: CategoriesViewProps) {
  const isSuperAdmin = currentUser.roleSlug === 'super_admin';
  const isDeptHead = currentUser.roleSlug === 'department_head';
  const canCreate = isSuperAdmin || isDeptHead;

  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [newDeptId, setNewDeptId] = useState<string>(
    isDeptHead && currentUser.departmentId ? String(currentUser.departmentId) : ''
  );

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDeptId, setEditDeptId] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visibleCategories = useMemo(() => {
    return categories.filter((c) => {
      if (deptFilter === 'all') return true;
      if (deptFilter === 'general') return c.departmentId === null;
      return String(c.departmentId) === deptFilter;
    });
  }, [categories, deptFilter]);

  const canModifyCategory = (cat: DocumentCategory): boolean => {
    if (isSuperAdmin) return true;
    if (isDeptHead && currentUser.departmentId !== null) {
      return cat.departmentId === currentUser.departmentId;
    }
    return false;
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createCategory({
        name: name.trim(),
        description: description.trim(),
        departmentId: isDeptHead
          ? currentUser.departmentId
          : newDeptId
            ? Number(newDeptId)
            : null,
      });
      setName('');
      setDescription('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add category.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (id: number) => {
    setBusy(true);
    setError(null);
    try {
      await updateCategory(id, {
        name: editName.trim(),
        description: editDesc.trim(),
        departmentId: isSuperAdmin ? (editDeptId ? Number(editDeptId) : null) : undefined,
      });
      setEditingId(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update category.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    setBusy(true);
    setError(null);
    try {
      await deleteCategory(id);
      setConfirmDeleteId(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete category.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-llcc-navy">Document Categories</h2>
            <p className="text-xs text-slate-500">
              General institutional classifications and college-specific categories for COT, HTM, and
              EDUC ({categories.length} total).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'general', label: 'General' },
              ...departments.map((d) => ({ id: String(d.id), label: d.code })),
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDeptFilter(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  deptFilter === tab.id
                    ? 'bg-llcc-navy text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
            {error}
          </div>
        )}

        {canCreate && (
          <form
            onSubmit={handleAdd}
            className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-3"
          >
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New category name"
              className="md:col-span-4 rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-llcc-royal focus:outline-none"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of records covered"
              className="md:col-span-4 rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-llcc-royal focus:outline-none"
            />
            {isSuperAdmin ? (
              <select
                value={newDeptId}
                onChange={(e) => setNewDeptId(e.target.value)}
                aria-label="Category department scope"
                className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
              >
                <option value="">General (All Colleges)</option>
                {departments.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.code} Only
                  </option>
                ))}
              </select>
            ) : (
              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-llcc-navy flex items-center">
                {currentUser.departmentCode || 'Department'} Only
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="md:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-llcc-navy px-3 py-2 text-xs font-semibold text-white hover:bg-llcc-royal disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Category
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleCategories.map((cat) => {
          const docCount = documents.filter((d) => d.categoryId === cat.id).length;
          const isEditing = editingId === cat.id;
          const editable = canModifyCategory(cat);

          return (
            <div
              key={cat.id}
              className="rounded-xl bg-white border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between gap-3"
            >
              {isEditing ? (
                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold"
                  />
                  <textarea
                    rows={2}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                  />
                  {isSuperAdmin && (
                    <select
                      value={editDeptId}
                      onChange={(e) => setEditDeptId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="">General (All Colleges)</option>
                      {departments.map((d) => (
                        <option key={d.id} value={String(d.id)}>
                          {d.code} — {d.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSaveEdit(cat.id)}
                      className="rounded-md bg-llcc-navy px-3 py-1 text-xs font-semibold text-white"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Tags className="h-4 w-4 text-llcc-royal shrink-0" />
                        <h3 className="font-display text-sm font-bold text-llcc-navy truncate">
                          {cat.name}
                        </h3>
                      </div>
                      <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums shrink-0">
                        {docCount} doc{docCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-llcc-royal">
                      {cat.departmentCode
                        ? `${cat.departmentCode} — ${cat.departmentName}`
                        : 'General Institutional Category'}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {cat.description || 'Institutional document classification.'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenCategoryInRepo(cat.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-llcc-royal hover:text-llcc-navy"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Browse Records
                    </button>

                    {editable && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(cat.id);
                            setEditName(cat.name);
                            setEditDesc(cat.description);
                            setEditDeptId(cat.departmentId ? String(cat.departmentId) : '');
                          }}
                          title="Edit category"
                          className="p-1.5 rounded-md text-slate-400 hover:text-llcc-navy hover:bg-slate-100"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        {confirmDeleteId === cat.id ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDelete(cat.id)}
                            className="px-2 py-1 rounded bg-red-600 text-white text-[11px] font-semibold"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(cat.id)}
                            title="Delete category"
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
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
