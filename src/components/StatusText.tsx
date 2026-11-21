import {
  Archive,
  CheckCircle2,
  Clock,
  Eye,
  FileEdit,
  XCircle,
} from 'lucide-react';
import type { DocumentStatus } from '../types.ts';

export function StatusText({ status }: { status: DocumentStatus }) {
  switch (status) {
    case 'Approved':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>Approved</span>
        </span>
      );
    case 'Pending':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>Pending</span>
        </span>
      );
    case 'Under Review':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-llcc-royal whitespace-nowrap">
          <Eye className="h-3.5 w-3.5 shrink-0 text-llcc-royal" />
          <span>Under Review</span>
        </span>
      );
    case 'Rejected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
          <span>Rejected</span>
        </span>
      );
    case 'Archived':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
          <Archive className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span>Archived</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
          <FileEdit className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span>Draft</span>
        </span>
      );
  }
}
