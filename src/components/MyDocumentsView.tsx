import { useMemo, useState } from 'react';
import { AlertCircle, Download, Edit3, Eye, FileText, Send, Upload } from 'lucide-react';
import { transitionWorkflow } from '../api.ts';
import type { DocumentRecord, DocumentStatus, UserAccount } from '../types.ts';
import { formatBytes, formatDate, getFileExtension } from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

interface MyDocumentsViewProps {
  currentUser: UserAccount;
  documents: DocumentRecord[];
  onInspectDocument: (doc: DocumentRecord, tab?: 'overview' | 'edit' | 'versions') => void;
  onDownloadDocument: (doc: DocumentRecord) => Promise<void>;
  onNavigateUpload: () => void;
  onRefresh: () => Promise<void>;
}

export function MyDocumentsView({
  currentUser,
  documents,
  onInspectDocument,
  onDownloadDocument,
  onNavigateUpload,
  onRefresh,
}: MyDocumentsViewProps) {
  const [statusTab, setStatusTab] = useState<'all' | DocumentStatus>('all');
  const [busyId, setBusyId] = useState<number | null>(null);

  const myDocs = useMemo(
    () =>
      documents
        .filter((d) => d.uploadedById === currentUser.id)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [documents, currentUser.id]
  );

  const visibleDocs = useMemo(() => {
    if (statusTab === 'all') return myDocs;
    return myDocs.filter((d) => d.status === statusTab);
  }, [myDocs, statusTab]);

  const counts = useMemo(
    () => ({
      all: myDocs.length,
      Pending: myDocs.filter((d) => d.status === 'Pending' || d.status === 'Under Review').length,
      Approved: myDocs.filter((d) => d.status === 'Approved').length,
      Rejected: myDocs.filter((d) => d.status === 'Rejected').length,
      Draft: myDocs.filter((d) => d.status === 'Draft').length,
    }),
    [myDocs]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl glass-panel p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-llcc-navy">My Documents</h2>
          <p className="text-xs text-slate-500">
            Track your uploaded files, drafts, approval progress, and revision requests.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateUpload}
          className="inline-flex items-center gap-2 rounded-lg bg-llcc-navy px-4 py-2 text-xs font-semibold text-white hover:bg-llcc-royal"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload New Document
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'all', label: `All (${counts.all})` },
            { id: 'Pending', label: `Pending / Review (${counts.Pending})` },
            { id: 'Approved', label: `Approved (${counts.Approved})` },
            { id: 'Rejected', label: `Rejected (${counts.Rejected})` },
            { id: 'Draft', label: `Drafts (${counts.Draft})` },
          ] as const
        ).map((t) => {
          const active = statusTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatusTab(t.id)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-llcc-navy text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {visibleDocs.length === 0 ? (
        <div className="rounded-xl glass-panel p-10 text-center">
          <FileText className="h-8 w-8 mx-auto text-slate-300" />
          <p className="text-sm font-semibold text-slate-700 mt-2">No documents in this view</p>
          <p className="text-xs text-slate-500 mt-1">
            Upload a document or switch status tabs to inspect your submissions.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleDocs.map((doc) => (
            <div
              key={doc.id}
              className="rounded-xl glass-panel p-4 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-llcc-royal tabular-nums">
                      {doc.docCode}
                    </span>
                    <span className="text-slate-300">·</span>
                    <StatusText status={doc.status} />
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500 tabular-nums">v{doc.currentVersion}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onInspectDocument(doc, 'overview')}
                    className="font-display text-base font-bold text-slate-900 hover:text-llcc-royal text-left"
                  >
                    {doc.title}
                  </button>
                  <div className="text-xs text-slate-500 tabular-nums">
                    {doc.categoryName} · {doc.departmentCode} · {getFileExtension(doc.fileName)} (
                    {formatBytes(doc.fileSizeBytes)}) · Uploaded {formatDate(doc.createdAt)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onInspectDocument(doc, 'overview')}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDownloadDocument(doc)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => onInspectDocument(doc, 'edit')}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  {(doc.status === 'Draft' || doc.status === 'Rejected') && (
                    <button
                      type="button"
                      disabled={busyId === doc.id}
                      onClick={async () => {
                        setBusyId(doc.id);
                        try {
                          await transitionWorkflow(doc.id, 'submit');
                          await onRefresh();
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-llcc-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-llcc-royal disabled:opacity-60"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {doc.status === 'Rejected' ? 'Resubmit' : 'Submit for Approval'}
                    </button>
                  )}
                </div>
              </div>

              {doc.status === 'Rejected' && doc.rejectionReason && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <div>
                    <span className="font-semibold">Returned for Revision:</span>{' '}
                    {doc.rejectionReason}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
