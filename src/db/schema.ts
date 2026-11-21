import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: serial('id').primaryKey(),
    roleId: integer('role_id')
      .references(() => roles.id, { onDelete: 'cascade' })
      .notNull(),
    permissionId: integer('permission_id')
      .references(() => permissions.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [uniqueIndex('role_permissions_pair_idx').on(table.roleId, table.permissionId)]
);

export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  head: text('head').notNull(),
  description: text('description').notNull().default(''),
  retentionDefault: text('retention_default').notNull().default('5 Years'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').unique(),
    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    roleId: integer('role_id')
      .references(() => roles.id, { onDelete: 'restrict' })
      .notNull(),
    departmentId: integer('department_id')
      .references(() => departments.id, { onDelete: 'set null' }),
    avatarUrl: text('avatar_url'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('users_role_idx').on(table.roleId),
    index('users_department_idx').on(table.departmentId),
  ]
);

export const documentCategories = pgTable('document_categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documents = pgTable(
  'documents',
  {
    id: serial('id').primaryKey(),
    docCode: text('doc_code').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    categoryId: integer('category_id')
      .references(() => documentCategories.id, { onDelete: 'restrict' })
      .notNull(),
    departmentId: integer('department_id')
      .references(() => departments.id, { onDelete: 'restrict' })
      .notNull(),
    documentType: text('document_type').notNull().default('Official Record'),
    academicYear: text('academic_year').notNull().default('AY 2026-2027'),
    uploadedById: integer('uploaded_by_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    status: text('status').notNull().default('Draft'),
    confidentiality: text('confidentiality').notNull().default('Internal'),
    retentionPolicy: text('retention_policy').notNull().default('5 Years'),
    retentionExpiresAt: timestamp('retention_expires_at'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    currentVersion: text('current_version').notNull().default('1.0'),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull().default(0),
    downloadCount: integer('download_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    rejectionReason: text('rejection_reason'),
    archivedAt: timestamp('archived_at'),
    lastAccessedAt: timestamp('last_accessed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('documents_status_idx').on(table.status),
    index('documents_category_idx').on(table.categoryId),
    index('documents_department_idx').on(table.departmentId),
    index('documents_uploaded_by_idx').on(table.uploadedById),
  ]
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    versionNumber: text('version_number').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    checksum: text('checksum').notNull(),
    storageKey: text('storage_key').notNull(),
    uploadedById: integer('uploaded_by_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    changeNotes: text('change_notes').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('doc_versions_doc_idx').on(table.documentId)]
);

export const documentShares = pgTable(
  'document_shares',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    sharedById: integer('shared_by_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    targetUserId: integer('target_user_id').references(() => users.id, { onDelete: 'cascade' }),
    targetDepartmentId: integer('target_department_id').references(() => departments.id, {
      onDelete: 'cascade',
    }),
    targetRoleSlug: text('target_role_slug'),
    permission: text('permission').notNull().default('view'),
    expiresAt: timestamp('expires_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('doc_shares_doc_idx').on(table.documentId),
    index('doc_shares_target_user_idx').on(table.targetUserId),
  ]
);

export const documentApprovals = pgTable(
  'document_approvals',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    reviewerId: integer('reviewer_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    decision: text('decision').notNull(),
    reason: text('reason').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('doc_approvals_doc_idx').on(table.documentId)]
);

export const documentComments = pgTable(
  'document_comments',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('doc_comments_doc_idx').on(table.documentId)]
);

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull().default('document'),
    targetId: text('target_id').notNull(),
    targetRef: text('target_ref').notNull(),
    targetTitle: text('target_title').notNull(),
    details: text('details').notNull(),
    ipAddress: text('ip_address').notNull().default('127.0.0.1'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('activity_logs_action_idx').on(table.action),
    index('activity_logs_created_idx').on(table.createdAt),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    documentId: integer('document_id').references(() => documents.id, { onDelete: 'set null' }),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('notifications_user_idx').on(table.userId)]
);

export const systemSettings = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  collegeName: text('college_name').notNull().default('Lapu-Lapu City College'),
  systemTitle: text('system_title').notNull().default('LLCC Document Management Repository'),
  campusAddress: text('campus_address').notNull().default('Gun-ob, Lapu-Lapu City, Cebu'),
  academicYear: text('academic_year').notNull().default('AY 2026-2027'),
  logoUrl: text('logo_url').notNull().default('/assets/aistudio/image_65e8ffc2.png'),
  maxUploadMb: integer('max_upload_mb').notNull().default(20),
  allowedFormats: jsonb('allowed_formats')
    .$type<string[]>()
    .notNull()
    .default(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'csv', 'txt', 'md']),
  notifyOnUpload: boolean('notify_on_upload').notNull().default(true),
  notifyOnApproval: boolean('notify_on_approval').notNull().default(true),
  notifyOnShare: boolean('notify_on_share').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  rolePermissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  users: many(users),
  documents: many(documents),
  shares: many(documentShares),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
  documents: many(documents),
  notifications: many(notifications),
  comments: many(documentComments),
}));

export const documentCategoriesRelations = relations(documentCategories, ({ many }) => ({
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  category: one(documentCategories, {
    fields: [documents.categoryId],
    references: [documentCategories.id],
  }),
  department: one(departments, {
    fields: [documents.departmentId],
    references: [departments.id],
  }),
  uploadedBy: one(users, {
    fields: [documents.uploadedById],
    references: [users.id],
  }),
  versions: many(documentVersions),
  shares: many(documentShares),
  approvals: many(documentApprovals),
  comments: many(documentComments),
}));

export const documentVersionsRelations = relations(documentVersions, ({ one }) => ({
  document: one(documents, {
    fields: [documentVersions.documentId],
    references: [documents.id],
  }),
  uploadedBy: one(users, {
    fields: [documentVersions.uploadedById],
    references: [users.id],
  }),
}));

export const documentSharesRelations = relations(documentShares, ({ one }) => ({
  document: one(documents, {
    fields: [documentShares.documentId],
    references: [documents.id],
  }),
  sharedBy: one(users, {
    fields: [documentShares.sharedById],
    references: [users.id],
  }),
  targetUser: one(users, {
    fields: [documentShares.targetUserId],
    references: [users.id],
  }),
  targetDepartment: one(departments, {
    fields: [documentShares.targetDepartmentId],
    references: [departments.id],
  }),
}));

export const documentApprovalsRelations = relations(documentApprovals, ({ one }) => ({
  document: one(documents, {
    fields: [documentApprovals.documentId],
    references: [documents.id],
  }),
  reviewer: one(users, {
    fields: [documentApprovals.reviewerId],
    references: [users.id],
  }),
}));

export const documentCommentsRelations = relations(documentComments, ({ one }) => ({
  document: one(documents, {
    fields: [documentComments.documentId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [documentComments.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  document: one(documents, {
    fields: [notifications.documentId],
    references: [documents.id],
  }),
}));
