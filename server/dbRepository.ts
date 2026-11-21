import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import {
  activityLogs,
  departments,
  documentApprovals,
  documentCategories,
  documentComments,
  documentShares,
  documentVersions,
  documents,
  notifications,
  roles,
  systemSettings,
  users,
} from '../src/db/schema.ts';
import type {
  ActivityLogEntry,
  BootstrapData,
  ConfidentialityLevel,
  Department,
  DocumentApproval,
  DocumentCategory,
  DocumentComment,
  DocumentRecord,
  DocumentShare,
  DocumentStatus,
  DocumentVersion,
  NotificationItem,
  RetentionPolicy,
  RoleName,
  RoleRecord,
  RoleSlug,
  SharePermission,
  SystemSettings,
  UserAccount,
} from '../src/types.ts';
import { hashPassword, loadUserAccountById, verifyPassword } from './auth.ts';
import { ensureSeeded, getRoleIdBySlug } from './seed.ts';
import { deleteStoredFile, saveFileBuffer } from './storage.ts';

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type ShareRow = typeof documentShares.$inferSelect;
type DocRow = typeof documents.$inferSelect;

function getSharePermissionsForUser(
  shares: ShareRow[],
  actor: UserAccount
): { canView: boolean; canDownload: boolean; canEdit: boolean } {
  const now = Date.now();
  let canView = false;
  let canDownload = false;
  let canEdit = false;

  for (const s of shares) {
    if (s.revokedAt) continue;
    if (s.expiresAt && s.expiresAt.getTime() < now) continue;
    const matches =
      s.targetUserId === actor.id ||
      (actor.departmentId !== null && s.targetDepartmentId === actor.departmentId) ||
      s.targetRoleSlug === actor.roleSlug;
    if (!matches) continue;

    canView = true;
    if (s.permission === 'download' || s.permission === 'edit') {
      canDownload = true;
    }
    if (s.permission === 'edit') {
      canEdit = true;
    }
  }

  return { canView, canDownload, canEdit };
}

function canUserAccessDocRow(
  actor: UserAccount,
  doc: DocRow,
  shares: ShareRow[]
): boolean {
  const share = getSharePermissionsForUser(shares, actor);
  if (actor.roleSlug === 'super_admin' || actor.roleSlug === 'dean') {
    return true;
  }
  if (actor.roleSlug === 'department_head') {
    return (actor.departmentId !== null && doc.departmentId === actor.departmentId) || share.canView;
  }
  if (actor.roleSlug === 'staff') {
    if (share.canView) return true;
    if (doc.uploadedById === actor.id) return true;
    if (actor.departmentId !== null && doc.departmentId === actor.departmentId) {
      return doc.confidentiality !== 'Confidential';
    }
    return false;
  }
  // student
  return (doc.status === 'Approved' && doc.confidentiality === 'Internal') || share.canView;
}

function canUserModifyDocRow(
  actor: UserAccount,
  doc: DocRow,
  shares: ShareRow[]
): boolean {
  if (actor.roleSlug === 'super_admin') return true;
  if (actor.roleSlug === 'dean' || actor.roleSlug === 'student') return false;
  if (actor.roleSlug === 'department_head') {
    return actor.departmentId !== null && doc.departmentId === actor.departmentId;
  }
  // staff
  if (doc.uploadedById === actor.id) return true;
  const share = getSharePermissionsForUser(shares, actor);
  return share.canEdit;
}

function canUserApproveDocRow(actor: UserAccount, doc: DocRow): boolean {
  if (actor.roleSlug === 'super_admin' || actor.roleSlug === 'dean') return true;
  if (actor.roleSlug === 'department_head') {
    return actor.departmentId !== null && doc.departmentId === actor.departmentId;
  }
  return false;
}

function canUserArchiveOrDeleteDocRow(actor: UserAccount, doc: DocRow): boolean {
  if (actor.roleSlug === 'super_admin') return true;
  if (actor.roleSlug === 'department_head') {
    return actor.departmentId !== null && doc.departmentId === actor.departmentId;
  }
  return false;
}

async function logActivity(params: {
  userId: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  targetType?: string;
  targetId: string;
  targetRef: string;
  targetTitle: string;
  details: string;
  ipAddress: string;
}): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      userId: params.userId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: params.action,
      targetType: params.targetType || 'document',
      targetId: params.targetId,
      targetRef: params.targetRef,
      targetTitle: params.targetTitle,
      details: params.details,
      ipAddress: params.ipAddress,
    });
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
}

async function createNotification(params: {
  userId: number;
  type: string;
  title: string;
  message: string;
  documentId?: number | null;
}): Promise<void> {
  try {
    await db.insert(notifications).values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      documentId: params.documentId ?? null,
      isRead: false,
    });
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

export async function getSystemSettingsRecord(): Promise<SystemSettings> {
  try {
    await ensureSeeded();
    const rows = await db.select().from(systemSettings).limit(1);
    const s = rows[0];
    if (!s) {
      throw new Error('System settings missing.');
    }
    return {
      id: s.id,
      collegeName: s.collegeName,
      systemTitle: s.systemTitle,
      campusAddress: s.campusAddress,
      academicYear: s.academicYear,
      logoUrl: s.logoUrl,
      maxUploadMb: s.maxUploadMb,
      allowedFormats: Array.isArray(s.allowedFormats) ? s.allowedFormats : [],
      notifyOnUpload: s.notifyOnUpload,
      notifyOnApproval: s.notifyOnApproval,
      notifyOnShare: s.notifyOnShare,
      updatedAt: s.updatedAt.toISOString(),
    };
  } catch (err) {
    console.error('Failed to load system settings:', err);
    throw new Error('Unable to load system settings.', { cause: err });
  }
}

export async function authenticateWithCredentials(
  identifier: string,
  password: string,
  ipAddress: string
): Promise<UserAccount> {
  try {
    await ensureSeeded();
    const clean = identifier.trim().toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(or(ilike(users.email, clean), ilike(users.username, clean)))
      .limit(1);

    const userRow = rows[0];
    if (!userRow) {
      throw new Error('Invalid email/username or password.');
    }
    if (!userRow.isActive) {
      throw new Error('Your account is currently deactivated. Contact the Records Administrator.');
    }

    const valid = await verifyPassword(password, userRow.passwordHash);
    if (!valid) {
      throw new Error('Invalid email/username or password.');
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userRow.id));

    const account = await loadUserAccountById(userRow.id);
    if (!account) {
      throw new Error('Unable to load account profile.');
    }

    await logActivity({
      userId: account.id,
      actorName: account.fullName,
      actorRole: account.roleName,
      action: 'LOGIN',
      targetType: 'auth',
      targetId: String(account.id),
      targetRef: account.username,
      targetTitle: 'Portal Sign-In',
      details: `Signed in via institutional credentials (${account.email}).`,
      ipAddress,
    });

    return account;
  } catch (err) {
    if (err instanceof Error && !err.cause && (err.message.includes('Invalid') || err.message.includes('deactivated'))) {
      throw err;
    }
    console.error('Credentials authentication failed:', err);
    throw new Error('Authentication failed. Please try again.', { cause: err });
  }
}

