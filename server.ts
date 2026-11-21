import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  type AuthenticatedRequest,
  canUploadDocuments,
  createSessionToken,
  getClientIp,
  isAdminOrSuper,
  isSuperAdmin,
  requireAuth,
} from './server/auth.ts';
import {
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
      const identifier = typeof body.identifier === 'string' ? body.identifier : typeof body.email === 'string' ? body.email : '';
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
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load data.' });
    }
  });

  app.post('/api/documents', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      if (!canUploadDocuments(actor)) {
        res.status(403).json({ error: 'Student accounts cannot upload repository documents.' });
        return;
      }

      const body = req.body ?? {};
      if (!body.title || !body.categoryId || !body.departmentId || !body.fileName) {
        res.status(400).json({ error: 'Title, category, department, and file are required.' });
        return;
      }

      const requestedStatus = body.status || 'Draft';
      if (requestedStatus === 'Approved' && !isAdminOrSuper(actor)) {
        res.status(403).json({ error: 'Only Administrators can publish directly as Approved.' });
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
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to upload document.' });
    }
  });

  app.patch('/api/documents/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      if (!canUploadDocuments(actor)) {
        res.status(403).json({ error: 'Students cannot modify document metadata.' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update metadata.' });
    }
  });

  app.post('/api/documents/:id/versions', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      if (!canUploadDocuments(actor)) {
        res.status(403).json({ error: 'Students cannot upload new document revisions.' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to add version.' });
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
      } else if (!isAdminOrSuper(actor)) {
        res.status(403).json({ error: 'Only Administrators can perform review, approval, or archive actions.' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Workflow transition failed.' });
    }
  });

  app.delete('/api/documents/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      if (!isAdminOrSuper(actor)) {
        res.status(403).json({ error: 'Only Administrators can permanently delete documents.' });
        return;
      }
      await deleteDocumentPermanentlyRecord(actor, Number(req.params.id), getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Delete failed.' });
    }
  });

  app.post('/api/documents/:id/shares', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      if (!canUploadDocuments(actor)) {
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Share failed.' });
    }
  });

  app.delete('/api/shares/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authUser!;
      if (!canUploadDocuments(actor)) {
        res.status(403).json({ error: 'Permission denied.' });
        return;
      }
      await revokeDocumentShareRecord(actor, Number(req.params.id), getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to revoke share.' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to add comment.' });
    }
  });

  app.get('/api/documents/:id/file', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const docId = Number(req.params.id);
      const requestedVersion = typeof req.query.version === 'string' ? req.query.version : undefined;
      const payload = await getDocumentFilePayload(docId, requestedVersion);
      if (!payload) {
        res.status(404).json({ error: 'Document file not found.' });
        return;
      }
      const filePath = getStoredFilePath(payload.version.storageKey);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Stored file payload missing from disk.' });
        return;
      }

      const isInline = req.query.inline === '1';
      await recordDocumentFileAccess(
        req.authUser ?? null,
        payload.doc,
        payload.version.versionNumber,
        isInline ? 'view' : 'download',
        getClientIp(req)
      );

      res.setHeader('Content-Type', payload.version.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `${isInline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(payload.version.fileName)}"`
      );
      res.sendFile(filePath);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'File retrieval error.' });
    }
  });

  app.get('/api/documents/:id/content', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const docId = Number(req.params.id);
      const requestedVersion = typeof req.query.version === 'string' ? req.query.version : undefined;
      const payload = await getDocumentFilePayload(docId, requestedVersion);
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
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load preview.' });
    }
  });

  app.post('/api/categories', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isAdminOrSuper(req.authUser!)) {
        res.status(403).json({ error: 'Only Administrators can manage categories.' });
        return;
      }
      const body = req.body ?? {};
      if (!body.name || !String(body.name).trim()) {
        res.status(400).json({ error: 'Category name is required.' });
        return;
      }
      await createCategoryRecord(
        req.authUser!,
        { name: String(body.name), description: String(body.description || '') },
        getClientIp(req)
      );
      res.status(201).json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to add category.' });
    }
  });

  app.patch('/api/categories/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isAdminOrSuper(req.authUser!)) {
        res.status(403).json({ error: 'Only Administrators can edit categories.' });
        return;
      }
      const body = req.body ?? {};
      await updateCategoryRecord(
        req.authUser!,
        Number(req.params.id),
        { name: String(body.name || ''), description: String(body.description || '') },
        getClientIp(req)
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update category.' });
    }
  });

  app.delete('/api/categories/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isAdminOrSuper(req.authUser!)) {
        res.status(403).json({ error: 'Only Administrators can delete categories.' });
        return;
      }
      await deleteCategoryRecord(req.authUser!, Number(req.params.id), getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete category.' });
    }
  });

  app.post('/api/departments', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isAdminOrSuper(req.authUser!)) {
        res.status(403).json({ error: 'Only Administrators can create departments.' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to add department.' });
    }
  });

  app.patch('/api/departments/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isAdminOrSuper(req.authUser!)) {
        res.status(403).json({ error: 'Only Administrators can update departments.' });
        return;
      }
      const body = req.body ?? {};
      await updateDepartmentRecord(
        req.authUser!,
        Number(req.params.id),
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update department.' });
    }
  });

  app.delete('/api/departments/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isAdminOrSuper(req.authUser!)) {
        res.status(403).json({ error: 'Only Administrators can delete departments.' });
        return;
      }
      await deleteDepartmentRecord(req.authUser!, Number(req.params.id), getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete department.' });
    }
  });

  app.post('/api/users', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isAdminOrSuper(req.authUser!)) {
        res.status(403).json({ error: 'Only Administrators can create user accounts.' });
        return;
      }
      const body = req.body ?? {};
      if (!body.fullName || !body.email || !body.username || !body.password) {
        res.status(400).json({ error: 'Full name, email, username, and password are required.' });
        return;
      }
      if (body.roleSlug === 'super_admin' && !isSuperAdmin(req.authUser!)) {
        res.status(403).json({ error: 'Only a Super Admin can assign the SUPER ADMIN role.' });
        return;
      }
      await createUserRecord(
        req.authUser!,
        {
          fullName: body.fullName,
          email: body.email,
          username: body.username,
          password: body.password,
          roleSlug: body.roleSlug || 'faculty_staff',
          departmentId: body.departmentId ? Number(body.departmentId) : null,
        },
        getClientIp(req)
      );
      res.status(201).json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create user.' });
    }
  });

  app.patch('/api/users/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isAdminOrSuper(req.authUser!)) {
        res.status(403).json({ error: 'Only Administrators can modify user accounts.' });
        return;
      }
      const body = req.body ?? {};
      if (body.roleSlug === 'super_admin' && !isSuperAdmin(req.authUser!)) {
        res.status(403).json({ error: 'Only a Super Admin can promote users to SUPER ADMIN.' });
        return;
      }
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update user.' });
    }
  });

  app.delete('/api/users/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isAdminOrSuper(req.authUser!)) {
        res.status(403).json({ error: 'Only Administrators can delete user accounts.' });
        return;
      }
      await deleteUserRecord(req.authUser!, Number(req.params.id), getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to remove user.' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update profile.' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to change password.' });
    }
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await markNotificationReadRecord(req.authUser!.id, Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Update failed.' });
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await markAllNotificationsReadRecord(req.authUser!.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Update failed.' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update settings.' });
    }
  });

  app.get('/api/activity-logs/export', requireAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const csv = await exportActivityLogsCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="llcc_activity_logs.csv"');
      res.send(csv);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed.' });
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
