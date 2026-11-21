import {
  Activity,
  Archive,
  BarChart3,
  Building2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Settings,
  Share2,
  Tags,
  Upload,
  Users,
} from 'lucide-react';
import type { RoleSlug, UserAccount } from '../types.ts';
import { LlccCrest } from './LlccCrest.tsx';

export type NavSection =
  | 'dashboard'
  | 'repository'
  | 'upload'
  | 'my-documents'
  | 'categories'
  | 'departments'
  | 'approvals'
  | 'archived'
  | 'shared'
  | 'activity-logs'
  | 'reports'
  | 'users'
  | 'settings'
  | 'help';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  currentUser: UserAccount;
  collegeName: string;
  systemTitle: string;
  logoUrl: string;
  pendingCount: number;
  archivedCount: number;
  sharedCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSignOut: () => void;
}

interface NavItemConfig {
  id: NavSection;
  label: string;
  icon: typeof LayoutDashboard;
  allowedRoles: RoleSlug[];
  badge?: number;
}

export function Sidebar({
  activeSection,
  onSelectSection,
  currentUser,
  collegeName,
  systemTitle,
  logoUrl,
  pendingCount,
  archivedCount,
  sharedCount,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  onSignOut,
}: SidebarProps) {
  const allRoles: RoleSlug[] = ['super_admin', 'dean', 'department_head', 'staff', 'student'];
  const uploaderRoles: RoleSlug[] = ['super_admin', 'department_head', 'staff'];
  const governanceRoles: RoleSlug[] = ['super_admin', 'dean', 'department_head'];
  const userManagementRoles: RoleSlug[] = ['super_admin', 'department_head'];

  const navItems: NavItemConfig[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, allowedRoles: allRoles },
    { id: 'repository', label: 'Document Repository', icon: FolderOpen, allowedRoles: allRoles },
    { id: 'upload', label: 'Upload Documents', icon: Upload, allowedRoles: uploaderRoles },
    { id: 'my-documents', label: 'My Documents', icon: FileText, allowedRoles: uploaderRoles },
    { id: 'categories', label: 'Categories', icon: Tags, allowedRoles: allRoles },
    { id: 'departments', label: 'Departments', icon: Building2, allowedRoles: allRoles },
    {
      id: 'approvals',
      label: 'Pending Approvals',
      icon: CheckSquare,
      allowedRoles: governanceRoles,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      id: 'archived',
      label: 'Archived Documents',
      icon: Archive,
      allowedRoles: governanceRoles,
      badge: archivedCount > 0 ? archivedCount : undefined,
    },
    {
      id: 'shared',
      label: 'Shared Documents',
      icon: Share2,
      allowedRoles: allRoles,
      badge: sharedCount > 0 ? sharedCount : undefined,
    },
    { id: 'activity-logs', label: 'Activity Logs', icon: Activity, allowedRoles: governanceRoles },
    { id: 'reports', label: 'Reports & Analytics', icon: BarChart3, allowedRoles: governanceRoles },
    { id: 'users', label: 'User Management', icon: Users, allowedRoles: userManagementRoles },
    { id: 'settings', label: 'Settings', icon: Settings, allowedRoles: allRoles },
    { id: 'help', label: 'Help & Support', icon: HelpCircle, allowedRoles: allRoles },
  ];

  const visibleItems = navItems.filter((item) => item.allowedRoles.includes(currentUser.roleSlug));

  const scopeLabel =
    currentUser.roleSlug === 'dean'
      ? 'COT · HTM · EDUC'
      : currentUser.departmentCode || (currentUser.roleSlug === 'super_admin' ? 'System-Wide' : '');

  const sidebarContent = (
    <aside
      className={`flex h-full flex-col glass-sidebar text-white transition-all duration-200 ${
        collapsed ? 'w-20' : 'w-68'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-white/10">
        <button
          type="button"
          onClick={() => {
            onSelectSection('dashboard');
            onCloseMobile();
          }}
          className="flex items-center gap-3 text-left min-w-0"
        >
          <LlccCrest className="h-9 w-9" src={logoUrl} />
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-display text-sm font-bold leading-tight text-white truncate">
                {collegeName}
              </div>
              <div className="text-[11px] text-llcc-gold font-medium truncate mt-0.5">
                {systemTitle}
              </div>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden lg:inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation Links (15 items incl. Logout) */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5" aria-label="Primary Sidebar">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={collapsed ? item.label : undefined}
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              className={`group flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-white/16 backdrop-blur-md text-white shadow-sm ring-1 ring-llcc-gold/50'
                  : 'text-slate-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? 'text-llcc-gold' : 'text-slate-300 group-hover:text-white'
                  }`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </span>
              {!collapsed && item.badge !== undefined && (
                <span className="tabular-nums text-xs font-semibold text-llcc-gold">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Signed-in User & Logout (Item 15) */}
      <div className="border-t border-white/10 p-3 space-y-2.5">
        {!collapsed && (
          <div className="rounded-lg glass-subcard px-3 py-2.5">
            <div className="text-xs font-semibold text-white truncate">{currentUser.fullName}</div>
            <div className="text-[11px] text-llcc-gold font-medium mt-0.5 truncate">
              {currentUser.roleName}
              {scopeLabel ? ` · ${scopeLabel}` : ''}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onSignOut}
          title={collapsed ? 'Logout' : undefined}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block h-screen sticky top-0 shrink-0 no-print">{sidebarContent}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
