import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import { departments, roles, users } from '../src/db/schema.ts';
import { adminAuth } from '../src/lib/firebase-admin.ts';
import type { RoleName, RoleSlug, UserAccount } from '../src/types.ts';

const TOKEN_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`llcc-repo-${process.env.SQL_DB_NAME || 'local'}`).digest('hex');

export interface AuthenticatedRequest extends Request {
  authUser?: UserAccount;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function createSessionToken(userId: number, rememberMe = false): string {
  const ttlMs = (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000;
  const payload = {
    sub: userId,
    exp: Date.now() + ttlMs,
    jti: crypto.randomBytes(8).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): { sub: number; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      sub: number;
      exp: number;
    };
    if (!decoded.sub || !decoded.exp || Date.now() > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function loadUserAccountById(userId: number): Promise<UserAccount | null> {
  try {
    const rows = await db
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
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      uid: row.uid,
      username: row.username,
      email: row.email,
      fullName: row.fullName,
      roleId: row.roleId,
      roleSlug: row.roleSlug as RoleSlug,
      roleName: row.roleName as RoleName,
      departmentId: row.departmentId,
      departmentCode: row.departmentCode ?? null,
      departmentName: row.departmentName ?? null,
      avatarUrl: row.avatarUrl,
      isActive: row.isActive,
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  } catch (err) {
    console.error('Error loading user account:', err);
    throw new Error('Failed to verify user account.', { cause: err });
  }
}

async function resolveUserFromFirebaseUid(uid: string): Promise<UserAccount | null> {
  try {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);
    if (!rows[0]) return null;
    return loadUserAccountById(rows[0].id);
  } catch (err) {
    console.error('Error resolving Firebase UID:', err);
    throw new Error('Failed to verify authentication identity.', { cause: err });
  }
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : queryToken;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  try {
    const session = verifySessionToken(token);
    if (session) {
      const account = await loadUserAccountById(session.sub);
      if (!account) {
        res.status(401).json({ error: 'Account session is no longer valid.' });
        return;
      }
      if (!account.isActive) {
        res.status(403).json({ error: 'This account has been deactivated by an administrator.' });
        return;
      }
      req.authUser = account;
      next();
      return;
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const fbUser = await resolveUserFromFirebaseUid(decoded.uid);
    if (!fbUser) {
      res.status(401).json({ error: 'User account not registered in repository.' });
      return;
    }
    if (!fbUser.isActive) {
      res.status(403).json({ error: 'This account has been deactivated by an administrator.' });
      return;
    }
    req.authUser = fbUser;
    next();
  } catch (err) {
    console.error('Authentication failure:', err);
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

export function isSuperAdmin(user: UserAccount): boolean {
  return user.roleSlug === 'super_admin';
}

export function isDean(user: UserAccount): boolean {
  return user.roleSlug === 'dean';
}

export function isDepartmentHead(user: UserAccount): boolean {
  return user.roleSlug === 'department_head';
}

export function isStaff(user: UserAccount): boolean {
  return user.roleSlug === 'staff';
}

export function isStudent(user: UserAccount): boolean {
  return user.roleSlug === 'student';
}

export function canApproveDocuments(user: UserAccount): boolean {
  return (
    user.roleSlug === 'super_admin' ||
    user.roleSlug === 'dean' ||
    user.roleSlug === 'department_head'
  );
}

export function canManageDepartmentRepo(user: UserAccount): boolean {
  return user.roleSlug === 'super_admin' || user.roleSlug === 'department_head';
}

export function canUploadDocuments(user: UserAccount): boolean {
  return (
    user.roleSlug === 'super_admin' ||
    user.roleSlug === 'department_head' ||
    user.roleSlug === 'staff'
  );
}

export function canViewActivityLogs(user: UserAccount): boolean {
  return (
    user.roleSlug === 'super_admin' ||
    user.roleSlug === 'dean' ||
    user.roleSlug === 'department_head'
  );
}