export async function authenticateWithFirebaseToken(params: {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  ipAddress: string;
}): Promise<UserAccount> {
  try {
    await ensureSeeded();
    const cleanEmail = params.email.trim().toLowerCase();
    const existing = await db
      .select()
      .from(users)
      .where(or(eq(users.uid, params.uid), ilike(users.email, cleanEmail)))
      .limit(1);

    let userId: number;
    if (existing[0]) {
      if (!existing[0].isActive) {
        throw new Error('Your account is deactivated. Contact the Records Administrator.');
      }
      userId = existing[0].id;
      await db
        .update(users)
        .set({
          uid: params.uid,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
          avatarUrl: existing[0].avatarUrl || params.avatarUrl || null,
        })
        .where(eq(users.id, userId));
    } else {
      const roleSlug = cleanEmail.endsWith('@llcc.edu.ph') ? 'staff' : 'student';
      const roleId = await getRoleIdBySlug(roleSlug);
      const deptRows = await db.select().from(departments).limit(1);
      const baseUsername = slugify(cleanEmail.split('@')[0] || 'user') || `user${Date.now()}`;
      const randomPassHash = await hashPassword(`${params.uid}-${Date.now()}`);

      const upserted = await db
        .insert(users)
        .values({
          uid: params.uid,
          username: `${baseUsername}-${String(Date.now()).slice(-4)}`,
          email: cleanEmail,
          fullName: params.displayName || cleanEmail.split('@')[0] || 'LLCC User',
          passwordHash: randomPassHash,
          roleId,
          departmentId: deptRows[0]?.id ?? null,
          avatarUrl: params.avatarUrl || null,
          isActive: true,
          lastLoginAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: {
            email: cleanEmail,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning({ id: users.id });

      userId = upserted[0].id;
    }

    const account = await loadUserAccountById(userId);
    if (!account) {
      throw new Error('Failed to load authenticated user.');
    }

    await logActivity({
      userId: account.id,
      actorName: account.fullName,
      actorRole: account.roleName,
      action: 'LOGIN',
      targetType: 'auth',
      targetId: String(account.id),
      targetRef: account.username,
      targetTitle: 'Google SSO Sign-In',
      details: `Authenticated via Google Sign-In (${account.email}).`,
      ipAddress: params.ipAddress,
    });

    return account;
  } catch (err) {
    if (err instanceof Error && err.message.includes('deactivated')) {
      throw err;
    }
    console.error('Firebase user sync failed:', err);
    throw new Error('Google Sign-In verification failed.', { cause: err });
  }
}

export async function resetUserPasswordByEmail(
  identifier: string,
  newPassword: string,
  ipAddress: string
): Promise<{ email: string }> {
  try {
    await ensureSeeded();
    const clean = identifier.trim().toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(or(ilike(users.email, clean), ilike(users.username, clean)))
      .limit(1);

    const userRow = rows[0];
    if (!userRow) {
      throw new Error('No institutional account matches that email or username.');
    }

    const newHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, userRow.id));

    await logActivity({
      userId: userRow.id,
      actorName: userRow.fullName,
      actorRole: 'ACCOUNT_RECOVERY',
      action: 'PASSWORD_RESET',
      targetType: 'user',
      targetId: String(userRow.id),
      targetRef: userRow.username,
      targetTitle: 'Password Reset',
      details: `Password reset completed for ${userRow.email}.`,
      ipAddress,
    });

    await createNotification({
      userId: userRow.id,
      type: 'account',
      title: 'Password Updated',
      message: 'Your repository account password was successfully reset.',
    });

    return { email: userRow.email };
  } catch (err) {
    if (err instanceof Error && err.message.includes('No institutional account')) {
      throw err;
    }
    console.error('Password reset failed:', err);
    throw new Error('Unable to reset password.', { cause: err });
  }
}

export async function recordLogoutEvent(user: UserAccount, ipAddress: string): Promise<void> {
  await logActivity({
    userId: user.id,
    actorName: user.fullName,
    actorRole: user.roleName,
    action: 'LOGOUT',
    targetType: 'auth',
    targetId: String(user.id),
    targetRef: user.username,
    targetTitle: 'Portal Sign-Out',
    details: `${user.fullName} signed out of the repository.`,
    ipAddress,
  });
}

export async function getBootstrapForUser(currentUser: UserAccount): Promise<BootstrapData> {
  try {
    await ensureSeeded();

    const [
      roleRows,
      deptRows,
      catRows,
      userRows,
      docRows,
      versionRows,
      shareRows,
      approvalRows,
      commentRows,
      logRows,
      notifRows,
      settings,
    ] = await Promise.all([
      db.select().from(roles).orderBy(roles.id),
      db.select().from(departments).orderBy(departments.name),
      db.select().from(documentCategories).orderBy(documentCategories.name),
      db
        .select({
          id: users.id,
          uid: users.uid,
          username: users.username,
          email: users.email,
          fullName: users.fullName,
          roleId: users.roleId,
          roleSlug: roles.slug,
          roleName: roles.name,
          departmentId: users.departmentId,
          departmentCode: departments.code,
          departmentName: departments.name,
          avatarUrl: users.avatarUrl,
          isActive: users.isActive,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .leftJoin(departments, eq(users.departmentId, departments.id))
        .orderBy(users.fullName),
      db.select().from(documents).orderBy(desc(documents.updatedAt)),
      db.select().from(documentVersions).orderBy(desc(documentVersions.createdAt)),
      db.select().from(documentShares).orderBy(desc(documentShares.createdAt)),
      db.select().from(documentApprovals).orderBy(desc(documentApprovals.createdAt)),
      db.select().from(documentComments).orderBy(desc(documentComments.createdAt)),
      db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(250),
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, currentUser.id))
        .orderBy(desc(notifications.createdAt))
        .limit(50),
      getSystemSettingsRecord(),
    ]);

    const userMap = new Map<number, UserAccount>();
    const mappedUsers: UserAccount[] = userRows.map((u) => {
      const mapped: UserAccount = {
        id: u.id,
        uid: u.uid,
        username: u.username,
        email: u.email,
        fullName: u.fullName,
        roleId: u.roleId,
        roleSlug: u.roleSlug as RoleSlug,
        roleName: u.roleName as RoleName,
        departmentId: u.departmentId,
        departmentCode: u.departmentCode ?? null,
        departmentName: u.departmentName ?? null,
        avatarUrl: u.avatarUrl,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
      };
      userMap.set(u.id, mapped);
      return mapped;
    });

    const deptMap = new Map<number, Department>();
    const mappedDepts: Department[] = deptRows.map((d) => {
      const mapped: Department = {
        id: d.id,
        code: d.code,
        name: d.name,
        head: d.head,
        description: d.description,
        retentionDefault: d.retentionDefault as RetentionPolicy,
        createdAt: d.createdAt.toISOString(),
      };
      deptMap.set(d.id, mapped);
      return mapped;
    });

    const catMap = new Map<number, DocumentCategory>();
    const mappedCats: DocumentCategory[] = catRows.map((c) => {
      const catDept = c.departmentId ? deptMap.get(c.departmentId) : undefined;
      const mapped: DocumentCategory = {
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        departmentId: c.departmentId ?? null,
        departmentCode: catDept?.code ?? null,
        departmentName: catDept?.name ?? null,
        isSystem: c.isSystem,
        createdAt: c.createdAt.toISOString(),
      };
      catMap.set(c.id, mapped);
      return mapped;
    });

    const versionsByDoc = new Map<number, DocumentVersion[]>();
    for (const v of versionRows) {
      const list = versionsByDoc.get(v.documentId) ?? [];
      list.push({
        id: v.id,
        documentId: v.documentId,
        versionNumber: v.versionNumber,
        fileName: v.fileName,
        mimeType: v.mimeType,
        sizeBytes: v.sizeBytes,
        checksum: v.checksum,
        storageKey: v.storageKey,
        uploadedById: v.uploadedById,
        uploadedByName: userMap.get(v.uploadedById)?.fullName ?? 'LLCC Personnel',
        changeNotes: v.changeNotes,
        createdAt: v.createdAt.toISOString(),
      });
      versionsByDoc.set(v.documentId, list);
    }

    const sharesByDoc = new Map<number, DocumentShare[]>();
    for (const s of shareRows) {
      const list = sharesByDoc.get(s.documentId) ?? [];
      list.push({
        id: s.id,
        documentId: s.documentId,
        sharedById: s.sharedById,
        sharedByName: userMap.get(s.sharedById)?.fullName ?? 'LLCC Personnel',
        targetUserId: s.targetUserId,
        targetUserName: s.targetUserId ? (userMap.get(s.targetUserId)?.fullName ?? null) : null,
        targetDepartmentId: s.targetDepartmentId,
        targetDepartmentName: s.targetDepartmentId
          ? (deptMap.get(s.targetDepartmentId)?.name ?? null)
          : null,
        targetRoleSlug: (s.targetRoleSlug as RoleSlug | null) ?? null,
        permission: s.permission as SharePermission,
        expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
        revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
        createdAt: s.createdAt.toISOString(),
      });
      sharesByDoc.set(s.documentId, list);
    }

    const approvalsByDoc = new Map<number, DocumentApproval[]>();
    for (const a of approvalRows) {
      const list = approvalsByDoc.get(a.documentId) ?? [];
      list.push({
        id: a.id,
        documentId: a.documentId,
        reviewerId: a.reviewerId,
        reviewerName: userMap.get(a.reviewerId)?.fullName ?? 'Reviewer',
        fromStatus: a.fromStatus as DocumentStatus,
        toStatus: a.toStatus as DocumentStatus,
        decision: a.decision,
        reason: a.reason,
        createdAt: a.createdAt.toISOString(),
      });
      approvalsByDoc.set(a.documentId, list);
    }

    const commentsByDoc = new Map<number, DocumentComment[]>();
    for (const c of commentRows) {
      const author = userMap.get(c.userId);
      const list = commentsByDoc.get(c.documentId) ?? [];
      list.push({
        id: c.id,
        documentId: c.documentId,
        userId: c.userId,
        authorName: author?.fullName ?? 'LLCC Personnel',
        authorRole: author?.roleName ?? 'Staff',
        body: c.body,
        createdAt: c.createdAt.toISOString(),
      });
      commentsByDoc.set(c.documentId, list);
    }

    const rawSharesByDoc = new Map<number, ShareRow[]>();
    for (const s of shareRows) {
      const list = rawSharesByDoc.get(s.documentId) ?? [];
      list.push(s);
      rawSharesByDoc.set(s.documentId, list);
    }

    const mappedDocs: DocumentRecord[] = [];
    const accessibleDocIds = new Set<string>();
    const deptDocIdSet = new Set<string>();

    for (const d of docRows) {
      if (currentUser.departmentId !== null && d.departmentId === currentUser.departmentId) {
        deptDocIdSet.add(String(d.id));
      }

      const rawDocShares = rawSharesByDoc.get(d.id) ?? [];
      if (!canUserAccessDocRow(currentUser, d, rawDocShares)) continue;

      accessibleDocIds.add(String(d.id));
      const docShares = sharesByDoc.get(d.id) ?? [];
      const cat = catMap.get(d.categoryId);
      const dept = deptMap.get(d.departmentId);
      const owner = userMap.get(d.uploadedById);

      mappedDocs.push({
        id: d.id,
        docCode: d.docCode,
        title: d.title,
        description: d.description,
        categoryId: d.categoryId,
        categoryName: cat?.name ?? 'Other Documents',
        departmentId: d.departmentId,
        departmentCode: dept?.code ?? 'COT',
        departmentName: dept?.name ?? 'College of Technology',
        documentType: d.documentType,
        academicYear: d.academicYear,
        uploadedById: d.uploadedById,
        uploadedByName: owner?.fullName ?? 'LLCC Personnel',
        status: d.status as DocumentStatus,
        confidentiality: d.confidentiality as ConfidentialityLevel,
        retentionPolicy: d.retentionPolicy as RetentionPolicy,
        retentionExpiresAt: d.retentionExpiresAt ? d.retentionExpiresAt.toISOString() : null,
        tags: Array.isArray(d.tags) ? d.tags : [],
        currentVersion: d.currentVersion,
        fileName: d.fileName,
        mimeType: d.mimeType,
        fileSizeBytes: d.fileSizeBytes,
        downloadCount: d.downloadCount,
        viewCount: d.viewCount,
        rejectionReason: d.rejectionReason,
        archivedAt: d.archivedAt ? d.archivedAt.toISOString() : null,
        lastAccessedAt: d.lastAccessedAt ? d.lastAccessedAt.toISOString() : null,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        versions: versionsByDoc.get(d.id) ?? [],
        shares: docShares,
        approvals: approvalsByDoc.get(d.id) ?? [],
        comments: commentsByDoc.get(d.id) ?? [],
      });
    }

    const mappedRoles: RoleRecord[] = roleRows.map((r) => ({
      id: r.id,
      slug: r.slug as RoleSlug,
      name: r.name as RoleName,
      description: r.description,
    }));

    const deptUserIds = new Set(
      mappedUsers
        .filter((u) => currentUser.departmentId !== null && u.departmentId === currentUser.departmentId)
        .map((u) => u.id)
    );

    const visibleLogRows = logRows.filter((l) => {
      if (currentUser.roleSlug === 'super_admin' || currentUser.roleSlug === 'dean') {
        return true;
      }
      if (currentUser.roleSlug === 'department_head') {
        if (l.targetType === 'document' || l.targetType === 'share') {
          return deptDocIdSet.has(l.targetId) || accessibleDocIds.has(l.targetId);
        }
        return l.userId === currentUser.id || (l.userId !== null && deptUserIds.has(l.userId));
      }
      if (currentUser.roleSlug === 'staff') {
        if (l.targetType === 'document' || l.targetType === 'share') {
          return accessibleDocIds.has(l.targetId);
        }
        return l.userId === currentUser.id;
      }
      return l.userId === currentUser.id;
    });

    const mappedLogs: ActivityLogEntry[] = visibleLogRows.map((l) => ({
      id: l.id,
      userId: l.userId,
      actorName: l.actorName,
      actorRole: l.actorRole,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      targetRef: l.targetRef,
      targetTitle: l.targetTitle,
      details: l.details,
      ipAddress: l.ipAddress,
      createdAt: l.createdAt.toISOString(),
    }));

    const mappedNotifs: NotificationItem[] = notifRows.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      message: n.message,
      documentId: n.documentId,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }));

    return {
      currentUser,
      roles: mappedRoles,
      departments: mappedDepts,
      categories: mappedCats,
      users: mappedUsers,
      documents: mappedDocs,
      activityLogs: mappedLogs,
      notifications: mappedNotifs,
      systemSettings: settings,
    };
  } catch (err) {
    console.error('Bootstrap query failed:', err);
    throw new Error('Failed to load repository workspace data.', { cause: err });
  }
}

