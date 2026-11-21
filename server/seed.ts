import { eq, inArray } from 'drizzle-orm';
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
  permissions,
  rolePermissions,
  roles,
  systemSettings,
  users,
} from '../src/db/schema.ts';
import { hashPassword } from './auth.ts';
import { saveFileBuffer } from './storage.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeedAndEnsureThreeDepts().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

const THREE_DEPARTMENTS = [
  {
    code: 'COT',
    name: 'College of Technology',
    head: 'Engr. Patricia C. Lim',
    description:
      'BS Information Technology, Computer Technology, Network Systems, and Technical Laboratory Operations.',
    retentionDefault: '5 Years',
  },
  {
    code: 'HTM',
    name: 'Hospitality and Tourism Management',
    head: 'Chef Marisol T. Cabahug',
    description:
      'BS Hospitality Management, Tourism Operations, Culinary Laboratory Standards, and Industry Practicum.',
    retentionDefault: '5 Years',
  },
  {
    code: 'EDUC',
    name: 'Education',
    head: 'Dr. Clarissa D. Mendoza',
    description:
      'Bachelor of Elementary & Secondary Education, Teaching Practicum, Syllabi, and CHED/ALCUCOA Curricula.',
    retentionDefault: 'Permanent',
  },
] as const;

async function ensureRolesAndPermissions() {
  const roleDefs = [
    {
      slug: 'super_admin',
      name: 'SUPER ADMIN',
      description:
        'Complete institutional system management across all departments, users, categories, settings, and archives.',
    },
    {
      slug: 'dean',
      name: 'DEAN',
      description:
        'Centralized academic viewer and approver across COT, HTM, and EDUC repositories with cross-department search and audit oversight.',
    },
    {
      slug: 'department_head',
      name: 'DEPARTMENT HEAD',
      description:
        'Full repository management, approvals, departmental categories, and staff oversight for their assigned college department.',
    },
    {
      slug: 'staff',
      name: 'STAFF',
      description:
        'Upload, edit, version, and share documents strictly within their assigned department according to role permissions.',
    },
    {
      slug: 'student',
      name: 'STUDENT',
      description:
        'Authorized read and download access to published internal and explicitly shared academic documents.',
    },
  ];

  for (const r of roleDefs) {
    await db
      .insert(roles)
      .values(r)
      .onConflictDoUpdate({
        target: roles.slug,
        set: { name: r.name, description: r.description },
      });
  }

  const allRoles = await db.select().from(roles);
  const roleBySlug = new Map(allRoles.map((r) => [r.slug, r]));

  // Migrate legacy role assignments if present from earlier seed
  const legacyAdmin = roleBySlug.get('admin');
  const deptHeadRole = roleBySlug.get('department_head');
  if (legacyAdmin && deptHeadRole) {
    await db.update(users).set({ roleId: deptHeadRole.id }).where(eq(users.roleId, legacyAdmin.id));
    await db.delete(roles).where(eq(roles.id, legacyAdmin.id));
  }

  const legacyFaculty = roleBySlug.get('faculty_staff');
  const staffRole = roleBySlug.get('staff');
  if (legacyFaculty && staffRole) {
    await db.update(users).set({ roleId: staffRole.id }).where(eq(users.roleId, legacyFaculty.id));
    await db.delete(roles).where(eq(roles.id, legacyFaculty.id));
  }

  const permDefs = [
    { code: 'docs.view', name: 'View Documents', description: 'Browse permitted repository records' },
    { code: 'docs.upload', name: 'Upload Documents', description: 'Submit new documents and file revisions' },
    { code: 'docs.approve', name: 'Approve & Reject', description: 'Review, approve, or reject document submissions' },
    { code: 'docs.archive', name: 'Archive & Restore', description: 'Archive active records and restore retired records' },
    { code: 'docs.delete', name: 'Permanent Delete', description: 'Permanently delete documents from repository' },
    { code: 'docs.share', name: 'Share Documents', description: 'Share records with users, departments, or roles' },
    { code: 'categories.manage', name: 'Manage Categories', description: 'Add, edit, and remove document categories' },
    { code: 'departments.manage', name: 'Manage Departments', description: 'Manage college departments and personnel' },
    { code: 'users.manage', name: 'Manage Users', description: 'Create, edit, activate/deactivate user accounts' },
    { code: 'settings.manage', name: 'System Settings', description: 'Configure institutional repository preferences' },
  ];

  for (const p of permDefs) {
    await db
      .insert(permissions)
      .values(p)
      .onConflictDoUpdate({
        target: permissions.code,
        set: { name: p.name, description: p.description },
      });
  }

  const allPerms = await db.select().from(permissions);
  const permByCode = new Map(allPerms.map((p) => [p.code, p]));
  const updatedRoles = await db.select().from(roles);
  const updatedRoleMap = new Map(updatedRoles.map((r) => [r.slug, r]));

  const rolePermPairs: Array<[string, string[]]> = [
    [
      'super_admin',
      [
        'docs.view',
        'docs.upload',
        'docs.approve',
        'docs.archive',
        'docs.delete',
        'docs.share',
        'categories.manage',
        'departments.manage',
        'users.manage',
        'settings.manage',
      ],
    ],
    ['dean', ['docs.view', 'docs.approve']],
    [
      'department_head',
      [
        'docs.view',
        'docs.upload',
        'docs.approve',
        'docs.archive',
        'docs.delete',
        'docs.share',
        'categories.manage',
        'users.manage',
      ],
    ],
    ['staff', ['docs.view', 'docs.upload', 'docs.share']],
    ['student', ['docs.view']],
  ];

  for (const [slug, codes] of rolePermPairs) {
    const r = updatedRoleMap.get(slug);
    if (!r) continue;
    for (const code of codes) {
      const p = permByCode.get(code);
      if (p) {
        await db
          .insert(rolePermissions)
          .values({ roleId: r.id, permissionId: p.id })
          .onConflictDoNothing();
      }
    }
  }

  return updatedRoleMap;
}

