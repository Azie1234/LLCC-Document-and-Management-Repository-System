import { useMemo } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  HardDrive,
  Upload,
} from 'lucide-react';
import type {
  ActivityLogEntry,
  Department,
  DocumentCategory,
  DocumentRecord,
  UserAccount,
} from '../types.ts';
import { formatBytes, formatDate, formatDateTime, isNearingRetentionExpiration } from '../utils/format.ts';
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
  onOpenExpiringFilter: () => void;
  onInspectDocument: (doc: DocumentRecord) => void;
}

export function DashboardView({
  currentUser,
  collegeName,
  academicYear,
  documents,
  categories,
  activityLogs,
  onNavigate,
  onOpenExpiringFilter,
  onInspectDocument,
}: DashboardViewProps) {
  const canUpload = currentUser.roleSlug !== 'student';
  const isAdmin = currentUser.roleSlug === 'super_admin' || currentUser.roleSlug === 'admin';

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

  const categoryChartData = useMemo(() => {
    const counts = categories.map((cat) => ({
      name: cat.name,
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

  return (
    <div className="space-y-6">
      {/* Welcome Header & Quick Actions */}
      <section className="rounded-2xl bg-gradient-to-r from-llcc-navy via-llcc-navy to-llcc-royal text-white p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-llcc-gold">
              {collegeName} · {academicYear}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back, {currentUser.fullName}
            </h2>
            <p className="text-sm text-slate-200 max-w-2xl">
              Signed in as <span className="font-semibold text-white">{currentUser.roleName}</span>
              {currentUser.departmentName ? ` · ${currentUser.departmentName}` : ''}. Monitor
              repository metrics, retention timelines, and departmental records below.
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
              onClick={() => onNavigate('repository')}
              className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/25 transition-colors whitespace-nowrap shrink-0"
            >
              <FolderOpen className="h-4 w-4" />
              Browse Repository
            </button>
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
            {isAdmin && (
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

      {/* Primary KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Documents</span>
            <FileText className="h-4 w-4 text-llcc-royal" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-llcc-navy tabular-nums">
            {stats.total}
          </div>
          <p className="text-xs text-slate-500 mt-1">All repository records</p>
        </div>

        <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Approved Documents</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-emerald-700 tabular-nums">
            {stats.approved}
          </div>
          <p className="text-xs text-slate-500 mt-1">Verified &amp; published</p>
        </div>

        <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Pending Documents</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-amber-700 tabular-nums">
            {stats.pending}
          </div>
          <p className="text-xs text-slate-500 mt-1">Awaiting review/approval</p>
        </div>

        <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Archived Documents</span>
            <Archive className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-slate-700 tabular-nums">
            {stats.archived}
          </div>
          <p className="text-xs text-slate-500 mt-1">Historical vault records</p>
        </div>

        <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-xs">
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
          className={`text-left rounded-xl p-4 border transition-all shadow-xs ${
            stats.expiringSoon > 0
              ? 'bg-amber-50/80 border-amber-300 hover:bg-amber-100/70'
              : 'bg-white border-slate-200/80 hover:border-llcc-royal/40'
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
      </section>

      {/* Visual Analytics Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart 1: Documents by Category */}
        <div className="rounded-xl bg-white p-5 border border-slate-200/80 shadow-xs">
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
        <div className="rounded-xl bg-white p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
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
        <div className="rounded-xl bg-white p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
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
        <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h3 className="font-display text-sm font-bold text-llcc-navy">
              Recently Uploaded Documents
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('repository')}
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
        <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
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
        <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h3 className="font-display text-sm font-bold text-llcc-navy">
              Document Activity Timeline
            </h3>
            {isAdmin && (
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