export async function createDocumentRecord(
  actor: UserAccount,
  input: {
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
  },
  ipAddress: string
): Promise<{ id: number; docCode: string }> {
  try {
    if (actor.roleSlug === 'student' || actor.roleSlug === 'dean') {
      throw new ForbiddenError('Your role is not authorized to upload new department documents.');
    }

    if (actor.roleSlug === 'department_head' && actor.departmentId !== input.departmentId) {
      throw new ForbiddenError(
        'Cross-department upload denied: Department Heads must publish within their assigned department.'
      );
    }

    if (input.status === 'Approved' && actor.roleSlug === 'staff') {
      throw new ForbiddenError('Staff submissions must go through Department Head or Dean approval.');
    }

    const deptRows = await db
      .select()
      .from(departments)
      .where(eq(departments.id, input.departmentId))
      .limit(1);
    if (!deptRows[0]) {
      throw new Error('Selected department (COT, HTM, or EDUC) does not exist.');
    }
    const deptCode = deptRows[0].code;
    const year = new Date().getFullYear();

    const countRes = await db.select({ count: sql<number>`count(*)::int` }).from(documents);
    const nextSeq = String((countRes[0]?.count ?? 0) + 1).padStart(3, '0');
    const docCode =
      (input.docCode || '').trim() || `LLCC-${deptCode}-${year}-${nextSeq}-${String(Date.now()).slice(-3)}`;

    const buffer = input.fileBase64
      ? Buffer.from(input.fileBase64, 'base64')
      : Buffer.from(input.textContent || `${input.title}\n\n${input.description}`, 'utf8');

    const saved = saveFileBuffer(input.fileName, buffer);
    const initialVersion = input.status === 'Approved' ? '1.0' : '1.0';
    const now = new Date();

    const [inserted] = await db
      .insert(documents)
      .values({
        docCode,
        title: input.title.trim(),
        description: input.description.trim(),
        categoryId: input.categoryId,
        departmentId: input.departmentId,
        documentType: input.documentType.trim() || 'Official Record',
        academicYear: input.academicYear.trim() || 'AY 2026-2027',
        uploadedById: actor.id,
        status: input.status,
        confidentiality: input.confidentiality,
        retentionPolicy: input.retentionPolicy,
        tags: input.tags,
        currentVersion: initialVersion,
        fileName: input.fileName,
        mimeType: input.mimeType || 'application/octet-stream',
        fileSizeBytes: saved.sizeBytes,
        downloadCount: 0,
        viewCount: 0,
        lastAccessedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await db.insert(documentVersions).values({
      documentId: inserted.id,
      versionNumber: initialVersion,
      fileName: input.fileName,
      mimeType: input.mimeType || 'application/octet-stream',
      sizeBytes: saved.sizeBytes,
      checksum: saved.checksum,
      storageKey: saved.storageKey,
      uploadedById: actor.id,
      changeNotes: 'Initial document upload',
      createdAt: now,
    });

    if (input.status === 'Pending' || input.status === 'Approved') {
      await db.insert(documentApprovals).values({
        documentId: inserted.id,
        reviewerId: actor.id,
        fromStatus: 'Draft',
        toStatus: input.status,
        decision: input.status === 'Approved' ? 'Approved' : 'Submitted',
        reason:
          input.status === 'Approved'
            ? 'Direct administrative publication'
            : 'Submitted for approval upon upload',
      });
    }

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'UPLOADED',
      targetType: 'document',
      targetId: String(inserted.id),
      targetRef: inserted.docCode,
      targetTitle: inserted.title,
      details: `Uploaded ${input.fileName} (v${initialVersion}) as ${input.status}.`,
      ipAddress,
    });

    await createNotification({
      userId: actor.id,
      type: 'upload',
      title: 'Document Uploaded',
      message: `${inserted.docCode} (${inserted.title}) was saved to the repository.`,
      documentId: inserted.id,
    });

    if (input.status === 'Pending') {
      const reviewers = await db
        .select({ id: users.id, roleSlug: roles.slug, departmentId: users.departmentId })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(
          or(
            eq(roles.slug, 'super_admin'),
            eq(roles.slug, 'dean'),
            eq(roles.slug, 'department_head')
          )
        );

      for (const rev of reviewers) {
        if (rev.id === actor.id) continue;
        if (rev.roleSlug === 'department_head' && rev.departmentId !== input.departmentId) continue;
        await createNotification({
          userId: rev.id,
          type: 'approval_request',
          title: `${deptCode} Approval Request`,
          message: `${actor.fullName} submitted ${inserted.docCode} (${inserted.title}) for review.`,
          documentId: inserted.id,
        });
      }
    }

    return { id: inserted.id, docCode: inserted.docCode };
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    console.error('Failed to create document:', err);
    throw new Error('Failed to upload and save document.', { cause: err });
  }
}