async function ensureThreeDepartmentsAndMigrateLegacy() {
  for (const d of THREE_DEPARTMENTS) {
    await db
      .insert(departments)
      .values(d)
      .onConflictDoUpdate({
        target: departments.code,
        set: {
          name: d.name,
          head: d.head,
          description: d.description,
          retentionDefault: d.retentionDefault,
        },
      });
  }

  const allDepts = await db.select().from(departments);
  const deptByCode = new Map(allDepts.map((d) => [d.code, d]));
  const cot = deptByCode.get('COT')!;
  const htm = deptByCode.get('HTM')!;
  const educ = deptByCode.get('EDUC')!;

  // Reassign any legacy administrative office records cleanly into COT, HTM, or EDUC
  const legacyDeptMapping: Array<{ code: string; targetId: number }> = [
    { code: 'MIS', targetId: cot.id },
    { code: 'QAO', targetId: cot.id },
    { code: 'FIN', targetId: htm.id },
    { code: 'OSA', targetId: htm.id },
    { code: 'OP', targetId: educ.id },
    { code: 'REG', targetId: educ.id },
    { code: 'HRMO', targetId: educ.id },
  ];

  const legacyIdsToRemove: number[] = [];
  for (const item of legacyDeptMapping) {
    const oldDept = deptByCode.get(item.code);
    if (oldDept) {
      await db
        .update(documents)
        .set({ departmentId: item.targetId })
        .where(eq(documents.departmentId, oldDept.id));
      await db
        .update(users)
        .set({ departmentId: item.targetId })
        .where(eq(users.departmentId, oldDept.id));
      await db
        .update(documentShares)
        .set({ targetDepartmentId: item.targetId })
        .where(eq(documentShares.targetDepartmentId, oldDept.id));
      await db
        .update(documentCategories)
        .set({ departmentId: item.targetId })
        .where(eq(documentCategories.departmentId, oldDept.id));
      legacyIdsToRemove.push(oldDept.id);
    }
  }

  if (legacyIdsToRemove.length > 0) {
    await db.delete(departments).where(inArray(departments.id, legacyIdsToRemove));
  }

  return { cot, htm, educ };
}

