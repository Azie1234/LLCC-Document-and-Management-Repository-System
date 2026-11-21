export type RoleSlug = 'super_admin' | 'dean' | 'department_head' | 'staff' | 'student';

export type RoleName = 'SUPER ADMIN' | 'DEAN' | 'DEPARTMENT HEAD' | 'STAFF' | 'STUDENT';

export type DocumentStatus =
  | 'Draft'
  | 'Pending'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Archived';

export type ConfidentialityLevel = 'Internal' | 'Restricted' | 'Confidential';

export type RetentionPolicy = '3 Years' | '5 Years' | '7 Years' | 'Permanent';

export type SharePermission = 'view' | 'download' | 'edit';

export interface RoleRecord {
  id: number;
  slug: RoleSlug;
  name: RoleName;
  description: string;
}

export interface UserAccount {
  id: number;
  uid: string | null;
  username: string;
  email: string;
  fullName: string;
  roleId: number;
  roleSlug: RoleSlug;
  roleName: RoleName;
  departmentId: number | null;
  departmentCode: string | null;
  departmentName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Department {
  id: number;
  code: string;
  name: string;
  head: string;
  description: string;
  retentionDefault: RetentionPolicy;
  createdAt: string;
}

export interface DocumentCategory {
  id: number;
  slug: string;
  name: string;
  description: string;
  departmentId: number | null;
  departmentCode: string | null;
  departmentName: string | null;
  isSystem: boolean;
  createdAt: string;
}

export interface DocumentVersion {
  id: number;
  documentId: number;
  versionNumber: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storageKey: string;
  uploadedById: number;
  uploadedByName: string;
  changeNotes: string;
  createdAt: string;
}

export interface DocumentShare {
  id: number;
  documentId: number;
  sharedById: number;
  sharedByName: string;
  targetUserId: number | null;
  targetUserName: string | null;
  targetDepartmentId: number | null;
  targetDepartmentName: string | null;
  targetRoleSlug: RoleSlug | null;
  permission: SharePermission;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface DocumentApproval {
  id: number;
  documentId: number;
  reviewerId: number;
  reviewerName: string;
  fromStatus: DocumentStatus;
  toStatus: DocumentStatus;
  decision: string;
  reason: string;
  createdAt: string;
}

export interface DocumentComment {
  id: number;
  documentId: number;
  userId: number;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
}

export interface DocumentRecord {
  id: number;
  docCode: string;
  title: string;
  description: string;
  categoryId: number;
  categoryName: string;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  documentType: string;
  academicYear: string;
  uploadedById: number;
  uploadedByName: string;
  status: DocumentStatus;
  confidentiality: ConfidentialityLevel;
  retentionPolicy: RetentionPolicy;
  retentionExpiresAt: string | null;
  tags: string[];
  currentVersion: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  downloadCount: number;
  viewCount: number;
  rejectionReason: string | null;
  archivedAt: string | null;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
  versions: DocumentVersion[];
  shares: DocumentShare[];
  approvals: DocumentApproval[];
  comments: DocumentComment[];
}

export interface ActivityLogEntry {
  id: number;
  userId: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  targetRef: string;
  targetTitle: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

export interface NotificationItem {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  documentId: number | null;
  isRead: boolean;
  createdAt: string;
}

export interface SystemSettings {
  id: number;
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
  updatedAt: string;
}

export interface BootstrapData {
  currentUser: UserAccount;
  roles: RoleRecord[];
  departments: Department[];
  categories: DocumentCategory[];
  users: UserAccount[];
  documents: DocumentRecord[];
  activityLogs: ActivityLogEntry[];
  notifications: NotificationItem[];
  systemSettings: SystemSettings;
}
