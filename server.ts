import express, { type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  type AuthenticatedRequest,
  canApproveDocuments,
  canManageDepartmentRepo,
  canUploadDocuments,
  canViewActivityLogs,
  createSessionToken,
  getClientIp,
  isSuperAdmin,
  requireAuth,
} from './server/auth.ts';
import {
  ForbiddenError,
  addDocumentCommentRecord,
  addDocumentVersionRecord,
  authenticateWithCredentials,
  authenticateWithFirebaseToken,
  changeOwnPasswordRecord,
  createCategoryRecord,
  createDepartmentRecord,
  createDocumentRecord,
  createDocumentShareRecord,
  createUserRecord,
  deleteCategoryRecord,
  deleteDepartmentRecord,
  deleteDocumentPermanentlyRecord,
  deleteUserRecord,
  exportActivityLogsCsv,
  getBootstrapForUser,
  getDocumentFilePayload,
  getSystemSettingsRecord,
  markAllNotificationsReadRecord,
  markNotificationReadRecord,
  recordDocumentFileAccess,
  recordLogoutEvent,
  resetUserPasswordByEmail,
  revokeDocumentShareRecord,
  transitionDocumentWorkflowRecord,
  updateCategoryRecord,
  updateDepartmentRecord,
  updateDocumentMetadataRecord,
  updateOwnProfileRecord,
  updateSystemSettingsRecord,
  updateUserRecord,
} from './server/dbRepository.ts';
import { getStoredFilePath } from './server/storage.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';

