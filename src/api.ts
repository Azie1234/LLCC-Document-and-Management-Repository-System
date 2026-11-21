import type {
  BootstrapData,
  ConfidentialityLevel,
  DocumentRecord,
  DocumentStatus,
  RetentionPolicy,
  RoleSlug,
  SharePermission,
  SystemSettings,
  UserAccount,
} from './types.ts';

let activeToken: string | null = null;

export function setApiAuthToken(token: string | null): void {
  activeToken = token;
}

export function getApiAuthToken(): string | null {
  return activeToken;
}

function authHeaders(json = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;
  return headers;
}

async function handleJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchPublicSettings(): Promise<{
  collegeName: string;
  systemTitle: string;
  campusAddress: string;
  academicYear: string;
  logoUrl: string;
}> {
  const res = await fetch('/api/public-settings');
  return handleJson(res);
}

export async function loginWithCredentials(
  identifier: string,
  password: string,
  rememberMe: boolean
): Promise<{ user: UserAccount; token: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password, rememberMe }),
  });
  return handleJson<{ user: UserAccount; token: string }>(res);
}

export async function loginWithFirebaseToken(
  idToken: string
): Promise<{ user: UserAccount; token: string }> {
  const res = await fetch('/api/auth/firebase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
  });
  return handleJson<{ user: UserAccount; token: string }>(res);
}

export async function resetPassword(
  identifier: string,
  newPassword: string
): Promise<{ ok: boolean; email: string }> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, newPassword }),
  });
  return handleJson(res);
}

export async function logoutSession(): Promise<void> {
  if (!activeToken) return;
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: authHeaders(false),
  }).catch(() => undefined);
}

export async function fetchBootstrap(): Promise<BootstrapData> {
  const res = await fetch('/api/bootstrap', {
    headers: authHeaders(false),
  });
  return handleJson<BootstrapData>(res);
}

