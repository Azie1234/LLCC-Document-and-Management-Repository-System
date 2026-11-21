import { useCallback, useEffect, useMemo, useState } from 'react';
import { Menu } from 'lucide-react';
import { signOut } from 'firebase/auth';
import {
  deleteDocumentPermanently,
  downloadDocumentFile,
  fetchBootstrap,
  fetchPublicSettings,
  logoutSession,
  markAllNotificationsRead,
  markNotificationRead,
  setApiAuthToken,
  transitionWorkflow,
} from './api.ts';
import { ActivityLogsView } from './components/ActivityLogsView.tsx';
import { ApprovalsView } from './components/ApprovalsView.tsx';
import { ArchivedDocumentsView } from './components/ArchivedDocumentsView.tsx';
import { CategoriesView } from './components/CategoriesView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DepartmentsView } from './components/DepartmentsView.tsx';
import {
  DocumentInspectorDrawer,
  type InspectorTab,
} from './components/DocumentInspectorDrawer.tsx';
import { HelpSupportView } from './components/HelpSupportView.tsx';
import { LlccCrest } from './components/LlccCrest.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { MyDocumentsView } from './components/MyDocumentsView.tsx';
import { NotificationBell } from './components/NotificationBell.tsx';
import { ReportsAnalyticsView } from './components/ReportsAnalyticsView.tsx';
import { RepositoryView } from './components/RepositoryView.tsx';
import { SettingsProfileView } from './components/SettingsProfileView.tsx';
import { SharedDocumentsView } from './components/SharedDocumentsView.tsx';
import { Sidebar, type NavSection } from './components/Sidebar.tsx';
import { UploadDocumentView } from './components/UploadDocumentView.tsx';
import { UserManagementView } from './components/UserManagementView.tsx';
import { auth } from './lib/firebase.ts';
import type { BootstrapData, DocumentRecord, UserAccount } from './types.ts';

const TOKEN_STORAGE_KEY = 'llcc_repo_auth_token_v1';

const SECTION_PATH_MAP: Record<NavSection, string> = {
  dashboard: '/dashboard',
  repository: '/repository',
  upload: '/upload',
  'my-documents': '/my-documents',
  categories: '/categories',
  departments: '/departments',
  approvals: '/approvals',
  archived: '/archived',
  shared: '/shared',
  'activity-logs': '/activity-logs',
  reports: '/reports',
  users: '/users',
  settings: '/settings',
  help: '/help',
};

function parseSectionFromPath(pathname: string): NavSection | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  for (const [section, path] of Object.entries(SECTION_PATH_MAP)) {
    if (clean === path) return section as NavSection;
  }
  return null;
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistStoredToken(token: string | null, rememberMe: boolean): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    if (!token) return;
    if (rememberMe) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  } catch {
    // Ignore storage quota issues
  }
}

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Home / Dashboard',
  repository: 'Document Repository',
  upload: 'Upload Document',
  'my-documents': 'My Documents',
  categories: 'Document Categories',
  departments: 'Department Management',
  approvals: 'Pending Approvals',
  archived: 'Archived Documents',
  shared: 'Shared Documents',
  'activity-logs': 'Activity Logs',
  reports: 'Reports & Analytics',
  users: 'User Management',
  settings: 'Settings & Profile',
  help: 'Help & Support',
};