export async function updateDocumentMetadataRecord(
  actor: UserAccount,
  docId: number,
  input: {
    title: string;
    description: string;
    categoryId: number;
    departmentId: number;
    documentType: string;
    academicYear: string;
    confidentiality: ConfidentialityLevel;
    retentionPolicy: RetentionPolicy;
    tags: string[];
  },
  ipAddress: string
): Promise<void> {
  try {
    const existing = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
    const doc = existing[0];
    if (!doc) throw new Error('Document not found.');

    const shares = await db.select().from(documentShares).where(eq(documentShares.documentId, docId));
    if (!canUserModifyDocRow(actor, doc, shares)) {
      throw new ForbiddenError('You are not authorized to modify this document.');
    }

    const nextDeptId =
      actor.roleSlug === 'super_admin' ? input.departmentId : doc.departmentId;

    await db
      .update(documents)
      .set({
        title: input.title.trim(),
        description: input.description.trim(),
        categoryId: input.categoryId,
        departmentId: nextDeptId,
        documentType: input.documentType.trim(),
        academicYear: input.academicYear.trim(),
        confidentiality: input.confidentiality,
        retentionPolicy: input.retentionPolicy,
        tags: input.tags,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, docId));

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'EDITED',
      targetType: 'document',
      targetId: String(doc.id),
      targetRef: doc.docCode,
      targetTitle: input.title.trim(),
      details: `Updated document metadata, classification (${input.confidentiality}), and retention (${input.retentionPolicy}).`,
      ipAddress,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    if (err instanceof Error && err.message === 'Document not found.') throw err;
    console.error('Metadata update failed:', err);
    throw new Error('Failed to update document details.', { cause: err });
  }
}

export async function addDocumentVersionRecord(
  actor: UserAccount,
  docId: number,
  input: {
    versionBump: 'minor' | 'major';
    fileName: string;
    mimeType: string;
    fileBase64?: string;
    textContent?: string;
    changeNotes: string;
  },
  ipAddress: string
): Promise<string> {
  try {
    const existing = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
    const doc = existing[0];
    if (!doc) throw new Error('Document not found.');

    const shares = await db.select().from(documentShares).where(eq(documentShares.documentId, docId));
    if (!canUserModifyDocRow(actor, doc, shares)) {
      throw new ForbiddenError('You are not authorized to upload new versions for this document.');
    }

    const parts = doc.currentVersion.split('.');
    const major = Number.parseInt(parts[0] || '1', 10) || 1;
    const minor = Number.parseInt(parts[1] || '0', 10) || 0;
    const nextVersion = input.versionBump === 'major' ? `${major + 1}.0` : `${major}.${minor + 1}`;

    const buffer = input.fileBase64
      ? Buffer.from(input.fileBase64, 'base64')
      : Buffer.from(input.textContent || '', 'utf8');

    const saved = saveFileBuffer(input.fileName, buffer);
    const now = new Date();

    await db.insert(documentVersions).values({
      documentId: doc.id,
      versionNumber: nextVersion,
      fileName: input.fileName,
      mimeType: input.mimeType || 'application/octet-stream',
      sizeBytes: saved.sizeBytes,
      checksum: saved.checksum,
      storageKey: saved.storageKey,
      uploadedById: actor.id,
      changeNotes: input.changeNotes.trim() || `Uploaded revision v${nextVersion}`,
      createdAt: now,
    });

    await db
      .update(documents)
      .set({
        currentVersion: nextVersion,
        fileName: input.fileName,
        mimeType: input.mimeType || 'application/octet-stream',
        fileSizeBytes: saved.sizeBytes,
        updatedAt: now,
      })
      .where(eq(documents.id, doc.id));

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'VERSION_ADDED',
      targetType: 'document',
      targetId: String(doc.id),
      targetRef: doc.docCode,
      targetTitle: doc.title,
      details: `Uploaded file revision v${nextVersion} (${input.fileName}).`,
      ipAddress,
    });

    return nextVersion;
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    if (err instanceof Error && err.message === 'Document not found.') throw err;
    console.error('Version upload failed:', err);
    throw new Error('Failed to upload new file version.', { cause: err });
  }
}