async function ensureCategories(cotId: number, htmId: number, educId: number) {
  const categorySeedList: Array<{
    slug: string;
    name: string;
    description: string;
    departmentId: number | null;
    isSystem: boolean;
  }> = [
    {
      slug: 'administrative-documents',
      name: 'Administrative Documents',
      description: 'Institutional governance, office orders, and operational directives.',
      departmentId: null,
      isSystem: true,
    },
    {
      slug: 'academic-documents',
      name: 'Academic Documents',
      description: 'Syllabi, CHED curriculum matrices, and academic calendars.',
      departmentId: null,
      isSystem: true,
    },
    {
      slug: 'faculty-documents',
      name: 'Faculty Documents',
      description: 'Teaching loads, research grants, and faculty travel authorizations.',
      departmentId: null,
      isSystem: true,
    },
    {
      slug: 'student-documents',
      name: 'Student Documents',
      description: 'Student handbooks, UniFAST rosters, and clearance forms.',
      departmentId: null,
      isSystem: true,
    },
    {
      slug: 'research-papers',
      name: 'Research Papers',
      description: 'Institutional research outputs, theses, and extension studies.',
      departmentId: null,
      isSystem: true,
    },
    {
      slug: 'memorandums',
      name: 'Memorandums',
      description: 'Official college memoranda and campus-wide announcements.',
      departmentId: null,
      isSystem: true,
    },
    {
      slug: 'reports',
      name: 'Reports',
      description: 'Accreditation self-survey reports, accomplishment reports, and evaluations.',
      departmentId: null,
      isSystem: true,
    },
    {
      slug: 'policies-and-guidelines',
      name: 'Policies and Guidelines',
      description: 'Board-approved college policies, SOPs, and compliance playbooks.',
      departmentId: null,
      isSystem: true,
    },
    {
      slug: 'meeting-minutes',
      name: 'Meeting Minutes',
      description: 'Academic Council, BOT, and committee session minutes.',
      departmentId: null,
      isSystem: true,
    },
    {
      slug: 'financial-documents',
      name: 'Financial Documents',
      description: 'Procurement plans, COA liquidation reports, and budget outlays.',
      departmentId: null,
      isSystem: true,
    },
    {
      slug: 'human-resources',
      name: 'Human Resources',
      description: 'HRMO policies, appointment rosters, and training guidelines.',
      departmentId: null,
      isSystem: true,
    },
    {
      slug: 'official-letters',
      name: 'Official Letters',
      description: 'External endorsements, CHED correspondence, and LGU transmittals.',
      departmentId: null,
      isSystem: true,
    },
    {
      slug: 'other-documents',
      name: 'Other Documents',
      description: 'Supporting institutional forms and miscellaneous controlled records.',
      departmentId: null,
      isSystem: true,
    },
    // Department-specific categories for COT, HTM, and EDUC
    {
      slug: 'cot-computing-lab-manuals',
      name: 'IT & Computing Lab Manuals',
      description: 'COT laboratory SOPs, hardware inventory, and network topology standards.',
      departmentId: cotId,
      isSystem: false,
    },
    {
      slug: 'cot-capstone-ojt-records',
      name: 'COT Capstone & OJT Filings',
      description: 'BSIT capstone rubrics, industry MOA templates, and practicum endorsements.',
      departmentId: cotId,
      isSystem: false,
    },
    {
      slug: 'htm-culinary-food-safety',
      name: 'Culinary & Food Safety SOPs',
      description: 'HTM kitchen sanitation protocols, HACCP checklists, and lab requisitions.',
      departmentId: htmId,
      isSystem: false,
    },
    {
      slug: 'htm-tourism-practicum',
      name: 'Tourism & Hotel Practicum',
      description: 'HTM hospitality partner agreements, tour itineraries, and OJT evaluations.',
      departmentId: htmId,
      isSystem: false,
    },
    {
      slug: 'educ-lesson-plans-syllabi',
      name: 'Curriculum & Lesson Exemplars',
      description: 'EDUC course syllabi, OBE instructional guides, and CHED compliance matrices.',
      departmentId: educId,
      isSystem: false,
    },
    {
      slug: 'educ-practice-teaching',
      name: 'Practice Teaching & Field Study',
      description: 'EDUC DepEd cooperating school deployments, observation tools, and LET reviews.',
      departmentId: educId,
      isSystem: false,
    },
  ];

  for (const c of categorySeedList) {
    await db
      .insert(documentCategories)
      .values(c)
      .onConflictDoUpdate({
        target: documentCategories.slug,
        set: {
          description: c.description,
          departmentId: c.departmentId,
        },
      });
  }

  const allCats = await db.select().from(documentCategories);
  return new Map(allCats.map((c) => [c.name, c]));
}