export default function App() {
  const [publicBrand, setPublicBrand] = useState({
    collegeName: 'Lapu-Lapu City College',
    systemTitle: 'LLCC Document Management Repository',
    campusAddress: 'Gun-ob, Lapu-Lapu City, Cebu',
    academicYear: 'AY 2026-2027',
    logoUrl: '/assets/aistudio/image_65e8ffc2.png',
  });

  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [initializing, setInitializing] = useState<boolean>(() => Boolean(readStoredToken()));
  const [data, setData] = useState<BootstrapData | null>(null);

  const [intendedSection, setIntendedSection] = useState<NavSection>(
    () => parseSectionFromPath(window.location.pathname) || 'dashboard'
  );
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Deep-link filter states
  const [repoDeptFilter, setRepoDeptFilter] = useState<number | 'all'>('all');
  const [repoCatFilter, setRepoCatFilter] = useState<number | 'all'>('all');
  const [onlyExpiring, setOnlyExpiring] = useState(false);

  // Document Inspector Drawer
  const [inspectedDocId, setInspectedDocId] = useState<number | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const [bannerError, setBannerError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicSettings()
      .then((settings) => setPublicBrand(settings))
      .catch(() => undefined);
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const boot = await fetchBootstrap();
    setData(boot);
    setPublicBrand({
      collegeName: boot.systemSettings.collegeName,
      systemTitle: boot.systemSettings.systemTitle,
      campusAddress: boot.systemSettings.campusAddress,
      academicYear: boot.systemSettings.academicYear,
      logoUrl: boot.systemSettings.logoUrl,
    });
  }, []);

  useEffect(() => {
    if (!token) {
      setApiAuthToken(null);
      setData(null);
      setInitializing(false);
      if (window.location.pathname !== '/login') {
        const requested = parseSectionFromPath(window.location.pathname);
        if (requested) setIntendedSection(requested);
        window.history.replaceState({}, '', '/login');
      }
      return;
    }

    setApiAuthToken(token);
    setInitializing(true);
    refreshBootstrap()
      .then(() => {
        const dest = intendedSection || 'dashboard';
        setActiveSection(dest);
        window.history.replaceState({}, '', SECTION_PATH_MAP[dest]);
      })
      .catch(() => {
        persistStoredToken(null, false);
        setApiAuthToken(null);
        setToken(null);
        setData(null);
        window.history.replaceState({}, '', '/login');
      })
      .finally(() => {
        setInitializing(false);
      });
  }, [token, refreshBootstrap, intendedSection]);

  useEffect(() => {
    const onPopState = () => {
      if (!token) {
        if (window.location.pathname !== '/login') {
          window.history.replaceState({}, '', '/login');
        }
        return;
      }
      const next = parseSectionFromPath(window.location.pathname);
      if (next) setActiveSection(next);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [token]);

  const navigateTo = useCallback((section: NavSection) => {
    setActiveSection(section);
    setBannerError(null);
    if (section !== 'repository') {
      setRepoDeptFilter('all');
      setRepoCatFilter('all');
      setOnlyExpiring(false);
    }
    const targetPath = SECTION_PATH_MAP[section];
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  }, []);

  const handleAuthenticated = (
    _user: UserAccount,
    issuedToken: string,
    rememberMe: boolean
  ) => {
    persistStoredToken(issuedToken, rememberMe);
    setApiAuthToken(issuedToken);
    setToken(issuedToken);
  };

  const handleSignOut = async () => {
    await logoutSession();
    await signOut(auth).catch(() => undefined);
    persistStoredToken(null, false);
    setApiAuthToken(null);
    setToken(null);
    setData(null);
    setInspectedDocId(null);
    setIntendedSection('dashboard');
    window.history.replaceState({}, '', '/login');
  };

  const inspectedDoc = useMemo(() => {
    if (!data || inspectedDocId === null) return null;
    return data.documents.find((d) => d.id === inspectedDocId) || null;
  }, [data, inspectedDocId]);

  const openInspector = (
    doc: DocumentRecord,
    tab: InspectorTab = 'overview'
  ) => {
    setInspectedDocId(doc.id);
    setInspectorTab(tab);
  };

  const handleDownload = async (doc: DocumentRecord) => {
    try {
      await downloadDocumentFile(doc);
      await refreshBootstrap();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Unable to download file.');
    }
  };

  const handleArchiveDocument = async (doc: DocumentRecord) => {
    try {
      await transitionWorkflow(doc.id, 'archive');
      await refreshBootstrap();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Unable to archive document.');
    }
  };

  const handleBulkArchive = async (docIds: number[]) => {
    try {
      for (const id of docIds) {
        await transitionWorkflow(id, 'archive');
      }
      await refreshBootstrap();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Bulk archive encountered an error.');
    }
  };

  const handleDeleteDocument = async (doc: DocumentRecord) => {
    try {
      await deleteDocumentPermanently(doc.id);
      if (inspectedDocId === doc.id) setInspectedDocId(null);
      await refreshBootstrap();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Unable to delete document.');
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-llcc-canvas flex flex-col items-center justify-center gap-3 p-6">
        <LlccCrest className="h-14 w-14" src={publicBrand.logoUrl} />
        <div className="font-display text-sm font-bold text-llcc-navy">
          {publicBrand.systemTitle}
        </div>
        <p className="text-xs text-slate-500">Verifying institutional session...</p>
      </div>
    );
  }

  if (!token || !data) {
    return (
      <LoginPage
        collegeName={publicBrand.collegeName}
        systemTitle={publicBrand.systemTitle}
        campusAddress={publicBrand.campusAddress}
        academicYear={publicBrand.academicYear}
        logoUrl={publicBrand.logoUrl}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const {
    currentUser,
    departments,
    categories,
    users,
    documents,
    activityLogs,
    notifications,
    systemSettings,
  } = data;

  const isAdmin = currentUser.roleSlug === 'super_admin' || currentUser.roleSlug === 'admin';
  const canUpload = currentUser.roleSlug !== 'student';

  const pendingCount = documents.filter(
    (d) => d.status === 'Pending' || d.status === 'Under Review'
  ).length;
  const archivedCount = documents.filter((d) => d.status === 'Archived').length;
  const sharedCount = documents.filter((d) =>
    d.shares.some(
      (s) =>
        !s.revokedAt &&
        (s.targetUserId === currentUser.id ||
          s.targetDepartmentId === currentUser.departmentId ||
          s.targetRoleSlug === currentUser.roleSlug)
    )
  ).length;

  // Enforce role access if route switched directly
  const guardedSection: NavSection =
    (!isAdmin &&
      ['approvals', 'archived', 'activity-logs', 'reports', 'users'].includes(activeSection)) ||
    (!canUpload && ['upload', 'my-documents'].includes(activeSection))
      ? 'dashboard'
      : activeSection;

  return (
    <div className="min-h-screen bg-llcc-canvas flex">
      <Sidebar
        activeSection={guardedSection}
        onSelectSection={navigateTo}
        currentUser={currentUser}
        collegeName={systemSettings.collegeName}
        systemTitle={systemSettings.systemTitle}
        logoUrl={systemSettings.logoUrl}
        pendingCount={pendingCount}
        archivedCount={archivedCount}
        sharedCount={sharedCount}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onSignOut={() => void handleSignOut()}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Utility Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-llcc-royal truncate">
                {systemSettings.collegeName} · {systemSettings.campusAddress}
              </div>
              <h1 className="font-display text-base sm:text-lg font-bold text-llcc-navy truncate">
                {SECTION_TITLES[guardedSection]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <NotificationBell
              notifications={notifications}
              onMarkRead={async (id) => {
                await markNotificationRead(id);
                await refreshBootstrap();
              }}
              onMarkAllRead={async () => {
                await markAllNotificationsRead();
                await refreshBootstrap();
              }}
              onOpenDocumentById={(docId) => {
                const target = documents.find((d) => d.id === docId);
                if (target) openInspector(target, 'overview');
              }}
            />

            <button
              type="button"
              onClick={() => navigateTo('settings')}
              className="hidden sm:flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-left hover:bg-slate-100 transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-llcc-navy text-llcc-gold flex items-center justify-center font-display text-xs font-bold shrink-0">
                {currentUser.fullName
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </div>
              <div className="leading-tight">
                <div className="text-xs font-semibold text-llcc-navy">{currentUser.fullName}</div>
                <div className="text-[11px] text-slate-500">{currentUser.roleName}</div>
              </div>
            </button>
          </div>
        </header>

        {/* Main Workspace Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {bannerError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-center justify-between gap-2">
              <span>{bannerError}</span>
              <button
                type="button"
                onClick={() => setBannerError(null)}
                className="font-semibold underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {guardedSection === 'dashboard' && (
            <DashboardView
              currentUser={currentUser}
              collegeName={systemSettings.collegeName}
              academicYear={systemSettings.academicYear}
              documents={documents}
              categories={categories}
              departments={departments}
              activityLogs={activityLogs}
              onNavigate={navigateTo}
              onOpenExpiringFilter={() => {
                setOnlyExpiring(true);
                setActiveSection('repository');
                window.history.pushState({}, '', SECTION_PATH_MAP.repository);
              }}
              onInspectDocument={(doc) => openInspector(doc, 'overview')}
            />
          )}

          {guardedSection === 'repository' && (
            <RepositoryView
              key={`${repoDeptFilter}-${repoCatFilter}`}
              currentUser={currentUser}
              documents={documents}
              categories={categories}
              departments={departments}
              initialDepartmentId={repoDeptFilter}
              initialCategoryId={repoCatFilter}
              onlyExpiring={onlyExpiring}
              onToggleOnlyExpiring={setOnlyExpiring}
              onInspectDocument={(doc, tab) => openInspector(doc, tab || 'overview')}
              onDownloadDocument={handleDownload}
              onArchiveDocument={handleArchiveDocument}
              onBulkArchive={handleBulkArchive}
              onDeleteDocument={handleDeleteDocument}
            />
          )}

          {guardedSection === 'upload' && canUpload && (
            <UploadDocumentView
              currentUser={currentUser}
              categories={categories}
              departments={departments}
              systemSettings={systemSettings}
              onUploaded={async (docId) => {
                await refreshBootstrap();
                setInspectedDocId(docId);
                setInspectorTab('overview');
                navigateTo('repository');
              }}
              onCancel={() => navigateTo('repository')}
            />
          )}

          {guardedSection === 'my-documents' && canUpload && (
            <MyDocumentsView
              currentUser={currentUser}
              documents={documents}
              onInspectDocument={(doc, tab) => openInspector(doc, tab || 'overview')}
              onDownloadDocument={handleDownload}
              onNavigateUpload={() => navigateTo('upload')}
              onRefresh={refreshBootstrap}
            />
          )}

          {guardedSection === 'categories' && (
            <CategoriesView
              currentUser={currentUser}
              categories={categories}
              documents={documents}
              onOpenCategoryInRepo={(categoryId) => {
                setRepoCatFilter(categoryId);
                setRepoDeptFilter('all');
                setOnlyExpiring(false);
                setActiveSection('repository');
                window.history.pushState({}, '', SECTION_PATH_MAP.repository);
              }}
              onRefresh={refreshBootstrap}
            />
          )}

          {guardedSection === 'departments' && (
            <DepartmentsView
              currentUser={currentUser}
              departments={departments}
              documents={documents}
              users={users}
              onOpenDepartmentInRepo={(departmentId) => {
                setRepoDeptFilter(departmentId);
                setRepoCatFilter('all');
                setOnlyExpiring(false);
                setActiveSection('repository');
                window.history.pushState({}, '', SECTION_PATH_MAP.repository);
              }}
              onRefresh={refreshBootstrap}
            />
          )}

          {guardedSection === 'approvals' && isAdmin && (
            <ApprovalsView
              documents={documents}
              onInspectDocument={(doc) => openInspector(doc, 'overview')}
              onRefresh={refreshBootstrap}
            />
          )}

          {guardedSection === 'archived' && isAdmin && (
            <ArchivedDocumentsView
              documents={documents}
              onInspectDocument={(doc) => openInspector(doc, 'overview')}
              onRefresh={refreshBootstrap}
            />
          )}

          {guardedSection === 'shared' && (
            <SharedDocumentsView
              currentUser={currentUser}
              documents={documents}
              onInspectDocument={(doc, tab) => openInspector(doc, tab || 'overview')}
              onDownloadDocument={handleDownload}
              onRefresh={refreshBootstrap}
            />
          )}

          {guardedSection === 'activity-logs' && isAdmin && (
            <ActivityLogsView logs={activityLogs} />
          )}

          {guardedSection === 'reports' && isAdmin && (
            <ReportsAnalyticsView
              documents={documents}
              departments={departments}
              categories={categories}
              users={users}
            />
          )}

          {guardedSection === 'users' && isAdmin && (
            <UserManagementView
              currentUser={currentUser}
              users={users}
              departments={departments}
              onRefresh={refreshBootstrap}
            />
          )}

          {guardedSection === 'settings' && (
            <SettingsProfileView
              currentUser={currentUser}
              systemSettings={systemSettings}
              onRefresh={refreshBootstrap}
            />
          )}

          {guardedSection === 'help' && <HelpSupportView systemSettings={systemSettings} />}
        </main>
      </div>

      {/* Document Inspector Slide-Over */}
      <DocumentInspectorDrawer
        doc={inspectedDoc}
        initialTab={inspectorTab}
        currentUser={currentUser}
        categories={categories}
        departments={departments}
        users={users}
        onClose={() => setInspectedDocId(null)}
        onRefresh={refreshBootstrap}
      />
    </div>
  );
}
