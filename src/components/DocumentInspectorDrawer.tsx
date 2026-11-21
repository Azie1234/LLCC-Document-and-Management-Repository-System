import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Eye,
  FileText,
  History,
  MessageSquare,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  addComment,
  deleteDocumentPermanently,
  downloadDocumentFile,
  fetchDocumentTextContent,
  getDocumentInlineUrl,
  revokeShare,
  shareDocument,
  transitionWorkflow,
  updateDocumentMetadata,
  uploadDocumentVersion,
} from '../api.ts';
import type {
  ConfidentialityLevel,
  Department,
  DocumentCategory,
  DocumentRecord,
  RetentionPolicy,
  RoleSlug,
  SharePermission,
  UserAccount,
} from '../types.ts';
import {
  fileToBase64,
  formatBytes,
  formatDate,
  formatDateTime,
  getFileExtension,
  getRetentionInfo,
} from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

export type InspectorTab = 'overview' | 'edit' | 'versions' | 'share' | 'activity';

interface DocumentInspectorDrawerProps {
  doc: DocumentRecord | null;
  initialTab?: InspectorTab;
  currentUser: UserAccount;
  categories: DocumentCategory[];
  departments: Department[];
  users: UserAccount[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export function DocumentInspectorDrawer({
  doc,
  initialTab = 'overview',
  currentUser,
  categories,
  departments,
  users,
  onClose,
  onRefresh,
}: DocumentInspectorDrawerProps) {
  const [tab, setTab] = useState<InspectorTab>(initialTab);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Reject reason modal/panel
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmPurge, setConfirmPurge] = useState(false);

  // Edit metadata form
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCatId, setEditCatId] = useState(1);
  const [editDeptId, setEditDeptId] = useState(1);
  const [editType, setEditType] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editConf, setEditConf] = useState<ConfidentialityLevel>('Internal');
  const [editRetention, setEditRetention] = useState<RetentionPolicy>('5 Years');
  const [editTags, setEditTags] = useState('');

  // Version upload form
  const [versionBump, setVersionBump] = useState<'minor' | 'major'>('minor');
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionNotes, setVersionNotes] = useState('');

  // Share form
  const [shareTargetType, setShareTargetType] = useState<'user' | 'department' | 'role'>('user');
  const [shareUserId, setShareUserId] = useState<string>('');
  const [shareDeptId, setShareDeptId] = useState<string>('');
  const [shareRoleSlug, setShareRoleSlug] = useState<RoleSlug>('faculty_staff');
  const [sharePerm, setSharePerm] = useState<SharePermission>('view');
  const [shareExpiry, setShareExpiry] = useState('');

  // Comment input
  const [commentBody, setCommentBody] = useState('');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, doc?.id]);

  useEffect(() => {
    if (!doc) return;
    setActionError(null);
    setActionSuccess(null);
    setRejectOpen(false);
    setRejectReason('');
    setConfirmPurge(false);

    setEditTitle(doc.title);
    setEditDesc(doc.description);
    setEditCatId(doc.categoryId);
    setEditDeptId(doc.departmentId);
    setEditType(doc.documentType);
    setEditYear(doc.academicYear);
    setEditConf(doc.confidentiality);
    setEditRetention(doc.retentionPolicy);
    setEditTags(doc.tags.join(', '));

    if (users.length > 0 && !shareUserId) {
      const other = users.find((u) => u.id !== currentUser.id) || users[0];
      if (other) setShareUserId(String(other.id));
    }
    if (departments.length > 0 && !shareDeptId) {
      setShareDeptId(String(departments[0].id));
    }

    const ext = getFileExtension(doc.fileName).toLowerCase();
    const isTextLike =
      doc.mimeType.startsWith('text/') ||
      ext === 'txt' ||
      ext === 'md' ||
      ext === 'csv' ||
      ext === 'json';

    if (isTextLike) {
      setPreviewError(null);
      fetchDocumentTextContent(doc.id)
        .then((res) => setTextPreview(res.content))
        .catch((err) => {
          setTextPreview(null);
          setPreviewError(err instanceof Error ? err.message : 'Unable to load preview.');
        });
    } else {
      setTextPreview(null);
      setPreviewError(null);
    }
  }, [doc, currentUser.id, departments, users, shareUserId, shareDeptId]);

  const csvRows = useMemo(() => {
    if (!doc || textPreview === null) return null;
    const ext = getFileExtension(doc.fileName).toLowerCase();
    if (ext !== 'csv') return null;
    return textPreview
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(0, 40)
      .map((line) => line.split(',').map((cell) => cell.replace(/^"|"$/g, '').trim()));
  }, [doc, textPreview]);

  if (!doc) return null;

  const isAdmin = currentUser.roleSlug === 'super_admin' || currentUser.roleSlug === 'admin';
  const canModify =
    currentUser.roleSlug !== 'student' && (isAdmin || doc.uploadedById === currentUser.id);
  const retention = getRetentionInfo(doc);
  const ext = getFileExtension(doc.fileName).toLowerCase();
  const isPdf = doc.mimeType === 'application/pdf' || ext === 'pdf';
  const isImage =
    doc.mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext);

  const runWorkflow = async (
    action: 'submit' | 'start_review' | 'approve' | 'reject' | 'archive' | 'restore',
    reason?: string
  ) => {
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await transitionWorkflow(doc.id, action, reason);
      setActionSuccess(`Document status updated (${action.replace('_', ' ')}).`);
      setRejectOpen(false);
      setRejectReason('');
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Workflow action failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMetadata = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await updateDocumentMetadata(doc.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
        categoryId: editCatId,
        departmentId: editDeptId,
        documentType: editType.trim() || 'Official Record',
        academicYear: editYear.trim() || 'AY 2026-2027',
        confidentiality: editConf,
        retentionPolicy: editRetention,
        tags: editTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setActionSuccess('Metadata updated.');
      await onRefresh();
      setTab('overview');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadVersion = async (e: FormEvent) => {
    e.preventDefault();
    if (!versionFile) {
      setActionError('Select a new file to upload as a revision.');
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const fileBase64 = await fileToBase64(versionFile);
      const res = await uploadDocumentVersion(doc.id, {
        versionBump,
        fileName: versionFile.name,
        mimeType: versionFile.type || 'application/octet-stream',
        fileBase64,
        changeNotes: versionNotes.trim() || 'Updated document revision',
      });
      setActionSuccess(`Uploaded version v${res.versionNumber}.`);
      setVersionFile(null);
      setVersionNotes('');
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Version upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateShare = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await shareDocument(doc.id, {
        targetUserId: shareTargetType === 'user' ? Number(shareUserId) : null,
        targetDepartmentId: shareTargetType === 'department' ? Number(shareDeptId) : null,
        targetRoleSlug: shareTargetType === 'role' ? shareRoleSlug : null,
        permission: sharePerm,
        expiresAt: shareExpiry || null,
      });
      setActionSuccess('Access share granted.');
      setShareExpiry('');
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to share document.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await addComment(doc.id, commentBody.trim());
      setCommentBody('');
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to post comment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-[1px] no-print">
      <div className="w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-llcc-navy text-white px-6 py-4 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-semibold text-llcc-gold tabular-nums">
                {doc.docCode}
              </span>
              <span className="text-slate-300">·</span>
              <span className="tabular-nums text-slate-200">v{doc.currentVersion}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-200">{doc.departmentCode}</span>
            </div>
            <h2 className="font-display text-lg font-bold text-white mt-1 line-clamp-2">
              {doc.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sub-nav Tabs */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 flex items-center gap-1 overflow-x-auto shrink-0">
          {[
            { id: 'overview', label: 'Preview & Overview', icon: Eye },
            ...(canModify ? [{ id: 'edit', label: 'Edit Details', icon: Edit3 }] : []),
            { id: 'versions', label: `Versions (${doc.versions.length})`, icon: History },
            ...(canModify
              ? [{ id: 'share', label: `Sharing (${doc.shares.filter((s) => !s.revokedAt).length})`, icon: Share2 }]
              : []),
            { id: 'activity', label: `Approvals & Comments (${doc.comments.length})`, icon: MessageSquare },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as InspectorTab)}
                className={`inline-flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-llcc-navy text-llcc-navy'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {actionError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
              {actionError}
            </div>
          )}
          {actionSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
              {actionSuccess}
            </div>
          )}

          {/* Workflow Action Bar */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <StatusText status={doc.status} />
                <span className="text-xs text-slate-500">·</span>
                <span className="text-xs text-slate-600">{doc.confidentiality}</span>
                <span className="text-xs text-slate-500">·</span>
                <span className="text-xs text-slate-600 tabular-nums">
                  {formatBytes(doc.fileSizeBytes)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => void downloadDocumentFile(doc)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-llcc-royal px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-llcc-navy transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download {getFileExtension(doc.fileName)}
              </button>
            </div>

            {doc.status === 'Rejected' && doc.rejectionReason && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                <span className="font-semibold">Rejection Reason:</span> {doc.rejectionReason}
              </div>
            )}

            {/* Role-gated Workflow Controls */}
            {canModify && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {(doc.status === 'Draft' || doc.status === 'Rejected') && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runWorkflow('submit')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-llcc-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-llcc-royal disabled:opacity-60"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Submit for Approval
                  </button>
                )}

                {isAdmin && doc.status === 'Pending' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runWorkflow('start_review')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-llcc-royal bg-white px-3 py-1.5 text-xs font-semibold text-llcc-royal hover:bg-blue-50"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Mark Under Review
                  </button>
                )}

                {isAdmin && (doc.status === 'Pending' || doc.status === 'Under Review') && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runWorkflow('approve')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRejectOpen((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </>
                )}

                {isAdmin && doc.status !== 'Archived' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runWorkflow('archive')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </button>
                )}

                {isAdmin && doc.status === 'Archived' && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runWorkflow('restore')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-llcc-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-llcc-royal"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore Record
                    </button>
                    {confirmPurge ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await deleteDocumentPermanently(doc.id);
                            await onRefresh();
                            onClose();
                          } catch (err) {
                            setActionError(
                              err instanceof Error ? err.message : 'Permanent delete failed.'
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                      >
                        Confirm Permanent Delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmPurge(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete Permanently
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {rejectOpen && (
              <div className="rounded-lg border border-red-200 bg-white p-3 space-y-2">
                <label className="block text-xs font-semibold text-red-800">
                  Rejection Reason (Required)
                </label>
                <textarea
                  rows={2}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Specify required corrections or compliance issues..."
                  className="w-full rounded-md border border-slate-200 p-2 text-xs focus:border-red-400 focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRejectOpen(false)}
                    className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy || !rejectReason.trim()}
                    onClick={() => void runWorkflow('reject', rejectReason.trim())}
                    className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Confirm Rejection
                  </button>
                </div>
              </div>
            )}
          </div>

          {tab === 'overview' && (
            <div className="space-y-5">
              {/* Inline File Preview */}
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 truncate">{doc.fileName}</span>
                  <span className="text-slate-500 tabular-nums">
                    {doc.viewCount} views · {doc.downloadCount} downloads
                  </span>
                </div>

                {isPdf ? (
                  <iframe
                    src={getDocumentInlineUrl(doc.id)}
                    title={doc.title}
                    className="w-full h-96 bg-white"
                  />
                ) : isImage ? (
                  <div className="p-4 flex justify-center bg-slate-100">
                    <img
                      src={getDocumentInlineUrl(doc.id)}
                      alt={doc.title}
                      className="max-h-96 object-contain rounded-lg shadow-xs"
                    />
                  </div>
                ) : csvRows ? (
                  <div className="max-h-80 overflow-auto bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <tbody>
                        {csvRows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className={
                              rIdx === 0
                                ? 'bg-slate-100 font-semibold text-llcc-navy'
                                : 'border-t border-slate-100'
                            }
                          >
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="px-3 py-2 border-r border-slate-100">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : textPreview !== null ? (
                  <pre className="max-h-96 overflow-auto p-4 text-xs font-mono text-slate-800 bg-white whitespace-pre-wrap">
                    {textPreview}
                  </pre>
                ) : (
                  <div className="p-8 text-center space-y-2 bg-white">
                    <FileText className="h-8 w-8 mx-auto text-slate-400" />
                    <p className="text-xs font-medium text-slate-600">
                      {previewError ||
                        `Inline preview is not available for .${ext.toUpperCase()} files.`}
                    </p>
                    <button
                      type="button"
                      onClick={() => void downloadDocumentFile(doc)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-llcc-navy hover:bg-slate-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download to View
                    </button>
                  </div>
                )}
              </div>

              {/* Metadata Grid */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <h3 className="font-display text-sm font-bold text-llcc-navy">
                  Document Classification &amp; Retention
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {doc.description || 'No description provided.'}
                </p>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                  <div>
                    <dt className="text-slate-400 font-medium">Category</dt>
                    <dd className="font-semibold text-slate-800 mt-0.5">{doc.categoryName}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400 font-medium">Department</dt>
                    <dd className="font-semibold text-slate-800 mt-0.5">
                      {doc.departmentCode} — {doc.departmentName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400 font-medium">Document Type &amp; Academic Year</dt>
                    <dd className="font-semibold text-slate-800 mt-0.5">
                      {doc.documentType} · {doc.academicYear}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400 font-medium">Uploaded By</dt>
                    <dd className="font-semibold text-slate-800 mt-0.5">
                      {doc.uploadedByName} · {formatDate(doc.createdAt)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2 rounded-lg bg-slate-50 border border-slate-200/80 p-3">
                    <dt className="text-slate-500 font-medium flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-llcc-royal" />
                      Retention Schedule ({retention.policy})
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums">
                      {retention.state === 'permanent' ? (
                        <span className="text-llcc-navy">Permanent Institutional Preservation</span>
                      ) : retention.state === 'expired' ? (
                        <span className="inline-flex items-center gap-1 text-red-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Expired on {formatDate(retention.expiresAt!)} ({Math.abs(retention.daysRemaining || 0)}d overdue)
                        </span>
                      ) : retention.state === 'expiring_soon' ? (
                        <span className="inline-flex items-center gap-1 text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Expires {formatDate(retention.expiresAt!)} ({retention.daysRemaining} days remaining)
                        </span>
                      ) : (
                        <span className="text-slate-800">
                          Expires {formatDate(retention.expiresAt!)} ({retention.daysRemaining} days remaining)
                        </span>
                      )}
                    </dd>
                  </div>
                  {doc.tags.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-slate-400 font-medium">Keywords</dt>
                      <dd className="mt-0.5 text-slate-700">{doc.tags.join(' · ')}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          )}

          {tab === 'edit' && canModify && (
            <form onSubmit={handleSaveMetadata} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={editCatId}
                    onChange={(e) => setEditCatId(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department
                  </label>
                  <select
                    value={editDeptId}
                    onChange={(e) => setEditDeptId(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Document Type
                  </label>
                  <input
                    type="text"
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Academic Year
                  </label>
                  <input
                    type="text"
                    value={editYear}
                    onChange={(e) => setEditYear(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confidentiality
                  </label>
                  <select
                    value={editConf}
                    onChange={(e) => setEditConf(e.target.value as ConfidentialityLevel)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  >
                    <option value="Internal">Internal</option>
                    <option value="Restricted">Restricted</option>
                    <option value="Confidential">Confidential</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Retention Policy
                  </label>
                  <select
                    value={editRetention}
                    onChange={(e) => setEditRetention(e.target.value as RetentionPolicy)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  >
                    <option value="3 Years">3 Years</option>
                    <option value="5 Years">5 Years</option>
                    <option value="7 Years">7 Years</option>
                    <option value="Permanent">Permanent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-llcc-navy px-4 py-2 text-xs font-semibold text-white hover:bg-llcc-royal disabled:opacity-60"
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {tab === 'versions' && (
            <div className="space-y-5">
              {canModify && (
                <form
                  onSubmit={handleUploadVersion}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3"
                >
                  <h4 className="font-display text-xs font-bold uppercase tracking-wider text-llcc-navy">
                    Upload New Version
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Revision Increment
                      </label>
                      <select
                        value={versionBump}
                        onChange={(e) => setVersionBump(e.target.value as 'minor' | 'major')}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                      >
                        <option value="minor">Minor Revision (+0.1)</option>
                        <option value="major">Major Revision (+1.0)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Select Replacement File
                      </label>
                      <input
                        type="file"
                        onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                        className="w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-llcc-navy file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={versionNotes}
                    onChange={(e) => setVersionNotes(e.target.value)}
                    placeholder="Change notes (e.g. Updated signatory section)"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={busy || !versionFile}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-llcc-navy px-3.5 py-2 text-xs font-semibold text-white hover:bg-llcc-royal disabled:opacity-50"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Commit Version
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2.5">
                {doc.versions.map((ver) => (
                  <div
                    key={ver.id}
                    className="rounded-xl border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-llcc-navy tabular-nums">
                          v{ver.versionNumber}
                        </span>
                        <span className="font-semibold text-slate-800 truncate">{ver.fileName}</span>
                        <span className="text-slate-400 tabular-nums">
                          ({formatBytes(ver.sizeBytes)})
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{ver.changeNotes}</p>
                      <p className="text-[11px] text-slate-400 font-mono truncate">
                        SHA-256: {ver.checksum} · {ver.uploadedByName} · {formatDateTime(ver.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void downloadDocumentFile(doc, ver.versionNumber, ver.fileName)
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'share' && canModify && (
            <div className="space-y-5">
              <form
                onSubmit={handleCreateShare}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3"
              >
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-llcc-navy">
                  Share Document Access
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Share With
                    </label>
                    <select
                      value={shareTargetType}
                      onChange={(e) =>
                        setShareTargetType(e.target.value as 'user' | 'department' | 'role')
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                    >
                      <option value="user">Specific User</option>
                      <option value="department">Department</option>
                      <option value="role">Role Group</option>
                    </select>
                  </div>

                  {shareTargetType === 'user' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Select User
                      </label>
                      <select
                        value={shareUserId}
                        onChange={(e) => setShareUserId(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                      >
                        {users.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.fullName} ({u.roleName})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {shareTargetType === 'department' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Select Department
                      </label>
                      <select
                        value={shareDeptId}
                        onChange={(e) => setShareDeptId(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                      >
                        {departments.map((d) => (
                          <option key={d.id} value={String(d.id)}>
                            {d.code} — {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {shareTargetType === 'role' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Select Role
                      </label>
                      <select
                        value={shareRoleSlug}
                        onChange={(e) => setShareRoleSlug(e.target.value as RoleSlug)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                      >
                        <option value="student">STUDENT</option>
                        <option value="faculty_staff">FACULTY / STAFF</option>
                        <option value="admin">ADMIN</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Permission Level
                    </label>
                    <select
                      value={sharePerm}
                      onChange={(e) => setSharePerm(e.target.value as SharePermission)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                    >
                      <option value="view">View Only</option>
                      <option value="download">View &amp; Download</option>
                      <option value="edit">View, Download &amp; Edit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Expiration Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={shareExpiry}
                      onChange={(e) => setShareExpiry(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-llcc-navy px-3.5 py-2 text-xs font-semibold text-white hover:bg-llcc-royal"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Grant Share Access
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-700">Active &amp; Past Shares</h4>
                {doc.shares.length === 0 ? (
                  <p className="text-xs text-slate-500">This document has not been shared yet.</p>
                ) : (
                  doc.shares.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-lg border border-slate-200 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-800">
                          {s.targetUserName ||
                            s.targetDepartmentName ||
                            (s.targetRoleSlug ? `Role: ${s.targetRoleSlug.toUpperCase()}` : 'Shared')}
                        </div>
                        <div className="text-slate-500 mt-0.5 tabular-nums">
                          Permission: <span className="font-medium uppercase">{s.permission}</span> ·
                          By {s.sharedByName}
                          {s.expiresAt ? ` · Expires ${formatDate(s.expiresAt)}` : ''}
                          {s.revokedAt ? ` · Revoked ${formatDate(s.revokedAt)}` : ''}
                        </div>
                      </div>
                      {!s.revokedAt && (
                        <button
                          type="button"
                          onClick={async () => {
                            await revokeShare(s.id);
                            await onRefresh();
                          }}
                          className="text-xs font-semibold text-red-600 hover:text-red-800"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'activity' && (
            <div className="space-y-5">
              {/* Approval History */}
              <div className="space-y-2.5">
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-llcc-navy">
                  Approval &amp; Workflow History
                </h4>
                {doc.approvals.length === 0 ? (
                  <p className="text-xs text-slate-500">No workflow reviews recorded yet.</p>
                ) : (
                  doc.approvals.map((ap) => (
                    <div
                      key={ap.id}
                      className="rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-llcc-navy">
                          {ap.decision} ({ap.fromStatus} → {ap.toStatus})
                        </span>
                        <span className="text-slate-400 tabular-nums">
                          {formatDateTime(ap.createdAt)}
                        </span>
                      </div>
                      <div className="text-slate-600">Reviewer: {ap.reviewerName}</div>
                      {ap.reason && <div className="text-slate-700">Note: {ap.reason}</div>}
                    </div>
                  ))
                )}
              </div>

              {/* Comments Thread */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-llcc-navy">
                  Document Notes &amp; Comments
                </h4>
                <form onSubmit={handleAddComment} className="flex gap-2">
                  <input
                    type="text"
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Add review note or institutional remark..."
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-llcc-royal focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy || !commentBody.trim()}
                    className="rounded-lg bg-llcc-navy px-3.5 py-2 text-xs font-semibold text-white hover:bg-llcc-royal disabled:opacity-50"
                  >
                    Post
                  </button>
                </form>

                <div className="space-y-2">
                  {doc.comments.length === 0 ? (
                    <p className="text-xs text-slate-500">No comments on this document yet.</p>
                  ) : (
                    doc.comments.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg bg-slate-50 border border-slate-200/80 px-3.5 py-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-llcc-navy">
                            {c.authorName}{' '}
                            <span className="font-normal text-slate-500">· {c.authorRole}</span>
                          </span>
                          <span className="text-slate-400 tabular-nums">
                            {formatDateTime(c.createdAt)}
                          </span>
                        </div>
                        <p className="text-slate-700 mt-1">{c.body}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