async function runSeedAndEnsureThreeDepts(): Promise<void> {
  try {
    const roleBySlug = await ensureRolesAndPermissions();
    const { cot, htm, educ } = await ensureThreeDepartmentsAndMigrateLegacy();
    const catByName = await ensureCategories(cot.id, htm.id, educ.id);

    const existingSettings = await db.select({ id: systemSettings.id }).from(systemSettings).limit(1);
    if (existingSettings.length === 0) {
      await db.insert(systemSettings).values({
        collegeName: 'Lapu-Lapu City College',
        systemTitle: 'LLCC Document Management Repository',
        campusAddress: 'Gun-ob, Lapu-Lapu City, Cebu',
        academicYear: 'AY 2026-2027',
        logoUrl: '/assets/aistudio/image_65e8ffc2.png',
        maxUploadMb: 20,
        allowedFormats: [
          'pdf',
          'doc',
          'docx',
          'xls',
          'xlsx',
          'ppt',
          'pptx',
          'jpg',
          'jpeg',
          'png',
          'csv',
          'txt',
          'md',
        ],
        notifyOnUpload: true,
        notifyOnApproval: true,
        notifyOnShare: true,
      });
    }

    const defaultPasswordHash = await hashPassword('llcc2026');

    const desiredUsers: Array<{
      username: string;
      email: string;
      fullName: string;
      roleSlug: string;
      departmentId: number | null;
    }> = [
      {
        username: 'elena.santos',
        email: 'elena.santos@llcc.edu.ph',
        fullName: 'Dr. Elena M. Santos',
        roleSlug: 'super_admin',
        departmentId: null,
      },
      {
        username: 'dean.reyes',
        email: 'dean.reyes@llcc.edu.ph',
        fullName: 'Dean Roberto V. Reyes',
        roleSlug: 'dean',
        departmentId: null,
      },
      {
        username: 'head.cot',
        email: 'head.cot@llcc.edu.ph',
        fullName: 'Engr. Patricia C. Lim',
        roleSlug: 'department_head',
        departmentId: cot.id,
      },
      {
        username: 'head.htm',
        email: 'head.htm@llcc.edu.ph',
        fullName: 'Chef Marisol T. Cabahug',
        roleSlug: 'department_head',
        departmentId: htm.id,
      },
      {
        username: 'head.educ',
        email: 'head.educ@llcc.edu.ph',
        fullName: 'Dr. Clarissa D. Mendoza',
        roleSlug: 'department_head',
        departmentId: educ.id,
      },
      {
        username: 'staff.cot',
        email: 'staff.cot@llcc.edu.ph',
        fullName: 'Mark Anthony Cruz',
        roleSlug: 'staff',
        departmentId: cot.id,
      },
      {
        username: 'staff.htm',
        email: 'staff.htm@llcc.edu.ph',
        fullName: 'Angela Mae Torres',
        roleSlug: 'staff',
        departmentId: htm.id,
      },
      {
        username: 'staff.educ',
        email: 'staff.educ@llcc.edu.ph',
        fullName: 'Prof. Marco A. Villanueva',
        roleSlug: 'staff',
        departmentId: educ.id,
      },
      {
        username: 'juan.delacruz',
        email: 'juan.delacruz@llcc.edu.ph',
        fullName: 'Juan Carlos Dela Cruz',
        roleSlug: 'student',
        departmentId: cot.id,
      },
    ];

    for (const u of desiredUsers) {
      const roleId = roleBySlug.get(u.roleSlug)!.id;
      await db
        .insert(users)
        .values({
          username: u.username,
          email: u.email,
          fullName: u.fullName,
          passwordHash: defaultPasswordHash,
          roleId,
          departmentId: u.departmentId,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: users.email,
          set: {
            fullName: u.fullName,
            roleId,
            departmentId: u.departmentId,
            isActive: true,
          },
        });
    }

    // Align any legacy staff users to specific departments cleanly
    await db
      .update(users)
      .set({ roleId: roleBySlug.get('staff')!.id, departmentId: cot.id })
      .where(eq(users.email, 'patricia.lim@llcc.edu.ph'));
    await db
      .update(users)
      .set({ roleId: roleBySlug.get('staff')!.id, departmentId: educ.id })
      .where(eq(users.email, 'marco.villanueva@llcc.edu.ph'));
    await db
      .update(users)
      .set({ roleId: roleBySlug.get('staff')!.id, departmentId: htm.id })
      .where(eq(users.email, 'clarissa.mendoza@llcc.edu.ph'));

    const allUsers = await db.select().from(users);
    const userByEmail = new Map(allUsers.map((u) => [u.email, u]));

    interface SeedDoc {
      docCode: string;
      title: string;
      description: string;
      categoryName: string;
      deptId: number;
      documentType: string;
      academicYear: string;
      ownerEmail: string;
      status: string;
      confidentiality: string;
      retentionPolicy: string;
      tags: string[];
      version: string;
      fileName: string;
      mimeType: string;
      content: string;
      downloadCount: number;
      viewCount: number;
      rejectionReason?: string | null;
      archivedAt?: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }

    const coreDocs: SeedDoc[] = [
      {
        docCode: 'LLCC-COT-2026-001',
        title: 'COT Computer Laboratory Network Architecture & Safety Manual',
        description:
          'Standard operating guidelines for College of Technology server racks, VLAN isolation, and student lab access protocols.',
        categoryName: 'IT & Computing Lab Manuals',
        deptId: cot.id,
        documentType: 'Lab Manual',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'head.cot@llcc.edu.ph',
        status: 'Approved',
        confidentiality: 'Internal',
        retentionPolicy: '5 Years',
        tags: ['COT', 'Networking', 'Lab Safety'],
        version: '2.0',
        fileName: 'LLCC-COT-2026-001_Lab_Network_Manual.md',
        mimeType: 'text/markdown',
        content: `# College of Technology (COT)\n## Computer Laboratory Network & Safety Manual\n\n1. All lab workstations authenticate via student credentials.\n2. Server room access requires COT Department Head clearance.\n3. Periodic backup audits occur every Friday at 17:00.`,
        downloadCount: 64,
        viewCount: 148,
        createdAt: new Date('2026-03-14T09:00:00.000Z'),
        updatedAt: new Date('2026-09-12T10:30:00.000Z'),
      },
      {
        docCode: 'LLCC-COT-2026-002',
        title: 'BSIT Capstone Project Guidelines & Industry OJT Endorsement Matrix',
        description:
          'Submitted for centralized Dean approval covering 486-hour industry practicum placements and capstone defense rubrics.',
        categoryName: 'COT Capstone & OJT Filings',
        deptId: cot.id,
        documentType: 'Guidelines',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'staff.cot@llcc.edu.ph',
        status: 'Pending',
        confidentiality: 'Internal',
        retentionPolicy: 'Permanent',
        tags: ['COT', 'BSIT', 'Capstone', 'OJT'],
        version: '1.0',
        fileName: 'LLCC-COT-2026-002_Capstone_OJT_Matrix.csv',
        mimeType: 'text/csv',
        content: `Track,Required_Hours,Deliverable,Panel_Size,Status\nEnterprise Web Systems,486,Deployed System & SRS,3,Pending Dean Approval\nNetwork Infrastructure,486,Topology Audit & Documentation,3,Pending Dean Approval\nData Analytics,486,Dashboard & Pipeline Report,3,Pending Dean Approval`,
        downloadCount: 19,
        viewCount: 44,
        createdAt: new Date('2026-11-04T11:20:00.000Z'),
        updatedAt: new Date('2026-11-18T14:15:00.000Z'),
      },
      {
        docCode: 'LLCC-COT-2023-004',
        title: 'COT Cisco & Cloud Infrastructure Equipment Audit Checklist',
        description:
          'Three-year retention technical hardware calibration log approaching retention review window.',
        categoryName: 'Reports',
        deptId: cot.id,
        documentType: 'Audit Report',
        academicYear: 'AY 2023-2024',
        ownerEmail: 'head.cot@llcc.edu.ph',
        status: 'Approved',
        confidentiality: 'Restricted',
        retentionPolicy: '3 Years',
        tags: ['COT', 'Inventory', 'Retention Review'],
        version: '1.1',
        fileName: 'LLCC-COT-2023-004_Hardware_Audit.txt',
        mimeType: 'text/plain',
        content: `COLLEGE OF TECHNOLOGY — HARDWARE AUDIT LOG\nRef: LLCC-COT-2023-004\nStatus: Active (Approaching 3-Year Retention Review)`,
        downloadCount: 33,
        viewCount: 79,
        createdAt: new Date('2023-12-15T08:00:00.000Z'),
        updatedAt: new Date('2024-06-20T09:00:00.000Z'),
      },
      {
        docCode: 'LLCC-HTM-2026-001',
        title: 'HTM Culinary Simulation Kitchen HACCP & Sanitation Protocol',
        description:
          'Approved food safety, commercial kitchen hygiene, and laboratory equipment handling standards for Hospitality Management.',
        categoryName: 'Culinary & Food Safety SOPs',
        deptId: htm.id,
        documentType: 'SOP Manual',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'head.htm@llcc.edu.ph',
        status: 'Approved',
        confidentiality: 'Internal',
        retentionPolicy: '5 Years',
        tags: ['HTM', 'Culinary', 'HACCP', 'Food Safety'],
        version: '1.4',
        fileName: 'LLCC-HTM-2026-001_HACCP_Sanitation_SOP.md',
        mimeType: 'text/markdown',
        content: `# Hospitality and Tourism Management (HTM)\n## Culinary Kitchen HACCP & Sanitation Protocol\n\n1. Mandatory PPE, hairnets, and food-grade gloves inside Hot & Cold Kitchen labs.\n2. Cold storage temperature verification logged twice daily.\n3. Post-lab sanitation sign-off required by lab instructor.`,
        downloadCount: 82,
        viewCount: 190,
        createdAt: new Date('2026-04-08T08:30:00.000Z'),
        updatedAt: new Date('2026-10-05T15:10:00.000Z'),
      },
      {
        docCode: 'LLCC-HTM-2026-002',
        title: 'Mactan Resort & Airline Partner Practicum MOA Package AY 2026–2027',
        description:
          'Pending Dean verification for Hospitality and Tourism student internship deployments across partner hotels in Lapu-Lapu City.',
        categoryName: 'Tourism & Hotel Practicum',
        deptId: htm.id,
        documentType: 'Practicum MOA',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'staff.htm@llcc.edu.ph',
        status: 'Under Review',
        confidentiality: 'Restricted',
        retentionPolicy: '7 Years',
        tags: ['HTM', 'Tourism', 'Internship', 'Mactan'],
        version: '1.0',
        fileName: 'LLCC-HTM-2026-002_Resort_Practicum_MOA.csv',
        mimeType: 'text/csv',
        content: `Partner_Establishment,Track,Slots,Hours_Required,Review_Stage\nShangri-La Mactan Resort,Hotel Operations,24,600,Under Dean Review\nCrimson Resort & Spa,Culinary Arts,18,600,Under Dean Review\nMactan-Cebu Int'l Airport Services,Tourism Mgmt,16,500,Under Dean Review`,
        downloadCount: 27,
        viewCount: 63,
        createdAt: new Date('2026-10-22T10:15:00.000Z'),
        updatedAt: new Date('2026-11-14T16:40:00.000Z'),
      },
      {
        docCode: 'LLCC-HTM-2022-003',
        title: 'FY 2021–2022 HTM Culinary Equipment & Banquet Subsidy Liquidation',
        description:
          'Five-year financial liquidation record for commercial ovens and simulation dining assets nearing retention expiry.',
        categoryName: 'Financial Documents',
        deptId: htm.id,
        documentType: 'Liquidation Report',
        academicYear: 'AY 2021-2022',
        ownerEmail: 'head.htm@llcc.edu.ph',
        status: 'Approved',
        confidentiality: 'Restricted',
        retentionPolicy: '5 Years',
        tags: ['HTM', 'Equipment', 'Liquidation'],
        version: '1.0',
        fileName: 'LLCC-HTM-2022-003_Equipment_Liquidation.csv',
        mimeType: 'text/csv',
        content: `Voucher_No,Asset,Amount_PHP,Audit_Status\nDV-HTM-104,Commercial Convection Ovens,780000,Cleared\nDV-HTM-118,Front Office PMS Training Terminals,410000,Cleared`,
        downloadCount: 31,
        viewCount: 74,
        createdAt: new Date('2022-01-12T09:30:00.000Z'),
        updatedAt: new Date('2022-03-04T15:10:00.000Z'),
      },
      {
        docCode: 'LLCC-EDUC-2026-001',
        title: 'BEEd & BSEd Outcomes-Based Education (OBE) Syllabus Template AY 2026–2027',
        description:
          'Approved institutional curriculum alignment template for Education faculty aligned with CHED PSG and PPST competencies.',
        categoryName: 'Curriculum & Lesson Exemplars',
        deptId: educ.id,
        documentType: 'Curriculum Matrix',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'head.educ@llcc.edu.ph',
        status: 'Approved',
        confidentiality: 'Internal',
        retentionPolicy: 'Permanent',
        tags: ['EDUC', 'OBE', 'CHED PSG', 'Syllabus'],
        version: '2.1',
        fileName: 'LLCC-EDUC-2026-001_OBE_Syllabus_Template.md',
        mimeType: 'text/markdown',
        content: `# College of Education (EDUC)\n## Outcomes-Based Education (OBE) Syllabus Standard\n\n- Align course learning outcomes with Philippine Professional Standards for Teachers (PPST).\n- Include formative micro-teaching rubrics and reflective portfolio assessments.`,
        downloadCount: 112,
        viewCount: 256,
        createdAt: new Date('2026-05-05T09:00:00.000Z'),
        updatedAt: new Date('2026-09-28T11:45:00.000Z'),
      },
      {
        docCode: 'LLCC-EDUC-2026-002',
        title: 'Pre-Service Practice Teaching & DepEd Partner School Deployment Plan',
        description:
          'Pending approval from the Dean for 4th-year Education student teacher assignments across Lapu-Lapu City public schools.',
        categoryName: 'Practice Teaching & Field Study',
        deptId: educ.id,
        documentType: 'Deployment Roster',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'staff.educ@llcc.edu.ph',
        status: 'Pending',
        confidentiality: 'Internal',
        retentionPolicy: '5 Years',
        tags: ['EDUC', 'Practice Teaching', 'DepEd'],
        version: '1.0',
        fileName: 'LLCC-EDUC-2026-002_Practice_Teaching_Plan.csv',
        mimeType: 'text/csv',
        content: `Cooperating_School,Program,Student_Teachers,Cooperating_Principal,Status\nLapu-Lapu City Central Elem,BEEd,32,Prin. L. Abella,Pending Dean Approval\nMarigondon National High School,BSEd-English,24,Prin. R. Ybañez,Pending Dean Approval\nBabag National High School,BSEd-Math,19,Prin. D. Ocampo,Pending Dean Approval`,
        downloadCount: 21,
        viewCount: 52,
        createdAt: new Date('2026-11-08T09:30:00.000Z'),
        updatedAt: new Date('2026-11-19T08:45:00.000Z'),
      },
      {
        docCode: 'LLCC-EDUC-2026-003',
        title: 'LET Mock Board Examination Analytics & Remedial Intervention Proposal',
        description:
          'Draft departmental report submitted for internal Education review prior to Dean endorsement.',
        categoryName: 'Reports',
        deptId: educ.id,
        documentType: 'Analytics Report',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'staff.educ@llcc.edu.ph',
        status: 'Draft',
        confidentiality: 'Restricted',
        retentionPolicy: '5 Years',
        tags: ['EDUC', 'LET Review', 'Intervention'],
        version: '0.8',
        fileName: 'LLCC-EDUC-2026-003_LET_Remedial_Draft.txt',
        mimeType: 'text/plain',
        content: `COLLEGE OF EDUCATION — DRAFT LET REMEDIAL INTERVENTION PLAN\nTarget Cohort: Class of 2026\nFocus Areas: General Education, Professional Education, Major Specialization.`,
        downloadCount: 5,
        viewCount: 16,
        createdAt: new Date('2026-11-15T13:00:00.000Z'),
        updatedAt: new Date('2026-11-17T16:10:00.000Z'),
      },
    ];

    const newlyInsertedDocs: Array<{ id: number; docCode: string; title: string }> = [];

    for (const spec of coreDocs) {
      const exists = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.docCode, spec.docCode))
        .limit(1);
      if (exists.length > 0) continue;

      const owner = userByEmail.get(spec.ownerEmail) ?? allUsers[0]!;
      const cat = catByName.get(spec.categoryName) ?? catByName.get('Other Documents')!;
      const saved = saveFileBuffer(spec.fileName, Buffer.from(spec.content, 'utf8'));

      const [insertedDoc] = await db
        .insert(documents)
        .values({
          docCode: spec.docCode,
          title: spec.title,
          description: spec.description,
          categoryId: cat.id,
          departmentId: spec.deptId,
          documentType: spec.documentType,
          academicYear: spec.academicYear,
          uploadedById: owner.id,
          status: spec.status,
          confidentiality: spec.confidentiality,
          retentionPolicy: spec.retentionPolicy,
          tags: spec.tags,
          currentVersion: spec.version,
          fileName: spec.fileName,
          mimeType: spec.mimeType,
          fileSizeBytes: saved.sizeBytes,
          downloadCount: spec.downloadCount,
          viewCount: spec.viewCount,
          rejectionReason: spec.rejectionReason ?? null,
          archivedAt: spec.archivedAt ?? null,
          lastAccessedAt: spec.updatedAt,
          createdAt: spec.createdAt,
          updatedAt: spec.updatedAt,
        })
        .returning();

      newlyInsertedDocs.push({
        id: insertedDoc.id,
        docCode: insertedDoc.docCode,
        title: insertedDoc.title,
      });

      await db.insert(documentVersions).values({
        documentId: insertedDoc.id,
        versionNumber: spec.version,
        fileName: spec.fileName,
        mimeType: spec.mimeType,
        sizeBytes: saved.sizeBytes,
        checksum: saved.checksum,
        storageKey: saved.storageKey,
        uploadedById: owner.id,
        changeNotes: 'Controlled department repository record',
        createdAt: spec.updatedAt,
      });

      const dean = userByEmail.get('dean.reyes@llcc.edu.ph');
      if (spec.status === 'Approved' && dean) {
        await db.insert(documentApprovals).values({
          documentId: insertedDoc.id,
          reviewerId: dean.id,
          fromStatus: 'Under Review',
          toStatus: 'Approved',
          decision: 'Approved',
          reason: 'Reviewed and approved by the Office of the Academic Dean.',
          createdAt: spec.updatedAt,
        });
      }
    }

    // Seed initial Dean notifications and cross-department activity entries if newly inserted
    const deanUser = userByEmail.get('dean.reyes@llcc.edu.ph');
    if (deanUser && newlyInsertedDocs.length > 0) {
      const cotPending = newlyInsertedDocs.find((d) => d.docCode === 'LLCC-COT-2026-002');
      const htmReview = newlyInsertedDocs.find((d) => d.docCode === 'LLCC-HTM-2026-002');
      const educPending = newlyInsertedDocs.find((d) => d.docCode === 'LLCC-EDUC-2026-002');

      if (cotPending) {
        await db.insert(notifications).values({
          userId: deanUser.id,
          type: 'approval_request',
          title: 'COT Pending Approval',
          message: 'BSIT Capstone Project Guidelines & Industry OJT Endorsement Matrix is awaiting Dean review.',
          documentId: cotPending.id,
          isRead: false,
        });
      }
      if (htmReview) {
        await db.insert(notifications).values({
          userId: deanUser.id,
          type: 'approval_request',
          title: 'HTM Under Review',
          message: 'Mactan Resort & Airline Partner Practicum MOA Package is awaiting final approval.',
          documentId: htmReview.id,
          isRead: false,
        });
      }
      if (educPending) {
        await db.insert(notifications).values({
          userId: deanUser.id,
          type: 'approval_request',
          title: 'EDUC Pending Approval',
          message: 'Pre-Service Practice Teaching & DepEd Partner School Deployment Plan submitted for Dean approval.',
          documentId: educPending.id,
          isRead: false,
        });
      }

      const staffCot = userByEmail.get('staff.cot@llcc.edu.ph');
      const staffHtm = userByEmail.get('staff.htm@llcc.edu.ph');
      const staffEduc = userByEmail.get('staff.educ@llcc.edu.ph');

      await db.insert(activityLogs).values([
        {
          userId: staffCot?.id ?? deanUser.id,
          actorName: staffCot?.fullName ?? 'COT Staff',
          actorRole: 'STAFF',
          action: 'SUBMITTED_REVIEW',
          targetType: 'document',
          targetId: String(cotPending?.id ?? 1),
          targetRef: 'LLCC-COT-2026-002',
          targetTitle: 'BSIT Capstone Project Guidelines & Industry OJT Endorsement Matrix',
          details: 'COT uploaded v1.0 and submitted for Dean approval.',
          ipAddress: '10.14.10.21',
          createdAt: new Date('2026-11-18T14:15:00.000Z'),
        },
        {
          userId: staffHtm?.id ?? deanUser.id,
          actorName: staffHtm?.fullName ?? 'HTM Staff',
          actorRole: 'STAFF',
          action: 'UNDER_REVIEW',
          targetType: 'document',
          targetId: String(htmReview?.id ?? 1),
          targetRef: 'LLCC-HTM-2026-002',
          targetTitle: 'Mactan Resort & Airline Partner Practicum MOA Package AY 2026–2027',
          details: 'HTM submission placed under centralized Dean review.',
          ipAddress: '10.14.11.14',
          createdAt: new Date('2026-11-14T16:40:00.000Z'),
        },
        {
          userId: staffEduc?.id ?? deanUser.id,
          actorName: staffEduc?.fullName ?? 'EDUC Staff',
          actorRole: 'STAFF',
          action: 'SUBMITTED_REVIEW',
          targetType: 'document',
          targetId: String(educPending?.id ?? 1),
          targetRef: 'LLCC-EDUC-2026-002',
          targetTitle: 'Pre-Service Practice Teaching & DepEd Partner School Deployment Plan',
          details: 'EDUC submitted v1.0 deployment roster for Dean approval.',
          ipAddress: '10.14.12.08',
          createdAt: new Date('2026-11-19T08:45:00.000Z'),
        },
      ]);
    }

    // Ensure student share exists on an approved COT/EDUC document
    const student = userByEmail.get('juan.delacruz@llcc.edu.ph');
    const firstApproved = newlyInsertedDocs.find((d) => d.docCode === 'LLCC-COT-2026-001');
    if (student && firstApproved && deanUser) {
      await db.insert(documentShares).values({
        documentId: firstApproved.id,
        sharedById: deanUser.id,
        targetUserId: student.id,
        permission: 'download',
        expiresAt: new Date('2027-06-30T23:59:59.000Z'),
      });
    }

    console.log('LLCC 3-Department (COT, HTM, EDUC) & Dean RBAC seed verified.');
  } catch (err) {
    console.error('Database seed failed:', err);
    throw new Error('Failed to initialize repository seed data.', { cause: err });
  }
}

export async function getRoleIdBySlug(slug: string): Promise<number> {
  const rows = await db.select({ id: roles.id }).from(roles).where(eq(roles.slug, slug)).limit(1);
  if (!rows[0]) throw new Error(`Role not found: ${slug}`);
  return rows[0].id;
}
