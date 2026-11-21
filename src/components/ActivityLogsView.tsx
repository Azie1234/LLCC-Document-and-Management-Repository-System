import { useMemo, useState } from 'react';
import { Activity, FileDown, Search } from 'lucide-react';
import { downloadActivityLogsCsv } from '../api.ts';
import type { ActivityLogEntry } from '../types.ts';
import { formatDateTime } from '../utils/format.ts';

interface ActivityLogsViewProps {
  logs: ActivityLogEntry[];
}

export function ActivityLogsView({ logs }: ActivityLogsViewProps) {
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const actionTypes = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) set.add(l.action);
    return Array.from(set).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (!q) return true;
      return [l.actorName, l.actorRole, l.action, l.targetRef, l.targetTitle, l.details, l.ipAddress]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [logs, query, actionFilter]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-llcc-navy">Activity Logs</h2>
            <p className="text-xs text-slate-500">
              Chronological record of logins, uploads, downloads, approvals, shares, and system
              changes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void downloadActivityLogsCsv()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-llcc-navy hover:bg-slate-50"
          >
            <FileDown className="h-3.5 w-3.5 text-llcc-royal" />
            Export Activity CSV
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search user, document ID, details, or IP address..."
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-xs focus:border-llcc-royal focus:outline-none"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
          >
            <option value="all">All Actions</option>
            {actionTypes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="rounded-xl bg-white border border-slate-200/80 p-10 text-center">
          <Activity className="h-8 w-8 mx-auto text-slate-300" />
          <p className="text-sm font-semibold text-slate-700 mt-2">No matching log entries</p>
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-3">User &amp; Role</th>
                  <th className="py-3 px-3">Action</th>
                  <th className="py-3 px-3">Affected Document / Target</th>
                  <th className="py-3 px-3">Details</th>
                  <th className="py-3 px-4 text-right">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap tabular-nums">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-800">{log.actorName}</div>
                      <div className="text-[11px] text-slate-500">{log.actorRole}</div>
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold text-llcc-navy whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono text-[11px] text-llcc-royal">{log.targetRef}</div>
                      <div className="font-medium text-slate-800 line-clamp-1">
                        {log.targetTitle}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 max-w-md">{log.details}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-500 whitespace-nowrap tabular-nums">
                      {log.ipAddress}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
