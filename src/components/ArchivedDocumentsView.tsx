import { useMemo, useState } from 'react';
import { Archive, Eye, RotateCcw, Search, Trash2 } from 'lucide-react';
import { deleteDocumentPermanently, transitionWorkflow } from '../api.ts';
import type { DocumentRecord } from '../types.ts';
import { formatBytes, formatDate, getFileExtension } from '../utils/format.ts';

interface ArchivedDocumentsViewProps {
  documents: DocumentRecord[];
  onInspectDocument: (doc: DocumentRecord) => void;
  onRefresh: () => Promise<void>;
}

export function ArchivedDocumentsView({
  documents,
  onInspectDocument,
  onRefresh,
}: ArchivedDocumentsViewProps) {
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const archivedDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents
      .filter((d) => d.status === 'Archived')
      .filter((d) => {
        if (!q) return true;
        return [d.title, d.docCode, d.categoryName, d.departmentCode, d.uploadedByName]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const ta = new Date(a.archivedAt || a.updatedAt).getTime();
        const tb = new Date(b.archivedAt || b.updatedAt).getTime();
        return tb - ta;
      });
  }, [documents, query]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-llcc-navy">Archived Documents</h2>
          <p className="text-xs text-slate-500">
            Long-term institutional vault. Restore active records or permanently purge obsolete files.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search archived records..."
            className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-xs focus:border-llcc-royal focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
          {error}
        </div>
      )}

      {archivedDocs.length === 0 ? (
        <div className="rounded-xl bg-white border border-slate-200/80 p-10 text-center">
          <Archive className="h-8 w-8 mx-auto text-slate-300" />
          <p className="text-sm font-semibold text-slate-700 mt-2">No archived documents found</p>
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-3">Department &amp; Category</th>
                  <th className="py-3 px-3">File</th>
                  <th className="py-3 px-3">Archive Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {archivedDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => onInspectDocument(doc)}
                        className="text-left"
                      >
                        <div className="font-mono text-[11px] font-semibold text-llcc-royal tabular-nums">
                          {doc.docCode}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 hover:text-llcc-royal">
                          {doc.title}
                        </div>
                      </button>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      <div className="font-semibold text-llcc-navy">{doc.departmentCode}</div>
                      <div className="text-[11px] text-slate-500">{doc.categoryName}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 tabular-nums">
                      {getFileExtension(doc.fileName)} · {formatBytes(doc.fileSizeBytes)}
                    </td>
                    <td className="py-3 px-3 text-slate-500 tabular-nums">
                      {formatDate(doc.archivedAt || doc.updatedAt)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onInspectDocument(doc)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Inspect
                        </button>
                        <button
                          type="button"
                          disabled={busyId === doc.id}
                          onClick={async () => {
                            setBusyId(doc.id);
                            setError(null);
                            try {
                              await transitionWorkflow(doc.id, 'restore');
                              await onRefresh();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Restore failed.');
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md bg-llcc-navy px-2.5 py-1 text-xs font-semibold text-white hover:bg-llcc-royal disabled:opacity-60"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </button>
                        {confirmDeleteId === doc.id ? (
                          <button
                            type="button"
                            disabled={busyId === doc.id}
                            onClick={async () => {
                              setBusyId(doc.id);
                              setError(null);
                              try {
                                await deleteDocumentPermanently(doc.id);
                                setConfirmDeleteId(null);
                                await onRefresh();
                              } catch (err) {
                                setError(
                                  err instanceof Error ? err.message : 'Permanent delete failed.'
                                );
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                          >
                            Confirm Delete
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(doc.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
