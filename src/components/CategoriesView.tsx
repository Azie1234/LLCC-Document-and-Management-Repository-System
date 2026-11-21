import { useState, type FormEvent } from 'react';
import { Edit3, FolderOpen, Plus, Tags, Trash2 } from 'lucide-react';
import { createCategory, deleteCategory, updateCategory } from '../api.ts';
import type { DocumentCategory, DocumentRecord, UserAccount } from '../types.ts';

interface CategoriesViewProps {
  currentUser: UserAccount;
  categories: DocumentCategory[];
  documents: DocumentRecord[];
  onOpenCategoryInRepo: (categoryId: number) => void;
  onRefresh: () => Promise<void>;
}

export function CategoriesView({
  currentUser,
  categories,
  documents,
  onOpenCategoryInRepo,
  onRefresh,
}: CategoriesViewProps) {
  const isAdmin = currentUser.roleSlug === 'super_admin' || currentUser.roleSlug === 'admin';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createCategory({ name: name.trim(), description: description.trim() });
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
      await updateCategory(id, { name: editName.trim(), description: editDesc.trim() });
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
      <div className="rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-llcc-navy">Document Categories</h2>
            <p className="text-xs text-slate-500">
              Institutional classification taxonomy ({categories.length} categories).
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
            {error}
          </div>
        )}

        {isAdmin && (
          <form
            onSubmit={handleAdd}
            className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-3"
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
              className="md:col-span-6 rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-llcc-royal focus:outline-none"
            />
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
        {categories.map((cat) => {
          const docCount = documents.filter((d) => d.categoryId === cat.id).length;
          const isEditing = editingId === cat.id;

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
                    <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">
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

                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(cat.id);
                            setEditName(cat.name);
                            setEditDesc(cat.description);
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
