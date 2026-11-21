import { useMemo, useState } from 'react';
import { Download, Eye, Share2 } from 'lucide-react';
import { revokeShare } from '../api.ts';
import type { DocumentRecord, DocumentShare, UserAccount } from '../types.ts';
import { formatDate } from '../utils/format.ts';

interface SharedDocumentsViewProps {
  currentUser: UserAccount;
  documents: DocumentRecord[];
  onInspectDocument: (doc: DocumentRecord, tab?: 'overview' | 'share') => void;
  onDownloadDocument: (doc: DocumentRecord) => Promise<void>;
  onRefresh: () => Promise<void>;
}

interface ShareRow {
  doc: DocumentRecord;
  share: DocumentShare;
}

export function SharedDocumentsView({
  currentUser,
  documents,
  onInspectDocument,
  onDownloadDocument,
  onRefresh,
}: SharedDocumentsViewProps) {
  const [tab, setTab] = useState<'with-me' | 'by-me'>('with-me');
  const [busyShareId, setBusyShareId] = useState<number | null>(null);

  const sharedWithMe = useMemo<ShareRow[]>(() => {
    const rows: ShareRow[] = [];
    for (const doc of documents) {
      for (const s of doc.shares) {
        if (s.revokedAt) continue;
        if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) continue;
        const matchesUser = s.targetUserId === currentUser.id;
        const matchesDept =
          s.targetDepartmentId !== null && s.targetDepartmentId === currentUser.departmentId;
        const matchesRole = s.targetRoleSlug === currentUser.roleSlug;
        if (matchesUser || matchesDept || matchesRole) {
          rows.push({ doc, share: s });
        }
      }
    }
    return rows;
  }, [documents, currentUser]);

  const sharedByMe = useMemo<ShareRow[]>(() => {
    const rows: ShareRow[] = [];
    for (const doc of documents) {
      for (const s of doc.shares) {
        if (
          s.sharedById === currentUser.id ||
          currentUser.roleSlug === 'super_admin' ||
          currentUser.roleSlug === 'admin'
        ) {
          if (!s.revokedAt) rows.push({ doc, share: s });
        }
      }
    }
    return rows;
  }, [documents, currentUser]);

  const rows = tab === 'with-me' ? sharedWithMe : sharedByMe;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-llcc-navy">Shared Documents</h2>
          <p className="text-xs text-slate-500">
            Cross-departmental document shares, permission levels, and link expirations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('with-me')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
              tab === 'with-me'
                ? 'bg-llcc-navy text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Shared With Me ({sharedWithMe.length})
          </button>
          {currentUser.roleSlug !== 'student' && (
            <button
              type="button"
              onClick={() => setTab('by-me')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
                tab === 'by-me'
                  ? 'bg-llcc-navy text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Shared By Me / Managed ({sharedByMe.length})
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-white border border-slate-200/80 p-10 text-center">
          <Share2 className="h-8 w-8 mx-auto text-slate-300" />
          <p className="text-sm font-semibold text-slate-700 mt-2">No active document shares</p>
          <p className="text-xs text-slate-500 mt-1">
            Open any document inspector to share access with a user, department, or role.
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-3">Recipient / Scope</th>
                  <th className="py-3 px-3">Permission</th>
                  <th className="py-3 px-3">Shared By &amp; Expiry</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ doc, share }) => {
                  const recipientLabel =
                    share.targetUserName ||
                    share.targetDepartmentName ||
                    (share.targetRoleSlug
                      ? `Role: ${share.targetRoleSlug.toUpperCase()}`
                      : 'Institutional');

                  return (
                    <tr key={share.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onInspectDocument(doc, 'overview')}
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
                      <td className="py-3 px-3 font-medium text-slate-700">{recipientLabel}</td>
                      <td className="py-3 px-3 uppercase font-semibold text-llcc-navy">
                        {share.permission}
                      </td>
                      <td className="py-3 px-3 text-slate-500 tabular-nums">
                        <div>By {share.sharedByName}</div>
                        <div className="text-[11px]">
                          {share.expiresAt ? `Expires ${formatDate(share.expiresAt)}` : 'No expiry'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onInspectDocument(doc, 'overview')}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>
                          {(share.permission === 'download' || share.permission === 'edit') && (
                            <button
                              type="button"
                              onClick={() => void onDownloadDocument(doc)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </button>
                          )}
                          {(share.sharedById === currentUser.id ||
                            currentUser.roleSlug === 'super_admin' ||
                            currentUser.roleSlug === 'admin') && (
                            <button
                              type="button"
                              disabled={busyShareId === share.id}
                              onClick={async () => {
                                setBusyShareId(share.id);
                                try {
                                  await revokeShare(share.id);
                                  await onRefresh();
                                } finally {
                                  setBusyShareId(null);
                                }
                              }}
                              className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