export async function transitionDocumentWorkflowRecord(
  actor: UserAccount,
  docId: number,
  action: 'submit' | 'start_review' | 'approve' | 'reject' | 'archive' | 'restore',
  reason: string,
  ipAddress: string
): Promise<DocumentStatus> {
  try {
    const existing = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
    const doc = existing[0];
    if (!doc) throw new Error('Document not found.');

    if (action === 'submit') {
      const shares = await db.select().from(documentShares).where(eq(documentShares.documentId, docId));
      if (!canUserModifyDocRow(actor, doc, shares)) {
        throw new ForbiddenError('You can only submit documents belonging to your department.');
      }
    } else if (action === 'start_review' || action === 'approve' || action === 'reject') {
      if (!canUserApproveDocRow(actor, doc)) {
        throw new ForbiddenError(
          'Only the Academic Dean, assigned Department Head, or Super Admin can review or approve this document.'
        );
      }
    } else if (action === 'archive' || action === 'restore') {
      if (!canUserArchiveOrDeleteDocRow(actor, doc)) {
        throw new ForbiddenError(
          'Only the assigned Department Head or Super Admin can archive or restore this department document.'
        );
      }
    }

    const prevStatus = doc.status as DocumentStatus;
    let nextStatus: DocumentStatus = prevStatus;
    let decision = 'Updated';
    let logAction = 'UPDATED';

    if (action === 'submit') {
      nextStatus = 'Pending';
      decision = 'Submitted';
      logAction = 'SUBMITTED_REVIEW';
    } else if (action === 'start_review') {
      nextStatus = 'Under Review';
      decision = 'Under Review';
      logAction = 'UNDER_REVIEW';
    } else if (action === 'approve') {
      nextStatus = 'Approved';
      decision = 'Approved';
      logAction = 'APPROVED';
    } else if (action === 'reject') {
      nextStatus = 'Rejected';
      decision = 'Rejected';
      logAction = 'REJECTED';
    } else if (action === 'archive') {
      nextStatus = 'Archived';
      decision = 'Archived';
      logAction = 'ARCHIVED';
    } else if (action === 'restore') {
      nextStatus = 'Approved';
      decision = 'Restored';
      logAction = 'RESTORED';
    }

    const now = new Date();
    await db
      .update(documents)
      .set({
        status: nextStatus,
        rejectionReason: action === 'reject' ? reason.trim() : action === 'approve' || action === 'submit' ? null : doc.rejectionReason,
        archivedAt: action === 'archive' ? now : action === 'restore' ? null : doc.archivedAt,
        updatedAt: now,
      })
      .where(eq(documents.id, docId));

    await db.insert(documentApprovals).values({
      documentId: docId,
      reviewerId: actor.id,
      fromStatus: prevStatus,
      toStatus: nextStatus,
      decision,
      reason: reason.trim() || `${decision} by ${actor.fullName}`,
      createdAt: now,
    });

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: logAction,
      targetType: 'document',
      targetId: String(doc.id),
      targetRef: doc.docCode,
      targetTitle: doc.title,
      details: `${decision} (${prevStatus} → ${nextStatus})${reason.trim() ? `: ${reason.trim()}` : '.'}`,
      ipAddress,
    });

    if (doc.uploadedById !== actor.id && (action === 'approve' || action === 'reject' || action === 'archive')) {
      await createNotification({
        userId: doc.uploadedById,
        type: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'archived',
        title:
          action === 'approve'
            ? 'Document Approved'
            : action === 'reject'
            ? 'Document Rejected'
            : 'Document Archived',
        message:
          action === 'reject'
            ? `${doc.docCode} was rejected: ${reason.trim()}`
            : `${doc.docCode} status updated to ${nextStatus} by ${actor.fullName}.`,
        documentId: doc.id,
      });
    }

    if (action === 'submit') {
      const reviewers = await db
        .select({ id: users.id, roleSlug: roles.slug, departmentId: users.departmentId })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(
          or(
            eq(roles.slug, 'super_admin'),
            eq(roles.slug, 'dean'),
            eq(roles.slug, 'department_head')
          )
        );
      for (const rev of reviewers) {
        if (rev.id === actor.id) continue;
        if (rev.roleSlug === 'department_head' && rev.departmentId !== doc.departmentId) continue;
        await createNotification({
          userId: rev.id,
          type: 'approval_request',
          title: 'Pending Approval Request',
          message: `${actor.fullName} submitted ${doc.docCode} (${doc.title}) for review.`,
          documentId: doc.id,
        });
      }
    }

    return nextStatus;
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    if (err instanceof Error && err.message === 'Document not found.') throw err;
    console.error('Workflow transition failed:', err);
    throw new Error('Failed to update workflow status.', { cause: err });
  }
}

export async function deleteDocumentPermanentlyRecord(
  actor: UserAccount,
  docId: number,
  ipAddress: string
): Promise<void> {
  try {
    const existing = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
    const doc = existing[0];
    if (!doc) throw new Error('Document not found.');
    if (!canUserArchiveOrDeleteDocRow(actor, doc)) {
      throw new ForbiddenError('Only the owning Department Head or Super Admin can permanently delete this record.');
    }

    const versions = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, docId));

    for (const ver of versions) {
      deleteStoredFile(ver.storageKey);
    }

    await db.delete(documents).where(eq(documents.id, docId));

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'DELETED',
      targetType: 'document',
      targetId: String(doc.id),
      targetRef: doc.docCode,
      targetTitle: doc.title,
      details: `Permanently deleted document and ${versions.length} stored version(s).`,
      ipAddress,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    if (err instanceof Error && err.message === 'Document not found.') throw err;
    console.error('Permanent document delete failed:', err);
    throw new Error('Failed to delete document.', { cause: err });
  }
}

export async function createDocumentShareRecord(
  actor: UserAccount,
  docId: number,
  input: {
    targetUserId?: number | null;
    targetDepartmentId?: number | null;
    targetRoleSlug?: RoleSlug | null;
    permission: SharePermission;
    expiresAt?: string | null;
  },
  ipAddress: string
): Promise<void> {
  try {
    const existing = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
    const doc = existing[0];
    if (!doc) throw new Error('Document not found.');

    const shares = await db.select().from(documentShares).where(eq(documentShares.documentId, docId));
    if (!canUserModifyDocRow(actor, doc, shares) && actor.roleSlug !== 'dean') {
      throw new ForbiddenError('You are not authorized to share this document.');
    }

    const expiry = input.expiresAt ? new Date(input.expiresAt) : null;
    await db.insert(documentShares).values({
      documentId: docId,
      sharedById: actor.id,
      targetUserId: input.targetUserId ?? null,
      targetDepartmentId: input.targetDepartmentId ?? null,
      targetRoleSlug: input.targetRoleSlug ?? null,
      permission: input.permission,
      expiresAt: expiry,
    });

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'SHARED',
      targetType: 'share',
      targetId: String(doc.id),
      targetRef: doc.docCode,
      targetTitle: doc.title,
      details: `Shared with ${input.permission} access.`,
      ipAddress,
    });

    if (input.targetUserId) {
      await createNotification({
        userId: input.targetUserId,
        type: 'shared',
        title: 'Document Shared With You',
        message: `${actor.fullName} shared ${doc.docCode} (${doc.title}) with ${input.permission} access.`,
        documentId: doc.id,
      });
    }
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    if (err instanceof Error && err.message === 'Document not found.') throw err;
    console.error('Failed to share document:', err);
    throw new Error('Failed to share document.', { cause: err });
  }
}

export async function revokeDocumentShareRecord(
  actor: UserAccount,
  shareId: number,
  ipAddress: string
): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(documentShares)
      .where(eq(documentShares.id, shareId))
      .limit(1);
    const share = rows[0];
    if (!share) throw new Error('Share link not found.');

    const docRows = await db
      .select()
      .from(documents)
      .where(eq(documents.id, share.documentId))
      .limit(1);
    const doc = docRows[0];
    if (!doc) throw new Error('Document not found.');

    const canRevoke =
      actor.roleSlug === 'super_admin' ||
      share.sharedById === actor.id ||
      (actor.roleSlug === 'department_head' && doc.departmentId === actor.departmentId);
    if (!canRevoke) {
      throw new ForbiddenError('You are not authorized to revoke this share.');
    }

    await db
      .update(documentShares)
      .set({ revokedAt: new Date() })
      .where(eq(documentShares.id, shareId));

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'SHARE_REVOKED',
      targetType: 'share',
      targetId: String(share.documentId),
      targetRef: doc.docCode,
      targetTitle: doc.title,
      details: `Revoked sharing permission #${shareId}.`,
      ipAddress,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    if (err instanceof Error && (err.message === 'Share link not found.' || err.message === 'Document not found.')) throw err;
    console.error('Failed to revoke share:', err);
    throw new Error('Failed to revoke share access.', { cause: err });
  }
}

