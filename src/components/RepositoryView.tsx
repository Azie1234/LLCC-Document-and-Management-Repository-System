import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowUpDown,
  Download,
  Edit3,
  Eye,
  FileDown,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import type {
  Department,
  DocumentCategory,
  DocumentRecord,
  DocumentStatus,
  UserAccount,
} from '../types.ts';
import {
  exportDocumentsCsv,
  formatBytes,
  formatDate,
  getFileExtension,
  getRetentionInfo,
  isNearingRetentionExpiration,
} from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

type SortKey = 'newest' | 'oldest' | 'title' | 'size' | 'retention';

interface RepositoryViewProps {
  currentUser: UserAccount;
  documents: DocumentRecord[];
  categories: DocumentCategory[];
  departments: Department[];
  initialDepartmentId?: number | 'all';
  initialCategoryId?: number | 'all';
  initialSearchQuery?: string;
  onlyExpiring: boolean;
  onToggleOnlyExpiring: (next: boolean) => void;
  onInspectDocument: (doc: DocumentRecord, initialTab?: 'overview' | 'edit' | 'share') => void;
  onDownloadDocument: (doc: DocumentRecord) => Promise<void>;
  onArchiveDocument: (doc: DocumentRecord) => Promise<void>;
  onBulkArchive: (docIds: number[]) => Promise<void>;
  onDeleteDocument: (doc: DocumentRecord) => Promise<void>;
}