function sendRouteError(res: Response, err: unknown, fallbackMessage: string, defaultStatus = 400): void {
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message });
    return;
  }
  const msg = err instanceof Error ? err.message : fallbackMessage;
  res.status(defaultStatus).json({ error: msg });
}

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '35mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'llcc-document-repository' });
  });

  app.get('/api/public-settings', async (_req, res) => {
    try {
      const settings = await getSystemSettingsRecord();
      res.json({
        collegeName: settings.collegeName,
        systemTitle: settings.systemTitle,
        campusAddress: settings.campusAddress,
        academicYear: settings.academicYear,
        logoUrl: settings.logoUrl,
      });
    } catch (err) {
      console.error('Public settings error:', err);
      res.json({
        collegeName: 'Lapu-Lapu City College',
        systemTitle: 'LLCC Document Management Repository',
        campusAddress: 'Gun-ob, Lapu-Lapu City, Cebu',
        academicYear: 'AY 2026-2027',
        logoUrl: '/assets/aistudio/image_65e8ffc2.png',
      });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const body = req.body ?? {};
      const identifier =
        typeof body.identifier === 'string'
          ? body.identifier
          : typeof body.email === 'string'
            ? body.email
            : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const rememberMe = Boolean(body.rememberMe);

      if (!identifier.trim() || !password) {
        res.status(400).json({ error: 'Email or username and password are required.' });
        return;
      }

      const user = await authenticateWithCredentials(identifier, password, getClientIp(req));
      const token = createSessionToken(user.id, rememberMe);
      res.json({ user, token });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in.';
      res.status(401).json({ error: msg });
    }
  });

  app.post('/api/auth/firebase', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const idToken =
        authHeader && authHeader.startsWith('Bearer ')
          ? authHeader.slice('Bearer '.length).trim()
          : '';
      if (!idToken) {
        res.status(401).json({ error: 'Missing Google sign-in token.' });
        return;
      }
      const decoded = await adminAuth.verifyIdToken(idToken);
      const email = decoded.email || `${decoded.uid}@llcc.edu.ph`;
      const user = await authenticateWithFirebaseToken({
        uid: decoded.uid,
        email,
        displayName: decoded.name || email.split('@')[0] || 'LLCC User',
        avatarUrl: decoded.picture || null,
        ipAddress: getClientIp(req),
      });
      res.json({ user, token: idToken });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      res.status(401).json({ error: msg });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const body = req.body ?? {};
      const identifier = typeof body.identifier === 'string' ? body.identifier : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      if (!identifier.trim() || newPassword.length < 6) {
        res.status(400).json({ error: 'Provide your account email/username and a new password (min 6 chars).' });
        return;
      }
      const result = await resetUserPasswordByEmail(identifier, newPassword, getClientIp(req));
      res.json({ ok: true, email: result.email });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Password reset failed.' });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (req.authUser) {
        await recordLogoutEvent(req.authUser, getClientIp(req));
      }
      res.json({ ok: true });
    } catch {
      res.json({ ok: true });
    }
  });

  app.get('/api/bootstrap', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getBootstrapForUser(req.authUser!);
      res.json(data);
    } catch (err) {
      sendRouteError(res, err, 'Failed to load data.', 500);
    }
  });

  app.post('/api/documents', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      if (!canUploadDocuments(actor)) {
        res.status(403).json({ error: 'Your account role cannot upload repository documents.' });
        return;
      }

      const body = req.body ?? {};
      if (!body.title || !body.categoryId || !body.departmentId || !body.fileName) {
        res.status(400).json({ error: 'Title, category, department, and file are required.' });
        return;
      }

      const requestedStatus = body.status || 'Pending';
      if (requestedStatus === 'Approved' && !canApproveDocuments(actor)) {
        res.status(403).json({ error: 'Only Department Heads or Super Admin can publish directly as Approved.' });
        return;
      }

      const settings = await getSystemSettingsRecord();
      const ext = path.extname(String(body.fileName)).replace('.', '').toLowerCase();
      if (settings.allowedFormats.length > 0 && ext && !settings.allowedFormats.includes(ext)) {
        res.status(400).json({ error: `File format .${ext} is not permitted by repository settings.` });
        return;
      }

      const created = await createDocumentRecord(
        actor,
        {
          docCode: body.docCode,
          title: body.title,
          description: body.description || '',
          categoryId: Number(body.categoryId),
          departmentId: Number(body.departmentId),
          documentType: body.documentType || 'Official Record',
          academicYear: body.academicYear || settings.academicYear,
          status: requestedStatus,
          confidentiality: body.confidentiality || 'Internal',
          retentionPolicy: body.retentionPolicy || '5 Years',
          tags: Array.isArray(body.tags) ? body.tags : [],
          fileName: body.fileName,
          mimeType: body.mimeType || 'application/octet-stream',
          fileBase64: body.fileBase64,
          textContent: body.textContent,
        },
        getClientIp(req)
      );

      res.status(201).json(created);
    } catch (err) {
      sendRouteError(res, err, 'Failed to upload document.', 400);
    }
  });

  app.patch('/api/documents/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      if (!canUploadDocuments(actor)) {
        res.status(403).json({ error: 'Your role cannot modify document metadata.' });
        return;
      }
      const docId = Number(req.params.id);
      const body = req.body ?? {};
      await updateDocumentMetadataRecord(
        actor,
        docId,
        {
          title: body.title,
          description: body.description || '',
          categoryId: Number(body.categoryId),
          departmentId: Number(body.departmentId),
          documentType: body.documentType || 'Official Record',
          academicYear: body.academicYear || 'AY 2026-2027',
          confidentiality: body.confidentiality || 'Internal',
          retentionPolicy: body.retentionPolicy || '5 Years',
          tags: Array.isArray(body.tags) ? body.tags : [],
        },
        getClientIp(req)
      );
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to update metadata.');
    }
  });

  app.post('/api/documents/:id/versions', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      if (!canUploadDocuments(actor)) {
        res.status(403).json({ error: 'Your role cannot upload new document revisions.' });
        return;
      }
      const docId = Number(req.params.id);
      const body = req.body ?? {};
      if (!body.fileName) {
        res.status(400).json({ error: 'File name is required.' });
        return;
      }
      const versionNumber = await addDocumentVersionRecord(
        actor,
        docId,
        {
          versionBump: body.versionBump === 'major' ? 'major' : 'minor',
          fileName: body.fileName,
          mimeType: body.mimeType || 'application/octet-stream',
          fileBase64: body.fileBase64,
          textContent: body.textContent,
          changeNotes: body.changeNotes || '',
        },
        getClientIp(req)
      );
      res.status(201).json({ versionNumber });
    } catch (err) {
      sendRouteError(res, err, 'Failed to add version.');
    }
  });

  app.post('/api/documents/:id/workflow', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      const docId = Number(req.params.id);
      const body = req.body ?? {};
      const action = body.action as
        | 'submit'
        | 'start_review'
        | 'approve'
        | 'reject'
        | 'archive'
        | 'restore';

      if (action === 'submit') {
        if (!canUploadDocuments(actor)) {
          res.status(403).json({ error: 'Permission denied.' });
          return;
        }
      } else if (action === 'start_review' || action === 'approve' || action === 'reject') {
        if (!canApproveDocuments(actor)) {
          res.status(403).json({ error: 'Only the Dean, Department Head, or Super Admin can review or approve documents.' });
          return;
        }
      } else if (!canManageDepartmentRepo(actor)) {
        res.status(403).json({ error: 'Only the owning Department Head or Super Admin can archive or restore records.' });
        return;
      }

      if (action === 'reject' && (!body.reason || !String(body.reason).trim())) {
        res.status(400).json({ error: 'A rejection reason is required.' });
        return;
      }

      const status = await transitionDocumentWorkflowRecord(
        actor,
        docId,
        action,
        String(body.reason || ''),
        getClientIp(req)
      );
      res.json({ status });
    } catch (err) {
      sendRouteError(res, err, 'Workflow transition failed.');
    }
  });

  app.delete('/api/documents/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      if (!canManageDepartmentRepo(actor)) {
        res.status(403).json({ error: 'Only Department Heads or Super Admin can permanently delete documents.' });
        return;
      }
      await deleteDocumentPermanentlyRecord(actor, Number(req.params.id), getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Delete failed.');
    }
  });

  app.post('/api/documents/:id/shares', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      if (!canUploadDocuments(actor) && actor.roleSlug !== 'dean') {
        res.status(403).json({ error: 'Students cannot create document shares.' });
        return;
      }
      const body = req.body ?? {};
      await createDocumentShareRecord(
        actor,
        Number(req.params.id),
        {
          targetUserId: body.targetUserId ? Number(body.targetUserId) : null,
          targetDepartmentId: body.targetDepartmentId ? Number(body.targetDepartmentId) : null,
          targetRoleSlug: body.targetRoleSlug || null,
          permission: body.permission || 'view',
          expiresAt: body.expiresAt || null,
        },
        getClientIp(req)
      );
      res.status(201).json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Share failed.');
    }
  });

  app.delete('/api/shares/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      if (actor.roleSlug === 'student') {
        res.status(403).json({ error: 'Permission denied.' });
        return;
      }
      await revokeDocumentShareRecord(actor, Number(req.params.id), getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to revoke share.');
    }
  });

  app.post('/api/documents/:id/comments', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body ?? {};
      if (!body.body || !String(body.body).trim()) {
        res.status(400).json({ error: 'Comment text is required.' });
        return;
      }
      await addDocumentCommentRecord(
        req.authUser!,
        Number(req.params.id),
        String(body.body),
        getClientIp(req)
      );
      res.status(201).json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to add comment.');
    }
  });

  app.get('/api/documents/:id/file', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const docId = Number(req.params.id);
      const requestedVersion = typeof req.query.version === 'string' ? req.query.version : undefined;
      const isInline = req.query.inline === '1';
      const mode = isInline ? 'view' : 'download';
      const payload = await getDocumentFilePayload(
        req.authUser!,
        docId,
        requestedVersion,
        mode,
        getClientIp(req)
      );
      if (!payload) {
        res.status(404).json({ error: 'Document file not found.' });
        return;
      }
      const filePath = getStoredFilePath(payload.version.storageKey);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Stored file payload missing from disk.' });
        return;
      }

      await recordDocumentFileAccess(
        req.authUser ?? null,
        payload.doc,
        payload.version.versionNumber,
        mode,
        getClientIp(req)
      );

      res.setHeader('Content-Type', payload.version.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `${isInline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(payload.version.fileName)}"`
      );
      res.sendFile(filePath);
    } catch (err) {
      sendRouteError(res, err, 'File retrieval error.', 500);
    }
  });

  app.get('/api/documents/:id/content', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const docId = Number(req.params.id);
      const requestedVersion = typeof req.query.version === 'string' ? req.query.version : undefined;
      const payload = await getDocumentFilePayload(
        req.authUser!,
        docId,
        requestedVersion,
        'view',
        getClientIp(req)
      );
      if (!payload) {
        res.status(404).json({ error: 'Document content not found.' });
        return;
      }
      const filePath = getStoredFilePath(payload.version.storageKey);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'File payload missing from disk.' });
        return;
      }

      await recordDocumentFileAccess(
        req.authUser ?? null,
        payload.doc,
        payload.version.versionNumber,
        'view',
        getClientIp(req)
      );

      const content = fs.readFileSync(filePath, 'utf8');
      res.json({
        content,
        fileName: payload.version.fileName,
        mimeType: payload.version.mimeType,
      });
    } catch (err) {
      sendRouteError(res, err, 'Failed to load preview.', 500);
    }
  });

  app.post('/api/categories', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!canManageDepartmentRepo(req.authUser!)) {
        res.status(403).json({ error: 'Only Super Admin or Department Heads can manage categories.' });
        return;
      }
      const body = req.body ?? {};
      if (!body.name || !String(body.name).trim()) {
        res.status(400).json({ error: 'Category name is required.' });
        return;
      }
      await createCategoryRecord(
        req.authUser!,
        {
          name: String(body.name),
          description: String(body.description || ''),
          departmentId: body.departmentId ? Number(body.departmentId) : null,
        },
        getClientIp(req)
      );
      res.status(201).json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to add category.');
    }
  });

  app.patch('/api/categories/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!canManageDepartmentRepo(req.authUser!)) {
        res.status(403).json({ error: 'Only Super Admin or Department Heads can edit categories.' });
        return;
      }
      const body = req.body ?? {};
      await updateCategoryRecord(
        req.authUser!,
        Number(req.params.id),
        {
          name: String(body.name || ''),
          description: String(body.description || ''),
          departmentId: body.departmentId !== undefined ? (body.departmentId ? Number(body.departmentId) : null) : undefined,
        },
        getClientIp(req)
      );
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to update category.');
    }
  });

  app.delete('/api/categories/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!canManageDepartmentRepo(req.authUser!)) {
        res.status(403).json({ error: 'Only Super Admin or Department Heads can delete categories.' });
        return;
      }
      await deleteCategoryRecord(req.authUser!, Number(req.params.id), getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to delete category.');
    }
  });

  app.post('/api/departments', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isSuperAdmin(req.authUser!)) {
        res.status(403).json({ error: 'Only Super Administrators can create departments.' });
        return;
      }
      const body = req.body ?? {};
      if (!body.code || !body.name || !body.head) {
        res.status(400).json({ error: 'Department code, name, and head are required.' });
        return;
      }
      await createDepartmentRecord(
        req.authUser!,
        {
          code: body.code,
          name: body.name,
          head: body.head,
          description: body.description || '',
          retentionDefault: body.retentionDefault || '5 Years',
        },
        getClientIp(req)
      );
      res.status(201).json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to add department.');
    }
  });

  app.patch('/api/departments/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      const deptId = Number(req.params.id);
      if (!isSuperAdmin(actor) && !(actor.roleSlug === 'department_head' && actor.departmentId === deptId)) {
        res.status(403).json({ error: 'You can only update your own assigned department.' });
        return;
      }
      const body = req.body ?? {};
      await updateDepartmentRecord(
        actor,
        deptId,
        {
          code: body.code,
          name: body.name,
          head: body.head,
          description: body.description || '',
          retentionDefault: body.retentionDefault || '5 Years',
        },
        getClientIp(req)
      );
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to update department.');
    }
  });

  app.delete('/api/departments/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isSuperAdmin(req.authUser!)) {
        res.status(403).json({ error: 'Only Super Administrators can remove departments.' });
        return;
      }
      await deleteDepartmentRecord(req.authUser!, Number(req.params.id), getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to delete department.');
    }
  });

  app.post('/api/users', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!canManageDepartmentRepo(req.authUser!)) {
        res.status(403).json({ error: 'Only Super Admin or Department Heads can create user accounts.' });
        return;
      }
      const body = req.body ?? {};
      if (!body.fullName || !body.email || !body.username || !body.password) {
        res.status(400).json({ error: 'Full name, email, username, and password are required.' });
        return;
      }
      await createUserRecord(
        req.authUser!,
        {
          fullName: body.fullName,
          email: body.email,
          username: body.username,
          password: body.password,
          roleSlug: body.roleSlug || 'staff',
          departmentId: body.departmentId ? Number(body.departmentId) : null,
        },
        getClientIp(req)
      );
      res.status(201).json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to create user.');
    }
  });

  app.patch('/api/users/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!canManageDepartmentRepo(req.authUser!)) {
        res.status(403).json({ error: 'Only Super Admin or Department Heads can modify user accounts.' });
        return;
      }
      const body = req.body ?? {};
      await updateUserRecord(
        req.authUser!,
        Number(req.params.id),
        {
          fullName: body.fullName,
          email: body.email,
          username: body.username,
          roleSlug: body.roleSlug,
          departmentId: body.departmentId !== undefined ? (body.departmentId ? Number(body.departmentId) : null) : undefined,
          isActive: body.isActive,
          resetPassword: body.resetPassword,
        },
        getClientIp(req)
      );
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to update user.');
    }
  });

  app.delete('/api/users/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!canManageDepartmentRepo(req.authUser!)) {
        res.status(403).json({ error: 'Only Super Admin or Department Heads can delete user accounts.' });
        return;
      }
      await deleteUserRecord(req.authUser!, Number(req.params.id), getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to remove user.');
    }
  });

  app.patch('/api/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body ?? {};
      if (!body.fullName || !body.email) {
        res.status(400).json({ error: 'Full name and email are required.' });
        return;
      }
      const user = await updateOwnProfileRecord(
        req.authUser!,
        {
          fullName: String(body.fullName),
          email: String(body.email),
          avatarUrl: body.avatarUrl,
        },
        getClientIp(req)
      );
      res.json({ user });
    } catch (err) {
      sendRouteError(res, err, 'Failed to update profile.');
    }
  });

  app.post('/api/profile/password', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body ?? {};
      if (!body.currentPassword || !body.newPassword || String(body.newPassword).length < 6) {
        res.status(400).json({ error: 'Current password and new password (min 6 chars) are required.' });
        return;
      }
      await changeOwnPasswordRecord(
        req.authUser!,
        String(body.currentPassword),
        String(body.newPassword),
        getClientIp(req)
      );
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Failed to change password.');
    }
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await markNotificationReadRecord(req.authUser!.id, Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Update failed.', 500);
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await markAllNotificationsReadRecord(req.authUser!.id);
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, err, 'Update failed.', 500);
    }
  });

  app.patch('/api/settings', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isSuperAdmin(req.authUser!)) {
        res.status(403).json({ error: 'Only Super Administrators can update system settings.' });
        return;
      }
      const body = req.body ?? {};
      const updated = await updateSystemSettingsRecord(req.authUser!, body, getClientIp(req));
      res.json({ settings: updated });
    } catch (err) {
      sendRouteError(res, err, 'Failed to update settings.');
    }
  });

  app.get('/api/activity-logs/export', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!canViewActivityLogs(req.authUser!)) {
        res.status(403).json({ error: 'Only Super Admin, Dean, or Department Heads can export activity logs.' });
        return;
      }
      const csv = await exportActivityLogsCsv(req.authUser!);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="llcc_activity_logs.csv"');
      res.send(csv);
    } catch (err) {
      sendRouteError(res, err, 'Export failed.', 500);
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`LLCC Document Management Repository listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start LLCC Document Management Repository server:', err);
  process.exit(1);
});