export async function uploadDocument(payload: {
  docCode?: string;
  title: string;
  description: string;
  categoryId: number;
  departmentId: number;
  documentType: string;
  academicYear: string;
  status: DocumentStatus;
  confidentiality: ConfidentialityLevel;
  retentionPolicy: RetentionPolicy;
  tags: string[];
  fileName: string;
  mimeType: string;
  fileBase64?: string;
  textContent?: string;
}): Promise<{ id: number; docCode: string }> {
  const res = await fetch('/api/documents', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function updateDocumentMetadata(
  docId: number,
  payload: {
    title: string;
    description: string;
    categoryId: number;
    departmentId: number;
    documentType: string;
    academicYear: string;
    confidentiality: ConfidentialityLevel;
    retentionPolicy: RetentionPolicy;
    tags: string[];
  }
): Promise<void> {
  const res = await fetch(`/api/documents/${docId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  await handleJson(res);
}

export async function uploadDocumentVersion(
  docId: number,
  payload: {
    versionBump: 'minor' | 'major';
    fileName: string;
    mimeType: string;
    fileBase64?: string;
    textContent?: string;
    changeNotes: string;
  }
): Promise<{ versionNumber: string }> {
  const res = await fetch(`/api/documents/${docId}/versions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function transitionWorkflow(
  docId: number,
  action: 'submit' | 'start_review' | 'approve' | 'reject' | 'archive' | 'restore',
  reason?: string
): Promise<{ status: DocumentStatus }> {
  const res = await fetch(`/api/documents/${docId}/workflow`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ action, reason }),
  });
  return handleJson(res);
}

export async function deleteDocumentPermanently(docId: number): Promise<void> {
  const res = await fetch(`/api/documents/${docId}`, {
    method: 'DELETE',
    headers: authHeaders(false),
  });
  await handleJson(res);
}

export async function shareDocument(
  docId: number,
  payload: {
    targetUserId?: number | null;
    targetDepartmentId?: number | null;
    targetRoleSlug?: RoleSlug | null;
    permission: SharePermission;
    expiresAt?: string | null;
  }
): Promise<void> {
  const res = await fetch(`/api/documents/${docId}/shares`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  await handleJson(res);
}

export async function revokeShare(shareId: number): Promise<void> {
  const res = await fetch(`/api/shares/${shareId}`, {
    method: 'DELETE',
    headers: authHeaders(false),
  });
  await handleJson(res);
}

export async function addComment(docId: number, body: string): Promise<void> {
  const res = await fetch(`/api/documents/${docId}/comments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ body }),
  });
  await handleJson(res);
}

export async function fetchDocumentTextContent(
  docId: number,
  versionNumber?: string
): Promise<{ content: string; fileName: string; mimeType: string }> {
  const q = versionNumber ? `?version=${encodeURIComponent(versionNumber)}` : '';
  const res = await fetch(`/api/documents/${docId}/content${q}`, {
    headers: authHeaders(false),
  });
  return handleJson(res);
}

export function getDocumentInlineUrl(docId: number, versionNumber?: string): string {
  const params = new URLSearchParams({ inline: '1' });
  if (versionNumber) params.set('version', versionNumber);
  if (activeToken) params.set('token', activeToken);
  return `/api/documents/${docId}/file?${params.toString()}`;
}

export async function downloadDocumentFile(
  doc: DocumentRecord,
  versionNumber?: string,
  customFileName?: string
): Promise<void> {
  const ver = versionNumber || doc.currentVersion;
  const res = await fetch(
    `/api/documents/${doc.id}/file?version=${encodeURIComponent(ver)}`,
    { headers: authHeaders(false) }
  );
  if (!res.ok) {
    throw new Error('Unable to download file.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = customFileName || doc.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function createCategory(payload: { name: string; description: string }): Promise<void> {
  const res = await fetch('/api/categories', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  await handleJson(res);
}

export async function updateCategory(
  id: number,
  payload: { name: string; description: string }
): Promise<void> {
  const res = await fetch(`/api/categories/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  await handleJson(res);
}

export async function deleteCategory(id: number): Promise<void> {
  const res = await fetch(`/api/categories/${id}`, {
    method: 'DELETE',
    headers: authHeaders(false),
  });
  await handleJson(res);
}

export async function createDepartment(payload: {
  code: string;
  name: string;
  head: string;
  description: string;
  retentionDefault: RetentionPolicy;
}): Promise<void> {
  const res = await fetch('/api/departments', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  await handleJson(res);
}

export async function updateDepartment(
  id: number,
  payload: {
    code: string;
    name: string;
    head: string;
    description: string;
    retentionDefault: RetentionPolicy;
  }
): Promise<void> {
  const res = await fetch(`/api/departments/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  await handleJson(res);
}

export async function deleteDepartment(id: number): Promise<void> {
  const res = await fetch(`/api/departments/${id}`, {
    method: 'DELETE',
    headers: authHeaders(false),
  });
  await handleJson(res);
}

export async function createUser(payload: {
  fullName: string;
  email: string;
  username: string;
  password: string;
  roleSlug: RoleSlug;
  departmentId: number | null;
}): Promise<void> {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  await handleJson(res);
}

export async function updateUser(
  userId: number,
  payload: {
    fullName?: string;
    email?: string;
    username?: string;
    roleSlug?: RoleSlug;
    departmentId?: number | null;
    isActive?: boolean;
    resetPassword?: string;
  }
): Promise<void> {
  const res = await fetch(`/api/users/${userId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  await handleJson(res);
}

export async function deleteUser(userId: number): Promise<void> {
  const res = await fetch(`/api/users/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(false),
  });
  await handleJson(res);
}

export async function updateOwnProfile(payload: {
  fullName: string;
  email: string;
  avatarUrl?: string | null;
}): Promise<{ user: UserAccount }> {
  const res = await fetch('/api/profile', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function changeOwnPassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const res = await fetch('/api/profile/password', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  await handleJson(res);
}

export async function markNotificationRead(id: number): Promise<void> {
  const res = await fetch(`/api/notifications/${id}/read`, {
    method: 'POST',
    headers: authHeaders(false),
  });
  await handleJson(res);
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetch('/api/notifications/read-all', {
    method: 'POST',
    headers: authHeaders(false),
  });
  await handleJson(res);
}

export async function updateSystemSettings(payload: {
  collegeName: string;
  systemTitle: string;
  campusAddress: string;
  academicYear: string;
  logoUrl: string;
  maxUploadMb: number;
  allowedFormats: string[];
  notifyOnUpload: boolean;
  notifyOnApproval: boolean;
  notifyOnShare: boolean;
}): Promise<{ settings: SystemSettings }> {
  const res = await fetch('/api/settings', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function downloadActivityLogsCsv(): Promise<void> {
  const res = await fetch('/api/activity-logs/export', {
    headers: authHeaders(false),
  });
  if (!res.ok) throw new Error('Unable to export activity logs.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `llcc_activity_logs_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