export async function addDocumentCommentRecord(
  actor: UserAccount,
  docId: number,
  body: string,
  ipAddress: string
): Promise<void> {
  try {
    const existing = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
    const doc = existing[0];
    if (!doc) throw new Error('Document not found.');

    const shares = await db.select().from(documentShares).where(eq(documentShares.documentId, docId));
    if (!canUserAccessDocRow(actor, doc, shares)) {
      throw new ForbiddenError('You do not have access to comment on this document.');
    }

    await db.insert(documentComments).values({
      documentId: docId,
      userId: actor.id,
      body: body.trim(),
    });

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'COMMENTED',
      targetType: 'document',
      targetId: String(doc.id),
      targetRef: doc.docCode,
      targetTitle: doc.title,
      details: `Added review comment on ${doc.docCode}.`,
      ipAddress,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    if (err instanceof Error && err.message === 'Document not found.') throw err;
    console.error('Failed to add comment:', err);
    throw new Error('Failed to post comment.', { cause: err });
  }
}

export async function getDocumentFilePayload(
  actor: UserAccount,
  docId: number,
  requestedVersion: string | undefined,
  mode: 'view' | 'download',
  ipAddress: string
): Promise<{
  doc: typeof documents.$inferSelect;
  version: typeof documentVersions.$inferSelect;
} | null> {
  try {
    const docRows = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
    const doc = docRows[0];
    if (!doc) return null;

    const shares = await db.select().from(documentShares).where(eq(documentShares.documentId, docId));
    if (!canUserAccessDocRow(actor, doc, shares)) {
      await logActivity({
        userId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.roleName,
        action: 'ACCESS_DENIED',
        targetType: 'document',
        targetId: String(doc.id),
        targetRef: doc.docCode,
        targetTitle: doc.title,
        details: `Blocked unauthorized cross-department or private access attempt.`,
        ipAddress,
      });
      throw new ForbiddenError('Access denied: you do not have permission to view this document.');
    }

    if (mode === 'download' && actor.roleSlug === 'student') {
      const share = getSharePermissionsForUser(shares, actor);
      const publicApproved = doc.status === 'Approved' && doc.confidentiality === 'Internal';
      if (!publicApproved && !share.canDownload) {
        throw new ForbiddenError('This shared document is restricted to view-only access.');
      }
    }

    const verRows = await db
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentId, docId),
          eq(documentVersions.versionNumber, requestedVersion || doc.currentVersion)
        )
      )
      .limit(1);

    let version = verRows[0];
    if (!version) {
      const latest = await db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, docId))
        .orderBy(desc(documentVersions.createdAt))
        .limit(1);
      version = latest[0];
    }

    if (!version) return null;
    return { doc, version };
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    console.error('Failed to retrieve file payload:', err);
    throw new Error('Failed to retrieve file version.', { cause: err });
  }
}

export async function recordDocumentFileAccess(
  actor: UserAccount | null,
  doc: typeof documents.$inferSelect,
  versionNumber: string,
  mode: 'view' | 'download',
  ipAddress: string
): Promise<void> {
  try {
    const now = new Date();
    if (mode === 'download') {
      await db
        .update(documents)
        .set({ downloadCount: doc.downloadCount + 1, lastAccessedAt: now })
        .where(eq(documents.id, doc.id));

      await logActivity({
        userId: actor?.id ?? null,
        actorName: actor?.fullName ?? 'Authorized User',
        actorRole: actor?.roleName ?? 'USER',
        action: 'DOWNLOADED',
        targetType: 'document',
        targetId: String(doc.id),
        targetRef: doc.docCode,
        targetTitle: doc.title,
        details: `Downloaded ${doc.fileName} (v${versionNumber}).`,
        ipAddress,
      });
    } else {
      await db
        .update(documents)
        .set({ viewCount: doc.viewCount + 1, lastAccessedAt: now })
        .where(eq(documents.id, doc.id));
    }
  } catch (err) {
    console.error('Failed to record file access:', err);
  }
}

export async function createCategoryRecord(
  actor: UserAccount,
  input: { name: string; description: string; departmentId?: number | null },
  ipAddress: string
): Promise<void> {
  try {
    let targetDeptId = input.departmentId ?? null;
    if (actor.roleSlug === 'department_head') {
      if (!actor.departmentId) {
        throw new ForbiddenError('Department Head must belong to an assigned department.');
      }
      targetDeptId = actor.departmentId;
    } else if (actor.roleSlug !== 'super_admin') {
      throw new ForbiddenError('Only Super Admin or Department Heads can create categories.');
    }

    const name = input.name.trim();
    const slug = slugify(targetDeptId ? `${targetDeptId}-${name}` : name);
    const [created] = await db
      .insert(documentCategories)
      .values({
        slug,
        name,
        description: input.description.trim(),
        departmentId: targetDeptId,
        isSystem: false,
      })
      .returning();

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'CATEGORY_CREATED',
      targetType: 'category',
      targetId: String(created.id),
      targetRef: created.slug.toUpperCase(),
      targetTitle: created.name,
      details: `Created document category "${created.name}".`,
      ipAddress,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    console.error('Failed to create category:', err);
    throw new Error('Failed to create category. Name may already exist.', { cause: err });
  }
}

export async function updateCategoryRecord(
  actor: UserAccount,
  id: number,
  input: { name: string; description: string; departmentId?: number | null },
  ipAddress: string
): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(documentCategories)
      .where(eq(documentCategories.id, id))
      .limit(1);
    const cat = existing[0];
    if (!cat) throw new Error('Category not found.');

    if (actor.roleSlug === 'department_head') {
      if (cat.departmentId !== actor.departmentId) {
        throw new ForbiddenError('Department Heads can only edit categories belonging to their own department.');
      }
    } else if (actor.roleSlug !== 'super_admin') {
      throw new ForbiddenError('Only Super Admin or owning Department Heads can edit categories.');
    }

    const name = input.name.trim();
    const nextDeptId =
      actor.roleSlug === 'super_admin' && input.departmentId !== undefined
        ? input.departmentId
        : cat.departmentId;

    await db
      .update(documentCategories)
      .set({
        name,
        slug: slugify(nextDeptId ? `${nextDeptId}-${name}` : name),
        description: input.description.trim(),
        departmentId: nextDeptId,
      })
      .where(eq(documentCategories.id, id));

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'CATEGORY_UPDATED',
      targetType: 'category',
      targetId: String(id),
      targetRef: 'CATEGORY',
      targetTitle: name,
      details: `Updated document category "${name}".`,
      ipAddress,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    if (err instanceof Error && err.message === 'Category not found.') throw err;
    console.error('Failed to update category:', err);
    throw new Error('Failed to update category.', { cause: err });
  }
}

