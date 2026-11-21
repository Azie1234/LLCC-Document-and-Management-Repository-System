import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  FolderOpen,
  HardDrive,
  Search,
  Upload,
} from 'lucide-react';
import { transitionWorkflow } from '../api.ts';
import type {
  ActivityLogEntry,
  Department,
  DocumentCategory,
  DocumentRecord,
  UserAccount,
} from '../types.ts';
import {
  formatBytes,
  formatDate,
  formatDateTime,
  isNearingRetentionExpiration,
} from '../utils/format.ts';
import type { NavSection } from './Sidebar.tsx';
import { StatusText } from './StatusText.tsx';

interface DashboardViewProps {
  currentUser: UserAccount;
  collegeName: string;
  academicYear: string;
  documents: DocumentRecord[];
  categories: DocumentCategory[];
  departments: Department[];
  activityLogs: ActivityLogEntry[];
  onNavigate: (section: NavSection) => void;
  onOpenDepartmentInRepo: (departmentId: number | 'all', initialSearch?: string) => void;
  onOpenApprovals: (departmentId?: number | 'all') => void;
  onOpenExpiringFilter: () => void;
  onInspectDocument: (doc: DocumentRecord) => void;
  onDownloadDocument: (doc: DocumentRecord) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function DashboardView({
  currentUser,
  collegeName,
  academicYear,
  documents,
  categories,
  departments,
  activityLogs,
  onNavigate,
  onOpenDepartmentInRepo,
  onOpenApprovals,
  onOpenExpiringFilter,
  onInspectDocument,
  onDownloadDocument,
  onRefresh,
}: DashboardViewProps) {
  const isSuperAdmin = currentUser.roleSlug === 'super_admin';
  const isDean = currentUser.roleSlug === 'dean';
  const isDeptHead = currentUser.roleSlug === 'department_head';
  const isStaff = currentUser.roleSlug === 'staff';

  const canUpload = isSuperAdmin || isDeptHead || isStaff;
  const canViewGovernance = isSuperAdmin || isDean || isDeptHead;

  const [deanSearch, setDeanSearch] = useState('');
  const [deanDeptFilter, setDeanDeptFilter] = useState<string>('all');
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [dashError, setDashError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = documents.length;
    const approved = documents.filter((d) => d.status === 'Approved').length;
    const pending = documents.filter(
      (d) => d.status === 'Pending' || d.status === 'Under Review'
    ).length;
    const archived = documents.filter((d) => d.status === 'Archived').length;
    const totalBytes = documents.reduce((sum, d) => sum + d.fileSizeBytes, 0);
    const expiringSoon = documents.filter((d) => isNearingRetentionExpiration(d)).length;
    return { total, approved, pending, archived, totalBytes, expiringSoon };
  }, [documents]);

  const departmentSummaries = useMemo(() => {
    return departments.map((dept) => {
      const deptDocs = documents.filter((d) => d.departmentId === dept.id);
      const approved = deptDocs.filter((d) => d.status === 'Approved').length;
      const pending = deptDocs.filter(
        (d) => d.status === 'Pending' || d.status === 'Under Review'
      ).length;
      const archived = deptDocs.filter((d) => d.status === 'Archived').length;
      const storageBytes = deptDocs.reduce((s, d) => s + d.fileSizeBytes, 0);
      return {
        dept,
        total: deptDocs.length,
        approved,
        pending,
        archived,
        storageBytes,
      };
    });
  }, [departments, documents]);

  const activeDepartment = useMemo(() => {
    if (!currentUser.departmentId) return null;
    return departments.find((d) => d.id === currentUser.departmentId) || null;
  }, [departments, currentUser.departmentId]);