export function RepositoryView({
  currentUser,
  documents,
  categories,
  departments,
  initialDepartmentId = 'all',
  initialCategoryId = 'all',
  initialSearchQuery = '',
  onlyExpiring,
  onToggleOnlyExpiring,
  onInspectDocument,
  onDownloadDocument,
  onArchiveDocument,
  onBulkArchive,
  onDeleteDocument,
}: RepositoryViewProps) {
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [categoryFilter, setCategoryFilter] = useState<string>(
    initialCategoryId === 'all' ? 'all' : String(initialCategoryId)
  );
  const [departmentFilter, setDepartmentFilter] = useState<string>(
    initialDepartmentId === 'all' ? 'all' : String(initialDepartmentId)
  );
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>(onlyExpiring ? 'retention' : 'newest');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const canArchiveOrDeleteDoc = (doc: DocumentRecord): boolean => {
    if (currentUser.roleSlug === 'super_admin') return true;
    if (currentUser.roleSlug === 'department_head') {
      return currentUser.departmentId !== null && doc.departmentId === currentUser.departmentId;
    }
    return false;
  };

  const canEditOrShareDoc = (doc: DocumentRecord): boolean => {
    if (currentUser.roleSlug === 'super_admin') return true;
    if (currentUser.roleSlug === 'department_head') {
      return currentUser.departmentId !== null && doc.departmentId === currentUser.departmentId;
    }
    if (currentUser.roleSlug === 'staff') {
      if (doc.uploadedById === currentUser.id) {
        return true;
      }
      const now = Date.now();
      return doc.shares.some(
        (s) =>
          !s.revokedAt &&
          (!s.expiresAt || new Date(s.expiresAt).getTime() >= now) &&
          s.permission === 'edit' &&
          (s.targetUserId === currentUser.id ||
            (currentUser.departmentId !== null && s.targetDepartmentId === currentUser.departmentId) ||
            s.targetRoleSlug === currentUser.roleSlug)
      );
    }
    return false;
  };

  const fileExtensions = useMemo(() => {
    const exts = new Set<string>();
    for (const d of documents) {
      exts.add(getFileExtension(d.fileName));
    }
    return Array.from(exts).sort();
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = documents.filter((doc) => {
      if (onlyExpiring && !isNearingRetentionExpiration(doc)) return false;
      if (categoryFilter !== 'all' && String(doc.categoryId) !== categoryFilter) return false;
      if (departmentFilter !== 'all' && String(doc.departmentId) !== departmentFilter) return false;
      if (fileTypeFilter !== 'all' && getFileExtension(doc.fileName) !== fileTypeFilter) return false;
      if (statusFilter !== 'all' && doc.status !== (statusFilter as DocumentStatus)) return false;

      if (dateFrom) {
        const created = doc.createdAt.slice(0, 10);
        if (created < dateFrom) return false;
      }
      if (dateTo) {
        const created = doc.createdAt.slice(0, 10);
        if (created > dateTo) return false;
      }

      if (q) {
        const hay = [
          doc.title,
          doc.docCode,
          doc.description,
          doc.categoryName,
          doc.departmentCode,
          doc.departmentName,
          doc.uploadedByName,
          ...doc.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    const activeSort: SortKey = onlyExpiring ? 'retention' : sortBy;

    return [...list].sort((a, b) => {
      if (activeSort === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (activeSort === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (activeSort === 'title') {
        return a.title.localeCompare(b.title);
      }
      if (activeSort === 'size') {
        return b.fileSizeBytes - a.fileSizeBytes;
      }
      const ra = getRetentionInfo(a);
      const rb = getRetentionInfo(b);
      const da = ra.daysRemaining ?? Number.MAX_SAFE_INTEGER;
      const db = rb.daysRemaining ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }, [
    documents,
    onlyExpiring,
    categoryFilter,
    departmentFilter,
    fileTypeFilter,
    statusFilter,
    dateFrom,
    dateTo,
    searchQuery,
    sortBy,
  ]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredDocuments.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDocuments.map((d) => d.id));
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setDepartmentFilter('all');
    setFileTypeFilter('all');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    onToggleOnlyExpiring(false);
    setSortBy('newest');
  };

  const selectedDocs = filteredDocuments.filter((d) => selectedIds.includes(d.id));
  const archivableSelectedDocs = selectedDocs.filter(
    (d) => canArchiveOrDeleteDoc(d) && d.status !== 'Archived'
  );

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="rounded-xl bg-white border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-llcc-navy">Document Repository</h2>
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-700 tabular-nums">{filteredDocuments.length}</span> of{' '}
              <span className="tabular-nums">{documents.length}</span> accessible documents
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onlyExpiring && (
              <button
                type="button"
                onClick={() => onToggleOnlyExpiring(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Show All Records
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                exportDocumentsCsv(selectedDocs.length > 0 ? selectedDocs : filteredDocuments)
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <FileDown className="h-3.5 w-3.5 text-llcc-royal" />
              Export CSV {selectedDocs.length > 0 ? `(${selectedDocs.length})` : ''}
            </button>

            {archivableSelectedDocs.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await onBulkArchive(archivableSelectedDocs.map((d) => d.id));
                  setSelectedIds([]);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-llcc-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-llcc-royal whitespace-nowrap shrink-0"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive Selected ({archivableSelectedDocs.length})
              </button>
            )}

            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                aria-label="Table view"
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                  viewMode === 'table'
                    ? 'bg-white text-llcc-navy shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                  viewMode === 'grid'
                    ? 'bg-white text-llcc-navy shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Grid
              </button>
            </div>
          </div>
        </div>

        {/* Search & Faceted Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
          <div className="sm:col-span-2 relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, document ID, keywords..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-llcc-royal focus:outline-none"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-llcc-royal focus:outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={String(cat.id)}>
                {cat.name}
              </option>
            ))}
          </select>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            aria-label="Filter by department"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-llcc-royal focus:outline-none"
          >
            <option value="all">All Departments</option>
            {departments.map((dept) => (
              <option key={dept.id} value={String(dept.id)}>
                {dept.code} — {dept.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-llcc-royal focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="Approved">Approved</option>
            <option value="Pending">Pending</option>
            <option value="Under Review">Under Review</option>
            <option value="Rejected">Rejected</option>
            <option value="Draft">Draft</option>
            <option value="Archived">Archived</option>
          </select>

          <select
            value={fileTypeFilter}
            onChange={(e) => setFileTypeFilter(e.target.value)}
            aria-label="Filter by file type"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-llcc-royal focus:outline-none"
          >
            <option value="all">All File Types</option>
            {fileExtensions.map((ext) => (
              <option key={ext} value={ext}>
                {ext}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>Date uploaded:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Date from"
              className="rounded-md border border-slate-200 px-2 py-1 text-xs"
            />
            <span>to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Date to"
              className="rounded-md border border-slate-200 px-2 py-1 text-xs"
            />
            <label className="inline-flex items-center gap-1.5 ml-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyExpiring}
                onChange={(e) => onToggleOnlyExpiring(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600"
              />
              <span className="font-medium text-amber-900">Expiring / Overdue Only</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                aria-label="Sort documents"
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                <option value="newest">Sort: Newest First</option>
                <option value="oldest">Sort: Oldest First</option>
                <option value="title">Sort: Title (A-Z)</option>
                <option value="size">Sort: Largest File</option>
                <option value="retention">Sort: Nearest Retention Expiry</option>
              </select>
            </div>
            {(searchQuery ||
              categoryFilter !== 'all' ||
              departmentFilter !== 'all' ||
              fileTypeFilter !== 'all' ||
              statusFilter !== 'all' ||
              dateFrom ||
              dateTo ||
              onlyExpiring) && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-semibold text-llcc-royal hover:text-llcc-navy px-2 py-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table or Grid Display */}
      {filteredDocuments.length === 0 ? (
        <div className="rounded-xl bg-white border border-slate-200/80 p-12 text-center">
          <p className="text-sm font-semibold text-slate-700">No matching documents found</p>
          <p className="text-xs text-slate-500 mt-1">
            Try clearing search filters or switching categories.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 pl-4 pr-2 w-8">
                    <input
                      type="checkbox"
                      checked={
                        filteredDocuments.length > 0 &&
                        selectedIds.length === filteredDocuments.length
                      }
                      onChange={toggleSelectAll}
                      aria-label="Select all visible documents"
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                  </th>
                  <th className="py-3 px-3">Document ID &amp; Title</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Department</th>
                  <th className="py-3 px-3">Uploaded By</th>
                  <th className="py-3 px-3">Dates</th>
                  <th className="py-3 px-3">File</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() => setSortBy('retention')}
                      className="inline-flex items-center gap-1 hover:text-llcc-navy"
                    >
                      <span>Retention</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-3 pr-4 pl-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredDocuments.map((doc) => {
                  const retention = getRetentionInfo(doc);
                  const activeExpiring =
                    doc.status !== 'Archived' && retention.state === 'expiring_soon';
                  const activeExpired = doc.status !== 'Archived' && retention.state === 'expired';
                  const rowBg = activeExpired
                    ? 'bg-red-50/70 hover:bg-red-50'
                    : activeExpiring
                      ? 'bg-amber-50/75 hover:bg-amber-50'
                      : 'hover:bg-slate-50/80';

                  return (
                    <tr key={doc.id} className={`transition-colors ${rowBg}`}>
                      <td className="py-3 pl-4 pr-2 align-top">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(doc.id)}
                          onChange={() => toggleSelect(doc.id)}
                          aria-label={`Select ${doc.title}`}
                          className="h-3.5 w-3.5 rounded border-slate-300 mt-1"
                        />
                      </td>
                      <td className="py-3 px-3 max-w-xs">
                        <button
                          type="button"
                          onClick={() => onInspectDocument(doc, 'overview')}
                          className="text-left group"
                        >
                          <div className="font-mono text-[11px] font-semibold text-llcc-royal tabular-nums">
                            {doc.docCode} · v{doc.currentVersion}
                          </div>
                          <div className="text-sm font-semibold text-slate-900 group-hover:text-llcc-royal line-clamp-1 mt-0.5">
                            {doc.title}
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                        {doc.categoryName}
                      </td>
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                        <span className="font-semibold text-llcc-navy">{doc.departmentCode}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                        {doc.uploadedByName}
                      </td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap tabular-nums">
                        <div>Up: {formatDate(doc.createdAt)}</div>
                        <div className="text-[11px] text-slate-400">
                          Mod: {formatDate(doc.updatedAt)}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap tabular-nums">
                        <span className="font-semibold">{getFileExtension(doc.fileName)}</span> ·{' '}
                        {formatBytes(doc.fileSizeBytes)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusText status={doc.status} />
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap tabular-nums">
                        {retention.state === 'permanent' ? (
                          <span className="text-slate-500">Permanent</span>
                        ) : activeExpired ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                            Expired · {formatDate(retention.expiresAt!)}
                          </span>
                        ) : activeExpiring ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            Expiring in {retention.daysRemaining}d · {formatDate(retention.expiresAt!)}
                          </span>
                        ) : (
                          <span className="text-slate-600">
                            {retention.policy} · {formatDate(retention.expiresAt!)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 pl-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            title="View document"
                            onClick={() => onInspectDocument(doc, 'overview')}
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
                          {canEditOrShareDoc(doc) && (
                            <>
                              <button
                                type="button"
                                title="Edit details"
                                onClick={() => onInspectDocument(doc, 'edit')}
                                className="p-1.5 rounded-md text-slate-500 hover:text-llcc-navy hover:bg-slate-100"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Share document"
                                onClick={() => onInspectDocument(doc, 'share')}
                                className="p-1.5 rounded-md text-slate-500 hover:text-llcc-royal hover:bg-slate-100"
                              >
                                <Share2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {canArchiveOrDeleteDoc(doc) && doc.status !== 'Archived' && (
                            <button
                              type="button"
                              title="Archive document"
                              onClick={() => void onArchiveDocument(doc)}
                              className="p-1.5 rounded-md text-slate-500 hover:text-amber-700 hover:bg-amber-50"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canArchiveOrDeleteDoc(doc) &&
                            (confirmDeleteId === doc.id ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  await onDeleteDocument(doc);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 rounded bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700"
                              >
                                Confirm
                              </button>
                            ) : (
                              <button
                                type="button"
                                title="Delete document"
                                onClick={() => setConfirmDeleteId(doc.id)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => {
            const retention = getRetentionInfo(doc);
            const isWarn =
              doc.status !== 'Archived' &&
              (retention.state === 'expiring_soon' || retention.state === 'expired');

            return (
              <div
                key={doc.id}
                className={`rounded-xl border p-4 shadow-xs flex flex-col justify-between transition-colors ${
                  retention.state === 'expired' && doc.status !== 'Archived'
                    ? 'bg-red-50/50 border-red-200'
                    : isWarn
                      ? 'bg-amber-50/50 border-amber-200'
                      : 'bg-white border-slate-200/80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold text-llcc-royal tabular-nums">
                      {doc.docCode}
                    </span>
                    <StatusText status={doc.status} />
                  </div>

                  <button
                    type="button"
                    onClick={() => onInspectDocument(doc, 'overview')}
                    className="mt-2 text-left block w-full"
                  >
                    <h3 className="font-display text-sm font-bold text-slate-900 hover:text-llcc-royal line-clamp-2">
                      {doc.title}
                    </h3>
                  </button>

                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {doc.description || 'No description provided.'}
                  </p>

                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                    <div>
                      {doc.categoryName} · <span className="font-semibold">{doc.departmentCode}</span>
                    </div>
                    <div className="tabular-nums text-slate-500">
                      {getFileExtension(doc.fileName)} · {formatBytes(doc.fileSizeBytes)} · v
                      {doc.currentVersion}
                    </div>
                    <div className="tabular-nums text-slate-500">
                      Uploaded by {doc.uploadedByName} on {formatDate(doc.createdAt)}
                    </div>
                    {isWarn && retention.expiresAt && (
                      <div
                        className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                          retention.state === 'expired' ? 'text-red-700' : 'text-amber-800'
                        }`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {retention.state === 'expired'
                          ? `Retention Expired · ${formatDate(retention.expiresAt)}`
                          : `Expiring in ${retention.daysRemaining}d · ${formatDate(retention.expiresAt)}`}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onInspectDocument(doc, 'overview')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-llcc-navy hover:text-llcc-royal"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Inspect
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void onDownloadDocument(doc)}
                      className="p-1.5 rounded-md text-slate-500 hover:text-llcc-royal hover:bg-slate-100"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    {canEditOrShareDoc(doc) && (
                      <button
                        type="button"
                        onClick={() => onInspectDocument(doc, 'share')}
                        className="p-1.5 rounded-md text-slate-500 hover:text-llcc-royal hover:bg-slate-100"
                        title="Share"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canArchiveOrDeleteDoc(doc) && doc.status !== 'Archived' && (
                      <button
                        type="button"
                        onClick={() => void onArchiveDocument(doc)}
                        className="p-1.5 rounded-md text-slate-500 hover:text-amber-700 hover:bg-amber-50"
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
