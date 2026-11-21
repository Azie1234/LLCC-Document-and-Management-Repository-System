import { jsPDF } from 'jspdf';
import type { Department, DocumentCategory, DocumentRecord, UserAccount } from '../types.ts';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  if (idx < 0) return 'FILE';
  return fileName.slice(idx + 1).toUpperCase();
}

export type RetentionStatusState = 'permanent' | 'valid' | 'expiring_soon' | 'expired';

export interface RetentionInfo {
  policy: DocumentRecord['retentionPolicy'];
  years: number | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  state: RetentionStatusState;
}

const RETENTION_YEARS_MAP: Record<DocumentRecord['retentionPolicy'], number | null> = {
  '3 Years': 3,
  '5 Years': 5,
  '7 Years': 7,
  Permanent: null,
};

export const RETENTION_WARNING_DAYS = 90;

export function getRetentionInfo(
  doc: DocumentRecord,
  referenceDate: Date = new Date()
): RetentionInfo {
  const years = RETENTION_YEARS_MAP[doc.retentionPolicy];
  if (years === null) {
    return {
      policy: doc.retentionPolicy,
      years: null,
      expiresAt: null,
      daysRemaining: null,
      state: 'permanent',
    };
  }

  let expiry: Date;
  if (doc.retentionExpiresAt) {
    expiry = new Date(doc.retentionExpiresAt);
  } else {
    expiry = new Date(doc.createdAt);
    expiry.setFullYear(expiry.getFullYear() + years);
  }

  if (Number.isNaN(expiry.getTime())) {
    return {
      policy: doc.retentionPolicy,
      years,
      expiresAt: null,
      daysRemaining: null,
      state: 'valid',
    };
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysRemaining = Math.ceil((expiry.getTime() - referenceDate.getTime()) / msPerDay);

  let state: RetentionStatusState = 'valid';
  if (daysRemaining <= 0) {
    state = 'expired';
  } else if (daysRemaining <= RETENTION_WARNING_DAYS) {
    state = 'expiring_soon';
  }

  return {
    policy: doc.retentionPolicy,
    years,
    expiresAt: expiry.toISOString(),
    daysRemaining,
    state,
  };
}

export function isNearingRetentionExpiration(
  doc: DocumentRecord,
  referenceDate: Date = new Date()
): boolean {
  if (doc.status === 'Archived') return false;
  const info = getRetentionInfo(doc, referenceDate);
  return info.state === 'expiring_soon' || info.state === 'expired';
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

export function exportDocumentsCsv(docs: DocumentRecord[]): void {
  const escapeCsv = (val: string) => `"${String(val).replaceAll('"', '""')}"`;
  const header = [
    'Document ID',
    'Title',
    'Category',
    'Department',
    'File Type',
    'File Size',
    'Status',
    'Confidentiality',
    'Retention',
    'Retention Expires',
    'Version',
    'Uploaded By',
    'Date Uploaded',
    'Last Modified',
  ].join(',');

  const rows = docs.map((d) => {
    const retention = getRetentionInfo(d);
    return [
      escapeCsv(d.docCode),
      escapeCsv(d.title),
      escapeCsv(d.categoryName),
      escapeCsv(`${d.departmentCode} - ${d.departmentName}`),
      escapeCsv(getFileExtension(d.fileName)),
      escapeCsv(formatBytes(d.fileSizeBytes)),
      escapeCsv(d.status),
      escapeCsv(d.confidentiality),
      escapeCsv(d.retentionPolicy),
      escapeCsv(retention.expiresAt ? formatDate(retention.expiresAt) : 'Permanent'),
      escapeCsv(`v${d.currentVersion}`),
      escapeCsv(d.uploadedByName),
      escapeCsv(formatDate(d.createdAt)),
      escapeCsv(formatDate(d.updatedAt)),
    ].join(',');
  });

  const csv = '\uFEFF' + [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `llcc_documents_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportAnalyticsReportExcel(
  docs: DocumentRecord[],
  departments: Department[],
  categories: DocumentCategory[],
  users: UserAccount[]
): void {
  const escapeCsv = (val: string | number) => `"${String(val).replaceAll('"', '""')}"`;
  const totalBytes = docs.reduce((s, d) => s + d.fileSizeBytes, 0);
  const approved = docs.filter((d) => d.status === 'Approved').length;
  const rejected = docs.filter((d) => d.status === 'Rejected').length;
  const pending = docs.filter((d) => d.status === 'Pending' || d.status === 'Under Review').length;
  const archived = docs.filter((d) => d.status === 'Archived').length;
  const activeUsers = users.filter((u) => u.isActive).length;

  const lines: string[] = [
    'Lapu-Lapu City College — Repository Analytics Report',
    `Generated,${escapeCsv(new Date().toLocaleString('en-US'))}`,
    '',
    'Summary Metric,Value',
    `Total Documents,${docs.length}`,
    `Approved Documents,${approved}`,
    `Pending / Under Review,${pending}`,
    `Rejected Documents,${rejected}`,
    `Archived Documents,${archived}`,
    `Active Users,${activeUsers}`,
    `Total Storage Used,${escapeCsv(formatBytes(totalBytes))}`,
    '',
    'Department Breakdown,Documents,Downloads,Views',
    ...departments.map((dept) => {
      const deptDocs = docs.filter((d) => d.departmentId === dept.id);
      const downloads = deptDocs.reduce((s, d) => s + d.downloadCount, 0);
      const views = deptDocs.reduce((s, d) => s + d.viewCount, 0);
      return [escapeCsv(`${dept.code} - ${dept.name}`), deptDocs.length, downloads, views].join(',');
    }),
    '',
    'Category Breakdown,Documents',
    ...categories.map((cat) => {
      const count = docs.filter((d) => d.categoryId === cat.id).length;
      return [escapeCsv(cat.name), count].join(',');
    }),
  ];

  const csv = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csv], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `llcc_analytics_report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportAnalyticsReportPdf(
  docs: DocumentRecord[],
  departments: Department[],
  categories: DocumentCategory[],
  users: UserAccount[]
): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const totalBytes = docs.reduce((s, d) => s + d.fileSizeBytes, 0);
  const approved = docs.filter((d) => d.status === 'Approved').length;
  const rejected = docs.filter((d) => d.status === 'Rejected').length;
  const pending = docs.filter((d) => d.status === 'Pending' || d.status === 'Under Review').length;
  const archived = docs.filter((d) => d.status === 'Archived').length;
  const activeUsers = users.filter((u) => u.isActive).length;

  pdf.setFillColor(16, 45, 80);
  pdf.rect(0, 0, 595, 76, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(15);
  pdf.text('Lapu-Lapu City College', 40, 34);
  pdf.setFontSize(10);
  pdf.text('LLCC Document Management Repository — Analytics & Compliance Report', 40, 54);

  pdf.setTextColor(15, 23, 42);
  let y = 104;
  pdf.setFontSize(11);
  pdf.text(`Generated: ${new Date().toLocaleString('en-US')}`, 40, y);
  y += 26;

  pdf.setFontSize(12);
  pdf.text('Repository Summary', 40, y);
  y += 18;
  pdf.setFontSize(10);
  const summaryRows = [
    `Total Documents: ${docs.length}    |    Approved: ${approved}    |    Pending/Review: ${pending}`,
    `Rejected: ${rejected}    |    Archived: ${archived}    |    Active Users: ${activeUsers}    |    Storage: ${formatBytes(totalBytes)}`,
  ];
  for (const row of summaryRows) {
    pdf.text(row, 40, y);
    y += 16;
  }

  y += 14;
  pdf.setFontSize(12);
  pdf.text('Documents by Department', 40, y);
  y += 18;
  pdf.setFontSize(9.5);
  for (const dept of departments) {
    const deptDocs = docs.filter((d) => d.departmentId === dept.id);
    const downloads = deptDocs.reduce((s, d) => s + d.downloadCount, 0);
    const views = deptDocs.reduce((s, d) => s + d.viewCount, 0);
    pdf.text(`${dept.code} — ${dept.name}: ${deptDocs.length} docs (${views} views, ${downloads} downloads)`, 44, y);
    y += 15;
    if (y > 760) {
      pdf.addPage();
      y = 50;
    }
  }

  y += 14;
  pdf.setFontSize(12);
  pdf.text('Documents by Category', 40, y);
  y += 18;
  pdf.setFontSize(9.5);
  for (const cat of categories) {
    const count = docs.filter((d) => d.categoryId === cat.id).length;
    pdf.text(`${cat.name}: ${count} documents`, 44, y);
    y += 14;
    if (y > 760) {
      pdf.addPage();
      y = 50;
    }
  }

  pdf.save(`llcc_analytics_report_${new Date().toISOString().slice(0, 10)}.pdf`);
}
