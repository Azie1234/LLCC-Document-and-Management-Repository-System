import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, FileText } from 'lucide-react';
import type { NotificationItem } from '../types.ts';
import { formatDateTime } from '../utils/format.ts';

interface NotificationBellProps {
  notifications: NotificationItem[];
  onMarkRead: (id: number) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onOpenDocumentById: (documentId: number) => void;
}

export function NotificationBell({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onOpenDocumentById,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/80 bg-white/65 backdrop-blur-md text-slate-700 hover:bg-white/90 hover:text-llcc-navy transition-colors shadow-xs"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-llcc-gold px-1 text-[10px] font-bold text-llcc-navy tabular-nums">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl glass-popover z-40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3 bg-white/50">
            <div>
              <h3 className="text-sm font-semibold text-llcc-navy">Notifications</h3>
              <p className="text-[11px] text-slate-500 tabular-nums">
                {unreadCount} unread alert{unreadCount === 1 ? '' : 's'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  void onMarkAllRead();
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-llcc-royal hover:text-llcc-navy"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500">
                No notifications yet.
              </div>
            ) : (
              notifications.slice(0, 20).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!item.isRead) {
                      void onMarkRead(item.id);
                    }
                    if (item.documentId) {
                      onOpenDocumentById(item.documentId);
                      setOpen(false);
                    }
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 flex items-start gap-3 ${
                    item.isRead ? 'bg-white' : 'bg-amber-50/40'
                  }`}
                >
                  <FileText
                    className={`h-4 w-4 shrink-0 mt-0.5 ${
                      item.isRead ? 'text-slate-400' : 'text-llcc-royal'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-semibold truncate ${
                          item.isRead ? 'text-slate-700' : 'text-llcc-navy'
                        }`}
                      >
                        {item.title}
                      </span>
                      {!item.isRead && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-llcc-gold" />
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{item.message}</p>
                    <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                      {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
