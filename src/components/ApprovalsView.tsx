import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Eye, XCircle } from 'lucide-react';
import { transitionWorkflow } from '../api.ts';
import type { DocumentRecord } from '../types.ts';
import { formatBytes, formatDate, formatDateTime, getFileExtension } from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

interface ApprovalsViewProps {
  documents: DocumentRecord[];
  onInspectDocument: (doc: DocumentRecord) => void;
  onRefresh: () => Promise<void>;
}

export function ApprovalsView({
  documents,
  onInspectDocument,
  onRefresh,
}: ApprovalsViewProps) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectDocId, setRejectDocId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const queue = useMemo(
    () =>
      documents
        .filter((d) => d.status === 'Pending' || d.status === 'Under Review')
        .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()),
    [documents]
  );

  const recentDecisions = useMemo(() => {
    const entries = documents.flatMap((doc) =>
      doc.approvals.map((ap) => ({ ...ap, docCode: doc.docCode, docTitle: doc.title, doc }))
    );
    return entries
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
  }, [documents]);

  const runAction = async (
    docId: number,
    action: 'start_review' | 'approve' | 'reject',
    reason?: string
  ) => {
    setBusyId(docId);
    setError(null);
    try {
      await transitionWorkflow(docId, action, reason);
      setRejectDocId(null);
      setRejectReason('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process approval decision.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-llcc-navy">Pending Approvals</h2>
          <p className="text-xs text-slate-500">
            Review departmental submissions, approve verified records, or return with revision notes.
          </p>
        </div>
        <div className="text-xs font-semibold text-llcc-navy tabular-nums">
          {queue.length} document{queue.length === 1 ? '' : 's'} awaiting action
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          {error}
        </div>
      )}

      {queue.length === 0 ? (
        <div className="rounded-xl bg-white border border-slate-200/80 p-10 text-center">
          <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500" />
          <p className="text-sm font-semibold text-slate-700 mt-2">Approval queue is clear</p>
          <p className="text-xs text-slate-500 mt-1">
            All pending submissions have been reviewed.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {queue.map((doc) => (
            <div
              key={doc.id}
              className="rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-llcc-royal tabular-nums">
                      {doc.docCode}
                    </span>
                    <span className="text-slate-300">·</span>
                    <StatusText status={doc.status} />
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-600">{doc.departmentName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onInspectDocument(doc)}
                    className="font-display text-base font-bold text-slate-900 hover:text-llcc-royal text-left"
                  >
                    {doc.title}
                  </button>
                  <p className="text-xs text-slate-600">
                    {doc.description || 'No description provided.'}
                  </p>
                  <div className="text-xs text-slate-500 tabular-nums">
                    Submitted by <span className="font-medium text-slate-700">{doc.uploadedByName}</span> ·{' '}
                    {doc.categoryName} · {getFileExtension(doc.fileName)} (
                    {formatBytes(doc.fileSizeBytes)}) · {formatDate(doc.createdAt)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onInspectDocument(doc)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>
                  {doc.status === 'Pending' && (
                    <button
                      type="button"
                      disabled={busyId === doc.id}
                      onClick={() => void runAction(doc.id, 'start_review')}
                      className="inline-flex items-center gap-1 rounded-lg border border-llcc-royal px-3 py-1.5 text-xs font-semibold text-llcc-royal hover:bg-blue-50"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Under Review
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === doc.id}
                    onClick={() => void runAction(doc.id, 'approve')}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === doc.id}
                    onClick={() => {
                      setRejectDocId(rejectDocId === doc.id ? null : doc.id);
                      setRejectReason('');
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>

              {rejectDocId === doc.id && (
                <div className="rounded-lg border border-red-200 bg-red-50/70 p-3 space-y-2">
                  <label className="block text-xs font-semibold text-red-900">
                    Reason for Rejection (Sent to {doc.uploadedByName})
                  </label>
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Specify missing signatures, formatting, or compliance requirements..."
                    className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs focus:border-red-400 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setRejectDocId(null)}
                      className="text-xs text-slate-600 px-2.5 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busyId === doc.id || !rejectReason.trim()}
                      onClick={() => void runAction(doc.id, 'reject', rejectReason.trim())}
                      className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Confirm Rejection
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recent Review Decisions */}
      <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-display text-sm font-bold text-llcc-navy">
            Recent Approval &amp; Rejection History
          </h3>
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          {recentDecisions.length === 0 ? (
            <div className="px-5 py-6 text-slate-500 text-center">No approval decisions logged.</div>
          ) : (
            recentDecisions.map((item) => (
              <div
                key={item.id}
                className="px-5 py-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onInspectDocument(item.doc)}
                    className="font-semibold text-llcc-navy hover:text-llcc-royal text-left"
                  >
                    {item.docCode} — {item.docTitle}
                  </button>
                  <div className="text-slate-500 mt-0.5">
                    {item.decision} by {item.reviewerName} ({item.fromStatus} → {item.toStatus})
                    {item.reason ? ` · "${item.reason}"` : ''}
                  </div>
                </div>
                <span className="text-slate-400 tabular-nums shrink-0">
                  {formatDateTime(item.createdAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
