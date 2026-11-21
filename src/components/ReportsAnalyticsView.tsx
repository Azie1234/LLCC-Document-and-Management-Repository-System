import { useMemo } from 'react';
import { BarChart3, Download, FileSpreadsheet, FileText, HardDrive, Users } from 'lucide-react';
import type { Department, DocumentCategory, DocumentRecord, UserAccount } from '../types.ts';
import {
  exportAnalyticsReportExcel,
  exportAnalyticsReportPdf,
  formatBytes,
} from '../utils/format.ts';

interface ReportsAnalyticsViewProps {
  documents: DocumentRecord[];
  departments: Department[];
  categories: DocumentCategory[];
  users: UserAccount[];
}

export function ReportsAnalyticsView({
  documents,
  departments,
  categories,
  users,
}: ReportsAnalyticsViewProps) {
  const summary = useMemo(() => {
    const totalBytes = documents.reduce((s, d) => s + d.fileSizeBytes, 0);
    const totalDownloads = documents.reduce((s, d) => s + d.downloadCount, 0);
    const totalViews = documents.reduce((s, d) => s + d.viewCount, 0);
    const approved = documents.filter((d) => d.status === 'Approved').length;
    const activeUsers = users.filter((u) => u.isActive).length;
    return { totalBytes, totalDownloads, totalViews, approved, activeUsers };
  }, [documents, users]);

  const deptBreakdown = useMemo(() => {
    return departments.map((dept) => {
      const deptDocs = documents.filter((d) => d.departmentId === dept.id);
      const storage = deptDocs.reduce((s, d) => s + d.fileSizeBytes, 0);
      const downloads = deptDocs.reduce((s, d) => s + d.downloadCount, 0);
      const views = deptDocs.reduce((s, d) => s + d.viewCount, 0);
      return { dept, count: deptDocs.length, storage, downloads, views };
    });
  }, [departments, documents]);

  const maxDeptCount = Math.max(1, ...deptBreakdown.map((d) => d.count));

  const categoryBreakdown = useMemo(() => {
    return categories
      .map((cat) => ({
        cat,
        count: documents.filter((d) => d.categoryId === cat.id).length,
      }))
      .sort((a, b) => b.count - a.count);
  }, [categories, documents]);

  const topAccessed = useMemo(
    () =>
      [...documents]
        .sort((a, b) => b.viewCount + b.downloadCount - (a.viewCount + a.downloadCount))
        .slice(0, 6),
    [documents]
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-llcc-navy">Reports and Analytics</h2>
          <p className="text-xs text-slate-500">
            Institutional storage metrics, departmental activity, approval yields, and compliance
            exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportAnalyticsReportPdf(documents, departments, categories, users)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-llcc-navy px-3.5 py-2 text-xs font-semibold text-white hover:bg-llcc-royal"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF Report
          </button>
          <button
            type="button"
            onClick={() => exportAnalyticsReportExcel(documents, departments, categories, users)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-llcc-navy hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            Export Excel (.csv)
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-white border border-slate-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Documents</span>
            <FileText className="h-4 w-4 text-llcc-royal" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-llcc-navy tabular-nums">
            {documents.length}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {summary.approved} approved records
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Storage Usage</span>
            <HardDrive className="h-4 w-4 text-llcc-royal" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-llcc-navy tabular-nums">
            {formatBytes(summary.totalBytes)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Across all versions</div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Views &amp; Downloads</span>
            <BarChart3 className="h-4 w-4 text-llcc-royal" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-llcc-navy tabular-nums">
            {summary.totalViews + summary.totalDownloads}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {summary.totalViews} views · {summary.totalDownloads} downloads
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Active Repository Users</span>
            <Users className="h-4 w-4 text-llcc-royal" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-llcc-navy tabular-nums">
            {summary.activeUsers}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            Out of {users.length} registered accounts
          </div>
        </div>
      </div>

      {/* Department & Category Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs space-y-4">
          <h3 className="font-display text-sm font-bold text-llcc-navy">
            Documents &amp; Storage by Department
          </h3>
          <div className="space-y-3">
            {deptBreakdown.map((item) => (
              <div key={item.dept.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    <span className="font-mono font-bold text-llcc-royal">{item.dept.code}</span> —{' '}
                    {item.dept.name}
                  </span>
                  <span className="text-slate-600 tabular-nums">
                    {item.count} docs · {formatBytes(item.storage)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-sm bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-llcc-navy rounded-sm"
                    style={{
                      width: `${Math.max(item.count > 0 ? 8 : 0, (item.count / maxDeptCount) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs space-y-3">
          <h3 className="font-display text-sm font-bold text-llcc-navy">
            Most Accessed Documents
          </h3>
          <div className="divide-y divide-slate-100 text-xs">
            {topAccessed.map((doc) => (
              <div key={doc.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] font-semibold text-llcc-royal">
                    {doc.docCode}
                  </div>
                  <div className="font-semibold text-slate-800 truncate">{doc.title}</div>
                </div>
                <div className="text-right shrink-0 tabular-nums text-slate-600">
                  <div className="font-semibold text-llcc-navy">{doc.viewCount} views</div>
                  <div className="text-[11px] text-slate-500">{doc.downloadCount} downloads</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category Table */}
      <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-display text-sm font-bold text-llcc-navy">
            Category Distribution Summary
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-100">
          {categoryBreakdown.map(({ cat, count }) => (
            <div key={cat.id} className="bg-white px-4 py-3 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 truncate pr-2">{cat.name}</span>
              <span className="font-mono font-bold text-llcc-navy tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