  const deanFilteredDocs = useMemo(() => {
    if (!isDean) return [];
    const q = deanSearch.trim().toLowerCase();
    return documents
      .filter((doc) => {
        if (deanDeptFilter !== 'all' && String(doc.departmentId) !== deanDeptFilter) return false;
        if (!q) return true;
        return [
          doc.title,
          doc.docCode,
          doc.categoryName,
          doc.departmentCode,
          doc.departmentName,
          doc.uploadedByName,
          ...doc.tags,
        ]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 6);
  }, [isDean, documents, deanSearch, deanDeptFilter]);

  const deanPendingQueue = useMemo(() => {
    return documents
      .filter((d) => d.status === 'Pending' || d.status === 'Under Review')
      .filter((d) => deanDeptFilter === 'all' || String(d.departmentId) === deanDeptFilter)
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
      .slice(0, 6);
  }, [documents, deanDeptFilter]);

  const categoryChartData = useMemo(() => {
    const counts = categories.map((cat) => ({
      name: cat.departmentCode ? `${cat.name} (${cat.departmentCode})` : cat.name,
      count: documents.filter((d) => d.categoryId === cat.id).length,
    }));
    const nonZero = counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
    return (nonZero.length > 0 ? nonZero : counts).slice(0, 7);
  }, [categories, documents]);

  const maxCategoryCount = Math.max(1, ...categoryChartData.map((c) => c.count));

  const monthlyUploadData = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      buckets.push({ key, label, count: 0 });
    }
    for (const doc of documents) {
      const dt = new Date(doc.createdAt);
      if (Number.isNaN(dt.getTime())) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.find((b) => b.key === key);
      if (bucket) bucket.count += 1;
    }
    return buckets;
  }, [documents]);

  const maxMonthlyCount = Math.max(1, ...monthlyUploadData.map((m) => m.count));

  const approvalStats = useMemo(() => {
    const approved = documents.filter((d) => d.status === 'Approved').length;
    const pending = documents.filter(
      (d) => d.status === 'Pending' || d.status === 'Under Review'
    ).length;
    const rejected = documents.filter((d) => d.status === 'Rejected').length;
    const draft = documents.filter((d) => d.status === 'Draft').length;
    const archived = documents.filter((d) => d.status === 'Archived').length;
    const total = Math.max(1, documents.length);
    return [
      { label: 'Approved', count: approved, color: '#059669', pct: Math.round((approved / total) * 100) },
      { label: 'Pending / Review', count: pending, color: '#D5AA42', pct: Math.round((pending / total) * 100) },
      { label: 'Rejected', count: rejected, color: '#DC2626', pct: Math.round((rejected / total) * 100) },
      { label: 'Draft', count: draft, color: '#64748B', pct: Math.round((draft / total) * 100) },
      { label: 'Archived', count: archived, color: '#102D50', pct: Math.round((archived / total) * 100) },
    ];
  }, [documents]);

  const recentlyUploaded = useMemo(
    () =>
      [...documents]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [documents]
  );

  const recentlyAccessed = useMemo(
    () =>
      [...documents]
        .filter((d) => d.lastAccessedAt || d.viewCount > 0 || d.downloadCount > 0)
        .sort((a, b) => {
          const ta = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : new Date(a.updatedAt).getTime();
          const tb = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : new Date(b.updatedAt).getTime();
          return tb - ta;
        })
        .slice(0, 5),
    [documents]
  );

  const timeline = useMemo(() => activityLogs.slice(0, 7), [activityLogs]);

  const handleQuickApprove = async (doc: DocumentRecord) => {
    setApprovingId(doc.id);
    setDashError(null);
    try {
      await transitionWorkflow(doc.id, 'approve');
      await onRefresh();
    } catch (err) {
      setDashError(err instanceof Error ? err.message : 'Unable to approve document.');
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Role-Specific Welcome Banner */}
      <section className="rounded-2xl glass-navy text-white p-6 sm:p-7 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-llcc-gold">
              {collegeName} · {academicYear}
              {isDean
                ? ' · Centralized Academic Dean Oversight'
                : activeDepartment
                  ? ` · ${activeDepartment.code} Department Dashboard`
                  : ''}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back, {currentUser.fullName}
            </h2>
            <p className="text-sm text-slate-200 max-w-2xl">
              {isDean ? (
                <>
                  Signed in as <span className="font-semibold text-white">ACADEMIC DEAN</span>.
                  Centralized viewer and approver across{' '}
                  <span className="font-semibold text-llcc-gold">COT, HTM, and EDUC</span>{' '}
                  repositories without altering departmental ownership.
                </>
              ) : (isDeptHead || isStaff) && activeDepartment ? (
                <>
                  Signed in as <span className="font-semibold text-white">{currentUser.roleName}</span>{' '}
                  for <span className="font-semibold text-llcc-gold">{activeDepartment.code} — {activeDepartment.name}</span>.
                  {isDeptHead
                    ? ' Full departmental management, approvals, and category controls enabled.'
                    : ' Scoped departmental upload, versioning, and record tracking.'}
                </>
              ) : (
                <>
                  Signed in as <span className="font-semibold text-white">{currentUser.roleName}</span>
                  {currentUser.departmentName ? ` · ${currentUser.departmentName}` : ''}. Monitor
                  repository metrics, retention timelines, and departmental records below.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {canUpload && (
              <button
                type="button"
                onClick={() => onNavigate('upload')}
                className="inline-flex items-center gap-2 rounded-lg bg-llcc-gold px-4 py-2.5 text-sm font-semibold text-llcc-navy hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="h-4 w-4" />
                Upload Document
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenDepartmentInRepo('all')}
              className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/25 transition-colors whitespace-nowrap shrink-0"
            >
              <FolderOpen className="h-4 w-4" />
              Browse Repository
            </button>
            {isDean && (
              <button
                type="button"
                onClick={() => onOpenApprovals('all')}
                className="inline-flex items-center gap-2 rounded-lg bg-llcc-gold px-4 py-2.5 text-sm font-semibold text-llcc-navy hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0"
              >
                <CheckCircle2 className="h-4 w-4" />
                Review Queue ({stats.pending})
              </button>
            )}
            {canUpload && (
              <button
                type="button"
                onClick={() => onNavigate('my-documents')}
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition-colors whitespace-nowrap shrink-0"
              >
                <FileText className="h-4 w-4" />
                My Documents
              </button>
            )}
            {canViewGovernance && (
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition-colors whitespace-nowrap shrink-0"
              >
                <BarChart3 className="h-4 w-4" />
                View Reports
              </button>
            )}
          </div>
        </div>
      </section>

      {dashError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          {dashError}
        </div>
      )}

      {/* Three Departmental Repository Cards (Dean & Super Admin) */}
      {(isDean || isSuperAdmin) && departmentSummaries.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-bold text-llcc-navy">
                Departmental Repositories (COT · HTM · EDUC)
              </h3>
              <p className="text-xs text-slate-500">
                Select any college repository to browse records, inspect files, or review pending submissions.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {departmentSummaries.map(({ dept, total, approved, pending, storageBytes }) => (
              <div
                key={dept.id}
                className="rounded-xl glass-panel p-5 flex flex-col justify-between gap-4 hover:border-llcc-royal/45 transition-all"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-llcc-navy text-llcc-gold flex items-center justify-center font-display text-xs font-bold shrink-0">
                        {dept.code}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-display text-sm font-bold text-llcc-navy truncate">
                          {dept.name}
                        </h4>
                        <p className="text-[11px] text-slate-500 truncate">
                          Head: {dept.head}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display text-2xl font-bold text-llcc-navy tabular-nums">
                        {total}
                      </div>
                      <div className="text-[11px] text-slate-500">total docs</div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2">{dept.description}</p>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs tabular-nums">
                    <div>
                      <div className="text-[11px] text-slate-400">Approved</div>
                      <div className="font-semibold text-emerald-700">{approved}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Pending</div>
                      <div className="font-semibold text-amber-700">{pending}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Storage</div>
                      <div className="font-semibold text-llcc-navy">{formatBytes(storageBytes)}</div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenDepartmentInRepo(dept.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-llcc-royal hover:text-llcc-navy"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Open {dept.code} Repository</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>

                  {pending > 0 && (
                    <button
                      type="button"
                      onClick={() => onOpenApprovals(dept.id)}
                      className="text-xs font-semibold text-amber-800 hover:text-amber-950 tabular-nums"
                    >
                      {pending} pending
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Combined / Scoped KPI Strip */}
      <section className="space-y-2">
        {isDean && (
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Combined Document Statistics (COT + HTM + EDUC)
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
          <div className="rounded-xl glass-panel p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Total Documents</span>
              <FileText className="h-4 w-4 text-llcc-royal" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold text-llcc-navy tabular-nums">
              {stats.total}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isDean ? 'Across all 3 colleges' : 'Accessible repository records'}
            </p>
          </div>

          <div className="rounded-xl glass-panel p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Approved Documents</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold text-emerald-700 tabular-nums">
              {stats.approved}
            </div>
            <p className="text-xs text-slate-500 mt-1">Verified &amp; published</p>
          </div>

          <div className="rounded-xl glass-panel p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Pending Documents</span>
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold text-amber-700 tabular-nums">
              {stats.pending}
            </div>
            <p className="text-xs text-slate-500 mt-1">Awaiting review/approval</p>
          </div>

          <div className="rounded-xl glass-panel p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Archived Documents</span>
              <Archive className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold text-slate-700 tabular-nums">
              {stats.archived}
            </div>
            <p className="text-xs text-slate-500 mt-1">Historical vault records</p>
          </div>

          <div className="rounded-xl glass-panel p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Total Storage Used</span>
              <HardDrive className="h-4 w-4 text-llcc-royal" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold text-llcc-navy tabular-nums">
              {formatBytes(stats.totalBytes)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Active &amp; version files</p>
          </div>

          <button
            type="button"
            onClick={onOpenExpiringFilter}
            className={`text-left rounded-xl p-4 backdrop-blur-lg border transition-all shadow-xs ${
              stats.expiringSoon > 0
                ? 'bg-amber-50/75 border-amber-300/80 hover:bg-amber-100/80'
                : 'glass-panel hover:border-llcc-royal/40'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
              <span>Records Expiring Soon</span>
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold text-amber-800 tabular-nums">
              {stats.expiringSoon}
            </div>
            <p className="text-xs text-amber-800/80 mt-1 inline-flex items-center gap-1">
              <span>Within 90d / overdue</span>
              <ArrowRight className="h-3 w-3" />
            </p>
          </button>
        </div>
      </section>

      {/* Dean Cross-Department Search & Pending Approvals Panel */}
      {isDean && (
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Cross-Department Search */}
          <div className="xl:col-span-6 rounded-xl glass-panel overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-bold text-llcc-navy">
                    Cross-Department Document Search
                  </h3>
                  <p className="text-xs text-slate-500">
                    Search records across COT, HTM, and EDUC repositories
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onOpenDepartmentInRepo(
                      deanDeptFilter === 'all' ? 'all' : Number(deanDeptFilter),
                      deanSearch.trim() || undefined
                    )
                  }
                  className="text-xs font-semibold text-llcc-royal hover:text-llcc-navy whitespace-nowrap"
                >
                  Open in Repository
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-7 relative">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={deanSearch}
                    onChange={(e) => setDeanSearch(e.target.value)}
                    placeholder="Search title, doc ID, author..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-1.5 text-xs focus:bg-white focus:border-llcc-royal focus:outline-none"
                  />
                </div>
                <select
                  value={deanDeptFilter}
                  onChange={(e) => setDeanDeptFilter(e.target.value)}
                  aria-label="Filter Dean Dashboard by department"
                  className="sm:col-span-5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-llcc-royal focus:outline-none"
                >
                  <option value="all">All Colleges (COT · HTM · EDUC)</option>
                  {departments.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="divide-y divide-slate-100 flex-1">
              {deanFilteredDocs.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-slate-500">
                  No documents match the current department filter and search query.
                </div>
              ) : (
                deanFilteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onInspectDocument(doc)}
                      className="min-w-0 text-left flex-1"
                    >
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono font-bold text-llcc-navy">{doc.departmentCode}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono font-semibold text-llcc-royal tabular-nums">
                          {doc.docCode}
                        </span>
                        <span className="text-slate-300">·</span>
                        <StatusText status={doc.status} />
                      </div>
                      <div className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                        {doc.title}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {doc.categoryName} · {doc.uploadedByName} · {formatDate(doc.createdAt)}
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title="View document"
                        onClick={() => onInspectDocument(doc)}
                        className="p-1.5 rounded-md text-slate-500 hover:text-llcc-navy hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Download document"
                        onClick={() => void onDownloadDocument(doc)}
                        className="p-1.5 rounded-md text-slate-500 hover:text-llcc-royal hover:bg-slate-100"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pending Approvals from All Departments */}
          <div className="xl:col-span-6 rounded-xl glass-panel overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold text-llcc-navy">
                  Pending Approvals Across All Departments
                </h3>
                <p className="text-xs text-slate-500">
                  Submissions from COT, HTM, and EDUC awaiting Dean or Department Head decision
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onOpenApprovals(deanDeptFilter === 'all' ? 'all' : Number(deanDeptFilter))
                }
                className="text-xs font-semibold text-llcc-royal hover:text-llcc-navy whitespace-nowrap"
              >
                Full Queue
              </button>
            </div>

            <div className="divide-y divide-slate-100 flex-1">
              {deanPendingQueue.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-slate-500">
                  No pending approvals for the selected scope.
                </div>
              ) : (
                deanPendingQueue.map((doc) => (
                  <div
                    key={doc.id}
                    className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/80"
                  >
                    <button
                      type="button"
                      onClick={() => onInspectDocument(doc)}
                      className="min-w-0 text-left flex-1"
                    >
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono font-bold text-llcc-navy">{doc.departmentCode}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono font-semibold text-llcc-royal tabular-nums">
                          {doc.docCode}
                        </span>
                        <span className="text-slate-300">·</span>
                        <StatusText status={doc.status} />
                      </div>
                      <div className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                        {doc.title}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Submitted by {doc.uploadedByName} · {formatDate(doc.createdAt)}
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onInspectDocument(doc)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3 w-3" />
                        Inspect
                      </button>
                      <button
                        type="button"
                        disabled={approvingId === doc.id}
                        onClick={() => void handleQuickApprove(doc)}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {approvingId === doc.id ? '...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {/* Visual Analytics Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart 1: Documents by Category */}
        <div className="rounded-xl glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-sm font-bold text-llcc-navy">
                Documents by Category
              </h3>
              <p className="text-xs text-slate-500">Distribution across top classifications</p>
            </div>
          </div>
          <div className="space-y-3">
            {categoryChartData.map((item) => {
              const pct = Math.round((item.count / maxCategoryCount) * 100);
              return (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 truncate pr-2">{item.name}</span>
                    <span className="font-semibold text-llcc-navy tabular-nums">{item.count}</span>
                  </div>
                  <div className="h-2 w-full rounded-sm bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-llcc-royal rounded-sm transition-all duration-300"
                      style={{ width: `${Math.max(item.count > 0 ? 8 : 0, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Documents Uploaded Monthly (SVG Bar Chart) */}
        <div className="rounded-xl glass-panel p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-display text-sm font-bold text-llcc-navy">
              Documents Uploaded Monthly
            </h3>
            <p className="text-xs text-slate-500">Rolling 6-month repository ingestion</p>
          </div>
          <div className="mt-4">
            <svg viewBox="0 0 320 160" className="w-full h-44" role="img" aria-label="Monthly uploads chart">
              <line x1="20" y1="130" x2="305" y2="130" stroke="#CBD5E1" strokeWidth="1" />
              {monthlyUploadData.map((bucket, idx) => {
                const barWidth = 28;
                const gap = 46;
                const x = 32 + idx * gap;
                const maxBarHeight = 96;
                const height = bucket.count > 0 ? Math.max(10, (bucket.count / maxMonthlyCount) * maxBarHeight) : 4;
                const y = 130 - height;
                return (
                  <g key={bucket.key}>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={height}
                      rx="4"
                      fill={bucket.count > 0 ? '#174A7E' : '#E2E8F0'}
                    />
                    <text
                      x={x + barWidth / 2}
                      y={y - 6}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      fill="#102D50"
                    >
                      {bucket.count}
                    </text>
                    <text
                      x={x + barWidth / 2}
                      y="148"
                      textAnchor="middle"
                      fontSize="10"
                      fill="#64748B"
                    >
                      {bucket.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Chart 3: Document Approval Statistics */}
        <div className="rounded-xl glass-panel p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-display text-sm font-bold text-llcc-navy">
              Document Approval Statistics
            </h3>
            <p className="text-xs text-slate-500">Workflow lifecycle composition</p>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex h-3 w-full overflow-hidden rounded-sm bg-slate-100">
              {approvalStats.map((seg) =>
                seg.count > 0 ? (
                  <div
                    key={seg.label}
                    style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
                    title={`${seg.label}: ${seg.count}`}
                  />
                ) : null
              )}
            </div>

            <div className="space-y-2 pt-1">
              {approvalStats.map((seg) => (
                <div key={seg.label} className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 text-slate-700">
                    <span
                      className="h-2.5 w-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span>{seg.label}</span>
                  </span>
                  <span className="font-semibold text-llcc-navy tabular-nums">
                    {seg.count} ({seg.pct}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Operational Panels */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Recently Uploaded */}
        <div className="rounded-xl glass-panel overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h3 className="font-display text-sm font-bold text-llcc-navy">
              Recently Uploaded Documents
            </h3>
            <button
              type="button"
              onClick={() => onOpenDepartmentInRepo('all')}
              className="text-xs font-semibold text-llcc-royal hover:text-llcc-navy"
            >
              View all
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentlyUploaded.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => onInspectDocument(doc)}
                className="w-full px-5 py-3 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-llcc-royal tabular-nums">
                    {doc.docCode}
                  </span>
                  <StatusText status={doc.status} />
                </div>
                <div className="text-sm font-semibold text-slate-900 truncate mt-1">
                  {doc.title}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  {doc.departmentCode} · {doc.uploadedByName} · {formatDate(doc.createdAt)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recently Accessed */}
        <div className="rounded-xl glass-panel overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h3 className="font-display text-sm font-bold text-llcc-navy">
              Recently Accessed Documents
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {recentlyAccessed.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                No document view or download history yet.
              </div>
            ) : (
              recentlyAccessed.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onInspectDocument(doc)}
                  className="w-full px-5 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold text-slate-600 tabular-nums">
                      {doc.docCode}
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {doc.viewCount} views · {doc.downloadCount} downloads
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 truncate mt-1">
                    {doc.title}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {doc.categoryName} · {doc.departmentCode}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Document Activity Timeline */}
        <div className="rounded-xl glass-panel overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h3 className="font-display text-sm font-bold text-llcc-navy">
              {isDean ? 'Recent Activity Across All Departments' : 'Document Activity Timeline'}
            </h3>
            {canViewGovernance && (
              <button
                type="button"
                onClick={() => onNavigate('activity-logs')}
                className="text-xs font-semibold text-llcc-royal hover:text-llcc-navy"
              >
                Full logs
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {timeline.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                Activity entries will appear as actions occur.
              </div>
            ) : (
              timeline.map((log) => (
                <div key={log.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-llcc-navy">{log.action}</span>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700 mt-0.5 truncate">
                    {log.actorName} — {log.targetTitle}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">{log.details}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