export async function deleteCategoryRecord(
  actor: UserAccount,
  id: number,
  ipAddress: string
): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(documentCategories)
      .where(eq(documentCategories.id, id))
      .limit(1);
    const cat = existing[0];
    if (!cat) throw new Error('Category not found.');

    if (actor.roleSlug === 'department_head') {
      if (cat.departmentId !== actor.departmentId) {
        throw new ForbiddenError('Department Heads can only delete categories belonging to their own department.');
      }
    } else if (actor.roleSlug !== 'super_admin') {
      throw new ForbiddenError('Only Super Admin or owning Department Heads can delete categories.');
    }

    const inUse = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.categoryId, id))
      .limit(1);
    if (inUse.length > 0) {
      throw new Error('Cannot delete category while documents are assigned to it.');
    }

    await db.delete(documentCategories).where(eq(documentCategories.id, id));

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'CATEGORY_DELETED',
      targetType: 'category',
      targetId: String(id),
      targetRef: cat.slug.toUpperCase(),
      targetTitle: cat.name,
      details: `Deleted document category "${cat.name}".`,
      ipAddress,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    if (err instanceof Error && (err.message.includes('Cannot delete') || err.message.includes('not found'))) {
      throw err;
    }
    console.error('Failed to delete category:', err);
    throw new Error('Failed to delete category.', { cause: err });
  }
}

export async function createDepartmentRecord(
  actor: UserAccount,
  input: {
    code: string;
    name: string;
    head: string;
    description: string;
    retentionDefault: RetentionPolicy;
  },
  ipAddress: string
): Promise<void> {
  try {
    const code = input.code.trim().toUpperCase();
    const [created] = await db
      .insert(departments)
      .values({
        code,
        name: input.name.trim(),
        head: input.head.trim(),
        description: input.description.trim(),
        retentionDefault: input.retentionDefault,
      })
      .returning();

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'DEPARTMENT_CREATED',
      targetType: 'department',
      targetId: String(created.id),
      targetRef: created.code,
      targetTitle: created.name,
      details: `Registered department ${created.name} (${created.code}).`,
      ipAddress,
    });
  } catch (err) {
    console.error('Failed to create department:', err);
    throw new Error('Failed to register department. Code may already exist.', { cause: err });
  }
}

export async function updateDepartmentRecord(
  actor: UserAccount,
  id: number,
  input: {
    code: string;
    name: string;
    head: string;
    description: string;
    retentionDefault: RetentionPolicy;
  },
  ipAddress: string
): Promise<void> {
  try {
    const code = input.code.trim().toUpperCase();
    await db
      .update(departments)
      .set({
        code,
        name: input.name.trim(),
        head: input.head.trim(),
        description: input.description.trim(),
        retentionDefault: input.retentionDefault,
      })
      .where(eq(departments.id, id));

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'DEPARTMENT_UPDATED',
      targetType: 'department',
      targetId: String(id),
      targetRef: code,
      targetTitle: input.name.trim(),
      details: `Updated department ${input.name.trim()} (${code}).`,
      ipAddress,
    });
  } catch (err) {
    console.error('Failed to update department:', err);
    throw new Error('Failed to update department.', { cause: err });
  }
}

export async function deleteDepartmentRecord(
  actor: UserAccount,
  id: number,
  ipAddress: string
): Promise<void> {
  try {
    const inUse = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.departmentId, id))
      .limit(1);
    if (inUse.length > 0) {
      throw new Error('Cannot remove department while documents belong to it.');
    }
    const existing = await db.select().from(departments).where(eq(departments.id, id)).limit(1);
    const dept = existing[0];
    if (!dept) throw new Error('Department not found.');

    await db.delete(departments).where(eq(departments.id, id));

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'DEPARTMENT_DELETED',
      targetType: 'department',
      targetId: String(id),
      targetRef: dept.code,
      targetTitle: dept.name,
      details: `Removed department ${dept.name} (${dept.code}).`,
      ipAddress,
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes('Cannot remove') || err.message.includes('not found'))) {
      throw err;
    }
    console.error('Failed to delete department:', err);
    throw new Error('Failed to remove department.', { cause: err });
  }
}

export async function createUserRecord(
  actor: UserAccount,
  input: {
    fullName: string;
    email: string;
    username: string;
    password: string;
    roleSlug: RoleSlug;
    departmentId: number | null;
  },
  ipAddress: string
): Promise<void> {
  try {
    if (actor.roleSlug === 'department_head') {
      if (input.roleSlug !== 'staff' && input.roleSlug !== 'student') {
        throw new ForbiddenError('Department Heads can only create Staff or Student accounts.');
      }
      if (!actor.departmentId || input.departmentId !== actor.departmentId) {
        throw new ForbiddenError('Department Heads can only provision users within their assigned department.');
      }
    } else if (actor.roleSlug !== 'super_admin') {
      throw new ForbiddenError('Only Super Admin or Department Heads can create user accounts.');
    }

    const roleId = await getRoleIdBySlug(input.roleSlug);
    const passwordHash = await hashPassword(input.password);
    const [created] = await db
      .insert(users)
      .values({
        fullName: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        username: input.username.trim().toLowerCase(),
        passwordHash,
        roleId,
        departmentId: input.departmentId,
        isActive: true,
      })
      .returning();

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'USER_CREATED',
      targetType: 'user',
      targetId: String(created.id),
      targetRef: created.username,
      targetTitle: created.fullName,
      details: `Provisioned account ${created.email} (${input.roleSlug}).`,
      ipAddress,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    console.error('Failed to create user:', err);
    throw new Error('Failed to create user. Email or username may already be registered.', { cause: err });
  }
}

export async function updateUserRecord(
  actor: UserAccount,
  userId: number,
  input: {
    fullName?: string;
    email?: string;
    username?: string;
    roleSlug?: RoleSlug;
    departmentId?: number | null;
    isActive?: boolean;
    resetPassword?: string;
  },
  ipAddress: string
): Promise<void> {
  try {
    const existing = await loadUserAccountById(userId);
    if (!existing) throw new Error('User account not found.');

    if (actor.roleSlug === 'department_head') {
      if (existing.departmentId !== actor.departmentId) {
        throw new ForbiddenError('You can only manage users assigned to your department.');
      }
      if (existing.roleSlug !== 'staff' && existing.roleSlug !== 'student') {
        throw new ForbiddenError('Department Heads cannot modify executive or Dean accounts.');
      }
      if (input.roleSlug && input.roleSlug !== 'staff' && input.roleSlug !== 'student') {
        throw new ForbiddenError('Department Heads can only assign Staff or Student roles.');
      }
      if (input.departmentId !== undefined && input.departmentId !== actor.departmentId) {
        throw new ForbiddenError('Department Heads cannot reassign users to another department.');
      }
    } else if (actor.roleSlug !== 'super_admin') {
      throw new ForbiddenError('Only Super Admin or Department Heads can update user accounts.');
    }

    const updates: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.fullName !== undefined) updates.fullName = input.fullName.trim();
    if (input.email !== undefined) updates.email = input.email.trim().toLowerCase();
    if (input.username !== undefined) updates.username = input.username.trim().toLowerCase();
    if (input.departmentId !== undefined) updates.departmentId = input.departmentId;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.roleSlug !== undefined) updates.roleId = await getRoleIdBySlug(input.roleSlug);
    if (input.resetPassword && input.resetPassword.trim().length >= 6) {
      updates.passwordHash = await hashPassword(input.resetPassword.trim());
    }

    await db.update(users).set(updates).where(eq(users.id, userId));

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'USER_UPDATED',
      targetType: 'user',
      targetId: String(userId),
      targetRef: existing.username,
      targetTitle: input.fullName || existing.fullName,
      details: `Updated account properties${input.resetPassword ? ' and reset password' : ''}${
        input.isActive !== undefined ? ` (active: ${input.isActive})` : ''
      }.`,
      ipAddress,
    });

    await createNotification({
      userId,
      type: 'account',
      title: 'Account Updated',
      message: `Your user profile or permissions were updated by ${actor.fullName}.`,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    if (err instanceof Error && err.message === 'User account not found.') throw err;
    console.error('Failed to update user:', err);
    throw new Error('Failed to update user account.', { cause: err });
  }
}

export async function deleteUserRecord(
  actor: UserAccount,
  userId: number,
  ipAddress: string
): Promise<void> {
  try {
    if (actor.id === userId) {
      throw new Error('You cannot delete your own active administrator account.');
    }
    const existing = await loadUserAccountById(userId);
    if (!existing) throw new Error('User account not found.');

    if (actor.roleSlug === 'department_head') {
      if (
        existing.departmentId !== actor.departmentId ||
        (existing.roleSlug !== 'staff' && existing.roleSlug !== 'student')
      ) {
        throw new ForbiddenError('Department Heads can only remove Staff or Student accounts in their own department.');
      }
    } else if (actor.roleSlug !== 'super_admin') {
      throw new ForbiddenError('Only Super Admin or Department Heads can delete user accounts.');
    }

    const ownedDocs = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.uploadedById, userId))
      .limit(1);
    if (ownedDocs.length > 0) {
      await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, userId));
      await logActivity({
        userId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.roleName,
        action: 'USER_DEACTIVATED',
        targetType: 'user',
        targetId: String(userId),
        targetRef: existing.username,
        targetTitle: existing.fullName,
        details: 'Deactivated account with existing document authorship.',
        ipAddress,
      });
      return;
    }

    await db.delete(users).where(eq(users.id, userId));
    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'USER_DELETED',
      targetType: 'user',
      targetId: String(userId),
      targetRef: existing.username,
      targetTitle: existing.fullName,
      details: `Removed user account ${existing.email}.`,
      ipAddress,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    if (err instanceof Error && (err.message.includes('cannot delete') || err.message.includes('not found'))) {
      throw err;
    }
    console.error('Failed to delete user:', err);
    throw new Error('Failed to remove user account.', { cause: err });
  }
}

export async function updateOwnProfileRecord(
  actor: UserAccount,
  input: { fullName: string; email: string; avatarUrl?: string | null },
  ipAddress: string
): Promise<UserAccount> {
  try {
    await db
      .update(users)
      .set({
        fullName: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        avatarUrl: input.avatarUrl !== undefined ? input.avatarUrl : actor.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, actor.id));

    await logActivity({
      userId: actor.id,
      actorName: input.fullName.trim(),
      actorRole: actor.roleName,
      action: 'PROFILE_UPDATED',
      targetType: 'user',
      targetId: String(actor.id),
      targetRef: actor.username,
      targetTitle: input.fullName.trim(),
      details: 'Updated personal profile information.',
      ipAddress,
    });

    const updated = await loadUserAccountById(actor.id);
    if (!updated) throw new Error('Profile not found.');
    return updated;
  } catch (err) {
    console.error('Profile update failed:', err);
    throw new Error('Failed to update profile.', { cause: err });
  }
}

export async function changeOwnPasswordRecord(
  actor: UserAccount,
  currentPassword: string,
  newPassword: string,
  ipAddress: string
): Promise<void> {
  try {
    const rows = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
    const userRow = rows[0];
    if (!userRow) throw new Error('User not found.');

    const valid = await verifyPassword(currentPassword, userRow.passwordHash);
    if (!valid) {
      throw new Error('Current password is incorrect.');
    }

    const newHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, actor.id));

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'PASSWORD_CHANGED',
      targetType: 'user',
      targetId: String(actor.id),
      targetRef: actor.username,
      targetTitle: actor.fullName,
      details: 'Changed account password.',
      ipAddress,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Current password')) throw err;
    console.error('Password change failed:', err);
    throw new Error('Failed to change password.', { cause: err });
  }
}

export async function markNotificationReadRecord(userId: number, notifId: number): Promise<void> {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, notifId), eq(notifications.userId, userId)));
  } catch (err) {
    console.error('Failed to mark notification read:', err);
    throw new Error('Failed to update notification.', { cause: err });
  }
}

export async function markAllNotificationsReadRecord(userId: number): Promise<void> {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  } catch (err) {
    console.error('Failed to mark all notifications read:', err);
    throw new Error('Failed to mark notifications read.', { cause: err });
  }
}

export async function updateSystemSettingsRecord(
  actor: UserAccount,
  input: {
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
  },
  ipAddress: string
): Promise<SystemSettings> {
  try {
    const existing = await getSystemSettingsRecord();
    const [updated] = await db
      .update(systemSettings)
      .set({
        collegeName: input.collegeName.trim(),
        systemTitle: input.systemTitle.trim(),
        campusAddress: input.campusAddress.trim(),
        academicYear: input.academicYear.trim(),
        logoUrl: input.logoUrl.trim() || '/assets/aistudio/image_65e8ffc2.png',
        maxUploadMb: Math.max(1, Math.min(100, Number(input.maxUploadMb) || 20)),
        allowedFormats: input.allowedFormats.map((f) => f.trim().toLowerCase()).filter(Boolean),
        notifyOnUpload: input.notifyOnUpload,
        notifyOnApproval: input.notifyOnApproval,
        notifyOnShare: input.notifyOnShare,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, existing.id))
      .returning();

    await logActivity({
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roleName,
      action: 'SETTINGS_UPDATED',
      targetType: 'settings',
      targetId: String(updated.id),
      targetRef: 'SYSTEM',
      targetTitle: updated.systemTitle,
      details: 'Updated institutional repository settings and upload rules.',
      ipAddress,
    });

    return {
      id: updated.id,
      collegeName: updated.collegeName,
      systemTitle: updated.systemTitle,
      campusAddress: updated.campusAddress,
      academicYear: updated.academicYear,
      logoUrl: updated.logoUrl,
      maxUploadMb: updated.maxUploadMb,
      allowedFormats: updated.allowedFormats,
      notifyOnUpload: updated.notifyOnUpload,
      notifyOnApproval: updated.notifyOnApproval,
      notifyOnShare: updated.notifyOnShare,
      updatedAt: updated.updatedAt.toISOString(),
    };
  } catch (err) {
    console.error('Failed to update system settings:', err);
    throw new Error('Failed to save system settings.', { cause: err });
  }
}

export async function exportActivityLogsCsv(actor: UserAccount): Promise<string> {
  try {
    await ensureSeeded();
    if (
      actor.roleSlug !== 'super_admin' &&
      actor.roleSlug !== 'dean' &&
      actor.roleSlug !== 'department_head'
    ) {
      throw new ForbiddenError('Only Super Admin, Dean, or Department Heads can export activity logs.');
    }

    const [rows, docRows, deptUsers] = await Promise.all([
      db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(1000),
      actor.roleSlug === 'department_head' && actor.departmentId
        ? db
            .select({ id: documents.id })
            .from(documents)
            .where(eq(documents.departmentId, actor.departmentId))
        : Promise.resolve([]),
      actor.roleSlug === 'department_head' && actor.departmentId
        ? db.select({ id: users.id }).from(users).where(eq(users.departmentId, actor.departmentId))
        : Promise.resolve([]),
    ]);

    const deptDocIds = new Set(docRows.map((d) => String(d.id)));
    const deptUserIds = new Set(deptUsers.map((u) => u.id));

    const scopedRows =
      actor.roleSlug === 'department_head'
        ? rows.filter((r) => {
            if (r.targetType === 'document' || r.targetType === 'share') {
              return deptDocIds.has(r.targetId);
            }
            return r.userId === actor.id || (r.userId !== null && deptUserIds.has(r.userId));
          })
        : rows;

    const escapeCsv = (val: string) => `"${String(val).replaceAll('"', '""')}"`;
    const header = [
      'Timestamp',
      'User',
      'Role',
      'Action',
      'Reference',
      'Document / Target',
      'Details',
      'IP Address',
    ].join(',');
    const lines = scopedRows.map((r) =>
      [
        escapeCsv(r.createdAt.toISOString()),
        escapeCsv(r.actorName),
        escapeCsv(r.actorRole),
        escapeCsv(r.action),
        escapeCsv(r.targetRef),
        escapeCsv(r.targetTitle),
        escapeCsv(r.details),
        escapeCsv(r.ipAddress),
      ].join(',')
    );
    return [header, ...lines].join('\n');
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    console.error('Audit CSV export failed:', err);
    throw new Error('Failed to export activity logs.', { cause: err });
  }
}
