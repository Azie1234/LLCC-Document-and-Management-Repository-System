import { eq } from 'drizzle-orm';
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
    seedPromise = runSeedIfEmpty().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function runSeedIfEmpty(): Promise<void> {
  try {
    const existingRoles = await db.select({ id: roles.id }).from(roles).limit(1);
    if (existingRoles.length > 0) {
      return;
    }

    const insertedRoles = await db
      .insert(roles)
      .values([
        {
          slug: 'super_admin',
          name: 'SUPER ADMIN',
          description: 'Full institutional governance, user administration, system configuration, and permanent purge authority.',
        },
        {
          slug: 'admin',
          name: 'ADMIN',
          description: 'Repository administration, document review & approval, category/department management, and reporting.',
        },
        {
          slug: 'faculty_staff',
          name: 'FACULTY / STAFF',
          description: 'Upload documents, manage personal submissions, collaborate on reviews, and share permitted records.',
        },
        {
          slug: 'student',
          name: 'STUDENT',
          description: 'Browse approved public/shared academic resources, search records, and download authorized materials.',
        },
      ])
      .returning();

    const roleBySlug = new Map(insertedRoles.map((r) => [r.slug, r]));

    const insertedPermissions = await db
      .insert(permissions)
      .values([
        { code: 'docs.view', name: 'View Documents', description: 'Browse permitted repository records' },
        { code: 'docs.upload', name: 'Upload Documents', description: 'Submit new documents and file revisions' },
        { code: 'docs.approve', name: 'Approve & Reject', description: 'Review, approve, or reject document submissions' },
        { code: 'docs.archive', name: 'Archive & Restore', description: 'Archive active records and restore retired records' },
        { code: 'docs.delete', name: 'Permanent Delete', description: 'Permanently delete documents from repository' },
        { code: 'docs.share', name: 'Share Documents', description: 'Share records with users, departments, or roles' },
        { code: 'categories.manage', name: 'Manage Categories', description: 'Add, edit, and remove document categories' },
        { code: 'departments.manage', name: 'Manage Departments', description: 'Manage college offices and personnel assignments' },
        { code: 'users.manage', name: 'Manage Users', description: 'Create, edit, activate/deactivate user accounts' },
        { code: 'settings.manage', name: 'System Settings', description: 'Configure institutional repository preferences' },
      ])
      .returning();

    const permByCode = new Map(insertedPermissions.map((p) => [p.code, p]));
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
      [
        'admin',
        [
          'docs.view',
          'docs.upload',
          'docs.approve',
          'docs.archive',
          'docs.share',
          'categories.manage',
          'departments.manage',
          'users.manage',
        ],
      ],
      ['faculty_staff', ['docs.view', 'docs.upload', 'docs.share']],
      ['student', ['docs.view']],
    ];

    const rpRows: Array<{ roleId: number; permissionId: number }> = [];
    for (const [slug, codes] of rolePermPairs) {
      const r = roleBySlug.get(slug);
      if (!r) continue;
      for (const code of codes) {
        const p = permByCode.get(code);
        if (p) rpRows.push({ roleId: r.id, permissionId: p.id });
      }
    }
    if (rpRows.length > 0) {
      await db.insert(rolePermissions).values(rpRows);
    }

    const insertedDepts = await db
      .insert(departments)
      .values([
        {
          code: 'OP',
          name: 'Office of the College President',
          head: 'Dr. Elena M. Santos',
          description: 'Executive governance, Board of Trustees resolutions, and institutional directives.',
          retentionDefault: 'Permanent',
        },
        {
          code: 'REG',
          name: 'Office of the College Registrar & Academic Affairs',
          head: 'Prof. Marco A. Villanueva',
          description: 'Academic calendars, CHED curriculum filings, enrollment clearances, and student transcripts.',
          retentionDefault: 'Permanent',
        },
        {
          code: 'FIN',
          name: 'Accounting, Budget & Procurement Office',
          head: 'CPA Clarissa D. Mendoza',
          description: 'Annual Procurement Plans (APP), COA audit schedules, and LGU subsidy liquidations.',
          retentionDefault: '7 Years',
        },
        {
          code: 'HRMO',
          name: 'Human Resource Management Office',
          head: 'Dir. Rafael B. Navarro',
          description: 'Faculty personnel policies, official travel authorizations, and civil service compliance.',
          retentionDefault: '5 Years',
        },
        {
          code: 'QAO',
          name: 'Quality Assurance & Accreditation Office',
          head: 'Engr. Patricia C. Lim',
          description: 'ALCUCOA accreditation exhibits, ISO 9001:2015 manuals, and CHED COPC documentation.',
          retentionDefault: 'Permanent',
        },
        {
          code: 'OSA',
          name: 'Office of Student Affairs & UniFAST Desk',
          head: 'Dean Marisol T. Cabahug',
          description: 'RA 10931 UniFAST billing rosters, TES scholarships, and student handbook governance.',
          retentionDefault: '5 Years',
        },
        {
          code: 'MIS',
          name: 'Management Information Systems Office',
          head: 'Engr. Adrian R. Reyes',
          description: 'Campus ICT architecture, RA 10173 Data Privacy playbooks, and system security controls.',
          retentionDefault: '5 Years',
        },
      ])
      .returning();

    const deptByCode = new Map(insertedDepts.map((d) => [d.code, d]));

    const categorySeedList = [
      { slug: 'administrative-documents', name: 'Administrative Documents', description: 'Institutional governance, office orders, and operational directives.' },
      { slug: 'academic-documents', name: 'Academic Documents', description: 'Syllabi, CHED curriculum matrices, and academic calendars.' },
      { slug: 'faculty-documents', name: 'Faculty Documents', description: 'Teaching loads, research grants, and faculty travel authorizations.' },
      { slug: 'student-documents', name: 'Student Documents', description: 'Student handbooks, UniFAST rosters, and clearance forms.' },
      { slug: 'research-papers', name: 'Research Papers', description: 'Institutional research outputs, theses, and extension studies.' },
      { slug: 'memorandums', name: 'Memorandums', description: 'Official college memoranda and campus-wide announcements.' },
      { slug: 'reports', name: 'Reports', description: 'Accreditation self-survey reports, accomplishment reports, and evaluations.' },
      { slug: 'policies-and-guidelines', name: 'Policies and Guidelines', description: 'Board-approved college policies, SOPs, and compliance playbooks.' },
      { slug: 'meeting-minutes', name: 'Meeting Minutes', description: 'Academic Council, BOT, and committee session minutes.' },
      { slug: 'financial-documents', name: 'Financial Documents', description: 'Procurement plans, COA liquidation reports, and LGU budget outlays.' },
      { slug: 'human-resources', name: 'Human Resources', description: 'HRMO policies, appointment rosters, and training guidelines.' },
      { slug: 'official-letters', name: 'Official Letters', description: 'External endorsements, CHED correspondence, and LGU transmittals.' },
      { slug: 'other-documents', name: 'Other Documents', description: 'Supporting institutional forms and miscellaneous controlled records.' },
    ];

    const insertedCategories = await db
      .insert(documentCategories)
      .values(
        categorySeedList.map((c) => ({
          slug: c.slug,
          name: c.name,
          description: c.description,
          isSystem: true,
        }))
      )
      .returning();

    const catByName = new Map(insertedCategories.map((c) => [c.name, c]));

    const defaultPasswordHash = await hashPassword('llcc2026');

    const insertedUsers = await db
      .insert(users)
      .values([
        {
          username: 'elena.santos',
          email: 'elena.santos@llcc.edu.ph',
          fullName: 'Dr. Elena M. Santos',
          passwordHash: defaultPasswordHash,
          roleId: roleBySlug.get('super_admin')!.id,
          departmentId: deptByCode.get('OP')!.id,
          isActive: true,
        },
        {
          username: 'marco.villanueva',
          email: 'marco.villanueva@llcc.edu.ph',
          fullName: 'Prof. Marco A. Villanueva',
          passwordHash: defaultPasswordHash,
          roleId: roleBySlug.get('admin')!.id,
          departmentId: deptByCode.get('REG')!.id,
          isActive: true,
        },
        {
          username: 'clarissa.mendoza',
          email: 'clarissa.mendoza@llcc.edu.ph',
          fullName: 'CPA Clarissa D. Mendoza',
          passwordHash: defaultPasswordHash,
          roleId: roleBySlug.get('admin')!.id,
          departmentId: deptByCode.get('FIN')!.id,
          isActive: true,
        },
        {
          username: 'patricia.lim',
          email: 'patricia.lim@llcc.edu.ph',
          fullName: 'Engr. Patricia C. Lim',
          passwordHash: defaultPasswordHash,
          roleId: roleBySlug.get('faculty_staff')!.id,
          departmentId: deptByCode.get('QAO')!.id,
          isActive: true,
        },
        {
          username: 'juan.delacruz',
          email: 'juan.delacruz@llcc.edu.ph',
          fullName: 'Juan Carlos Dela Cruz',
          passwordHash: defaultPasswordHash,
          roleId: roleBySlug.get('student')!.id,
          departmentId: deptByCode.get('OSA')!.id,
          isActive: true,
        },
      ])
      .returning();

    const userByEmail = new Map(insertedUsers.map((u) => [u.email, u]));

    await db.insert(systemSettings).values({
      collegeName: 'Lapu-Lapu City College',
      systemTitle: 'LLCC Document Management Repository',
      campusAddress: 'Gun-ob, Lapu-Lapu City, Cebu',
      academicYear: 'AY 2026-2027',
      logoUrl: '/assets/aistudio/image_65e8ffc2.png',
      maxUploadMb: 20,
      allowedFormats: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'csv', 'txt', 'md'],
      notifyOnUpload: true,
      notifyOnApproval: true,
      notifyOnShare: true,
    });

    interface SeedDoc {
      docCode: string;
      title: string;
      description: string;
      categoryName: string;
      deptCode: string;
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

    const seedDocs: SeedDoc[] = [
      {
        docCode: 'LLCC-OP-2026-001',
        title: 'BOT Resolution No. 2026-04: Lapu-Lapu City College Records Governance Charter',
        description: 'Establishes centralized document classification, version control mandates, and archival authority across all LLCC offices.',
        categoryName: 'Policies and Guidelines',
        deptCode: 'OP',
        documentType: 'Board Resolution',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'elena.santos@llcc.edu.ph',
        status: 'Approved',
        confidentiality: 'Internal',
        retentionPolicy: 'Permanent',
        tags: ['Board of Trustees', 'Records Charter', 'Governance'],
        version: '2.0',
        fileName: 'LLCC-OP-2026-001_Records_Governance_Charter.md',
        mimeType: 'text/markdown',
        content: `# Lapu-Lapu City College — Board of Trustees\n## Resolution No. 2026-04: Institutional Records Governance Charter\n\nCampus: Gun-ob, Lapu-Lapu City, Cebu\nEffective Date: February 1, 2026\n\n### Section 1. Purpose\nAll official memoranda, BOT resolutions, CHED curricula, UniFAST rosters, financial reports, and official letters generated by Lapu-Lapu City College offices must be indexed in the LLCC Document Management Repository.\n\n### Section 2. Classification\n1. Internal: Accessible to authenticated personnel and authorized students.\n2. Restricted: Limited to Department Heads, Faculty/Staff, and Administrators.\n3. Confidential: Executive and designated compliance auditors only.`,
        downloadCount: 48,
        viewCount: 112,
        createdAt: new Date('2026-02-01T09:15:00.000Z'),
        updatedAt: new Date('2026-03-10T14:30:00.000Z'),
      },
      {
        docCode: 'LLCC-QAO-2026-003',
        title: 'ALCUCOA & ISO 9001:2015 Documented Information Control Manual',
        description: 'Standard operating procedure governing creation, controlled numbering, ALCUCOA exhibit indexing, and archival control.',
        categoryName: 'Policies and Guidelines',
        deptCode: 'QAO',
        documentType: 'Quality Manual',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'patricia.lim@llcc.edu.ph',
        status: 'Approved',
        confidentiality: 'Internal',
        retentionPolicy: 'Permanent',
        tags: ['ALCUCOA', 'ISO 9001', 'CHED COPC'],
        version: '1.2',
        fileName: 'LLCC-QAO-2026-003_Document_Control_Manual.txt',
        mimeType: 'text/plain',
        content: `LAPU-LAPU CITY COLLEGE\nQUALITY ASSURANCE & ACCREDITATION OFFICE\nDocument Code: LLCC-QAO-2026-003\n\n1. SCOPE\nApplies to College of Education (CoEd), College of Hospitality & Tourism Management (CHTM), College of Technology & Computer Studies (CoTech), and administrative units.\n\n2. CONTROLLED NUMBERING\nFormat: LLCC-[DEPT]-[YEAR]-[SEQ]\n\n3. ARCHIVAL RETENTION\nSuperseded records are transitioned to Archived status with immutable audit history.`,
        downloadCount: 74,
        viewCount: 145,
        createdAt: new Date('2026-02-12T10:00:00.000Z'),
        updatedAt: new Date('2026-04-04T11:20:00.000Z'),
      },
      {
        docCode: 'LLCC-REG-2026-011',
        title: 'Academic Calendar & Enrollment Clearance Protocol AY 2026–2027',
        description: 'Official Lapu-Lapu City College academic schedule, RA 10931 UniFAST verification window, and Registrar clearance workflow.',
        categoryName: 'Academic Documents',
        deptCode: 'REG',
        documentType: 'Memorandum',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'marco.villanueva@llcc.edu.ph',
        status: 'Approved',
        confidentiality: 'Internal',
        retentionPolicy: 'Permanent',
        tags: ['Registrar', 'Academic Calendar', 'Enrollment'],
        version: '1.0',
        fileName: 'LLCC-REG-2026-011_Academic_Calendar_2026_2027.md',
        mimeType: 'text/markdown',
        content: `# Office of the College Registrar — Memorandum No. REG-2026-011\n**Subject:** Lapu-Lapu City College Academic Calendar AY 2026–2027\n\n- First Semester Enrollment & UniFAST Validation: August 3 – August 14, 2026\n- Opening of Classes: August 24, 2026\n- Midterm Examinations: October 19 – October 24, 2026\n- Final Examinations: December 14 – December 19, 2026`,
        downloadCount: 103,
        viewCount: 231,
        createdAt: new Date('2026-05-02T08:45:00.000Z'),
        updatedAt: new Date('2026-05-04T16:10:00.000Z'),
      },
      {
        docCode: 'LLCC-FIN-2026-007',
        title: 'FY 2026 Annual Procurement Plan (APP) & Campus Laboratory Outlay',
        description: 'Itemized LGU-funded procurement schedule for CHTM culinary laboratory equipment, CoTech networking racks, and library terminals.',
        categoryName: 'Financial Documents',
        deptCode: 'FIN',
        documentType: 'Procurement Plan',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'clarissa.mendoza@llcc.edu.ph',
        status: 'Under Review',
        confidentiality: 'Restricted',
        retentionPolicy: '7 Years',
        tags: ['APP 2026', 'Procurement', 'LGU Subsidy'],
        version: '1.1',
        fileName: 'LLCC-FIN-2026-007_Annual_Procurement_Plan.csv',
        mimeType: 'text/csv',
        content: `Line_Item,Office,Item_Description,Allocated_PHP,Quarter,Status\n101,MIS,Campus Fiber Core Switches & Access Points,1450000,Q2,Pending BAC\n102,REG,Registrar Archival High-Speed Scanners,420000,Q2,Approved\n103,QAO,CHTM Commercial Culinary Simulation Stations,980000,Q3,Pending BAC\n104,OP,LLCC Audio-Visual Hall Conferencing System,610000,Q4,Scheduled`,
        downloadCount: 22,
        viewCount: 54,
        createdAt: new Date('2026-06-18T13:10:00.000Z'),
        updatedAt: new Date('2026-11-02T09:40:00.000Z'),
      },
      {
        docCode: 'LLCC-OSA-2026-009',
        title: 'UniFAST RA 10931 Free Higher Education & TES Billing Guidelines',
        description: 'Operational guidelines for student residency verification, Free Higher Education (FHE) billing submission, and TES disbursement.',
        categoryName: 'Student Documents',
        deptCode: 'OSA',
        documentType: 'Guidelines',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'patricia.lim@llcc.edu.ph',
        status: 'Pending',
        confidentiality: 'Restricted',
        retentionPolicy: '5 Years',
        tags: ['UniFAST', 'RA 10931', 'Scholarship'],
        version: '1.0',
        fileName: 'LLCC-OSA-2026-009_UniFAST_FHE_Guidelines.md',
        mimeType: 'text/markdown',
        content: `# Lapu-Lapu City College — Office of Student Affairs\n## UniFAST RA 10931 Free Higher Education Billing Guidelines\n\n1. Bonafide Filipino citizen admitted to a CHED-recognized LLCC undergraduate degree program.\n2. Validated Certificate of Registration (COR) issued by the LLCC Registrar.\n3. Reconcile enrollment rosters within 15 working days after late registration.`,
        downloadCount: 18,
        viewCount: 42,
        createdAt: new Date('2026-10-14T11:00:00.000Z'),
        updatedAt: new Date('2026-11-10T15:20:00.000Z'),
      },
      {
        docCode: 'LLCC-MIS-2026-002',
        title: 'NPC Data Privacy Act Compliance & Student Records Security Playbook',
        description: 'Mandatory containment, escalation, and breach notification procedures aligned with the Philippine Data Privacy Act (RA 10173).',
        categoryName: 'Policies and Guidelines',
        deptCode: 'MIS',
        documentType: 'Security Playbook',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'elena.santos@llcc.edu.ph',
        status: 'Approved',
        confidentiality: 'Confidential',
        retentionPolicy: '5 Years',
        tags: ['RA 10173', 'Data Privacy', 'Cybersecurity'],
        version: '2.1',
        fileName: 'LLCC-MIS-2026-002_Data_Privacy_Playbook.txt',
        mimeType: 'text/plain',
        content: `LAPU-LAPU CITY COLLEGE — MIS & DATA PRIVACY OFFICE (CONFIDENTIAL)\nRef: LLCC-MIS-2026-002\n\nPHASE 1: DETECTION & TRIAGE (0-30 MINS)\nIsolate affected campus VLAN and preserve audit logs.\n\nPHASE 2: ESCALATION (30-120 MINS)\nNotify LLCC Data Protection Officer and Office of the College President.\n\nPHASE 3: NPC REPORTING\nFile breach assessment within 72 hours per NPC Circular 16-03.`,
        downloadCount: 34,
        viewCount: 68,
        createdAt: new Date('2026-03-08T10:30:00.000Z'),
        updatedAt: new Date('2026-09-22T17:05:00.000Z'),
      },
      {
        docCode: 'LLCC-REG-2026-019',
        title: 'BS Information Technology & Hospitality Tech Curriculum Revision Matrix',
        description: 'Draft CHED CMO-aligned curriculum matrix introducing cloud infrastructure, enterprise records systems, and tourism analytics.',
        categoryName: 'Academic Documents',
        deptCode: 'REG',
        documentType: 'Curriculum Matrix',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'marco.villanueva@llcc.edu.ph',
        status: 'Draft',
        confidentiality: 'Internal',
        retentionPolicy: 'Permanent',
        tags: ['CoTech', 'CHED CMO', 'Curriculum'],
        version: '0.9',
        fileName: 'LLCC-REG-2026-019_BSIT_Curriculum_Draft.csv',
        mimeType: 'text/csv',
        content: `Course_Code,Course_Title,Units,Year_Level,Prerequisite\nIT301,Enterprise Systems & Cloud Architecture,3,3rd Year,IT202\nIT305,Database Administration & Governance,3,3rd Year,IT201\nIT402,Information Assurance & Security,3,4th Year,IT301\nIT499,Industry Practicum / OJT (486 Hours),6,4th Year,All Core`,
        downloadCount: 9,
        viewCount: 25,
        createdAt: new Date('2026-11-05T14:20:00.000Z'),
        updatedAt: new Date('2026-11-16T10:15:00.000Z'),
      },
      {
        docCode: 'LLCC-QAO-2026-014',
        title: 'Faculty Extension Research Grant Proposal — Mactan Coastal Tourism Impact',
        description: 'Submitted research grant application requiring revised budget breakdown and community partner endorsement.',
        categoryName: 'Research Papers',
        deptCode: 'QAO',
        documentType: 'Research Proposal',
        academicYear: 'AY 2026-2027',
        ownerEmail: 'patricia.lim@llcc.edu.ph',
        status: 'Rejected',
        confidentiality: 'Internal',
        retentionPolicy: '5 Years',
        tags: ['Research', 'Extension', 'CHTM'],
        version: '1.0',
        fileName: 'LLCC-QAO-2026-014_Coastal_Tourism_Research.md',
        mimeType: 'text/markdown',
        content: `# Research Proposal: Mactan Coastal Heritage & Sustainable Tourism\nSubmitted by: CHTM Research Cluster\n\nIncludes baseline survey design and LGU tourism office coordination framework.`,
        downloadCount: 6,
        viewCount: 19,
        rejectionReason: 'Please attach signed Barangay partner endorsement letter and itemized field transport schedule before resubmitting.',
        createdAt: new Date('2026-09-10T08:30:00.000Z'),
        updatedAt: new Date('2026-10-02T14:00:00.000Z'),
      },
      {
        docCode: 'LLCC-OP-2025-018',
        title: '2025 LLCC Academic Council & ALCUCOA Pre-Visit Minutes',
        description: 'Superseded 2025 executive council minutes archived for historical CHED and ALCUCOA accreditation reference.',
        categoryName: 'Meeting Minutes',
        deptCode: 'OP',
        documentType: 'Council Minutes',
        academicYear: 'AY 2025-2026',
        ownerEmail: 'elena.santos@llcc.edu.ph',
        status: 'Archived',
        confidentiality: 'Internal',
        retentionPolicy: 'Permanent',
        tags: ['2025 Archive', 'Academic Council', 'ALCUCOA'],
        version: '1.0',
        fileName: 'LLCC-OP-2025-018_Council_Minutes_2025.txt',
        mimeType: 'text/plain',
        content: `LAPU-LAPU CITY COLLEGE — ACADEMIC COUNCIL MINUTES\nSession Date: December 11, 2025\nStatus: ARCHIVED RECORD\n\n1. Adopted 2026 institutional quality targets for CoEd, CHTM, and CoTech.\n2. Authorized digitization of legacy student permanent records.`,
        downloadCount: 29,
        viewCount: 61,
        archivedAt: new Date('2026-02-15T12:00:00.000Z'),
        createdAt: new Date('2025-12-12T09:00:00.000Z'),
        updatedAt: new Date('2026-02-15T12:00:00.000Z'),
      },
      {
        docCode: 'LLCC-HRMO-2023-004',
        title: 'Faculty Official Travel, Seminar & Research Grant Authorization Form',
        description: 'Controlled HRMO form for faculty conference travel, research presentation endorsement, and post-travel liquidation.',
        categoryName: 'Human Resources',
        deptCode: 'HRMO',
        documentType: 'Standard Form',
        academicYear: 'AY 2023-2024',
        ownerEmail: 'elena.santos@llcc.edu.ph',
        status: 'Approved',
        confidentiality: 'Internal',
        retentionPolicy: '3 Years',
        tags: ['HRMO Form', 'Faculty Travel', 'Research'],
        version: '1.3',
        fileName: 'LLCC-HRMO-2023-004_Faculty_Travel_Form.txt',
        mimeType: 'text/plain',
        content: `LAPU-LAPU CITY COLLEGE — FORM HRMO-004 (Rev 1.3)\nOFFICIAL TRAVEL & RESEARCH GRANT AUTHORIZATION\n\nFaculty / Staff Name: _________________\nCollege / Office: _____________________\nConference / Venue: ___________________`,
        downloadCount: 118,
        viewCount: 240,
        createdAt: new Date('2023-12-10T08:00:00.000Z'),
        updatedAt: new Date('2024-08-19T13:45:00.000Z'),
      },
      {
        docCode: 'LLCC-FIN-2022-003',
        title: 'FY 2021–2022 CHED & LGU Subsidy Liquidation Report',
        description: 'Consolidated five-year retention financial liquidation voucher schedule for LGU operating grants and laboratory outlays.',
        categoryName: 'Financial Documents',
        deptCode: 'FIN',
        documentType: 'Liquidation Report',
        academicYear: 'AY 2021-2022',
        ownerEmail: 'clarissa.mendoza@llcc.edu.ph',
        status: 'Approved',
        confidentiality: 'Restricted',
        retentionPolicy: '5 Years',
        tags: ['Liquidation', 'COA Audit', 'LGU Subsidy'],
        version: '1.0',
        fileName: 'LLCC-FIN-2022-003_Subsidy_Liquidation_Report.csv',
        mimeType: 'text/csv',
        content: `Voucher_No,Fund_Source,Description,Amount_PHP,Audit_Status\nDV-2022-014,LGU General Fund,CoTech Computer Laboratory Workstations,1240000,Cleared\nDV-2022-029,CHED Unifast Admin,Student Records Digitization Supplies,315000,Cleared`,
        downloadCount: 41,
        viewCount: 87,
        createdAt: new Date('2022-01-12T09:30:00.000Z'),
        updatedAt: new Date('2022-03-04T15:10:00.000Z'),
      },
    ];

    const insertedDocs: Array<{ id: number; docCode: string; title: string; status: string }> = [];

    for (const spec of seedDocs) {
      const owner = userByEmail.get(spec.ownerEmail)!;
      const cat = catByName.get(spec.categoryName)!;
      const dept = deptByCode.get(spec.deptCode)!;
      const saved = saveFileBuffer(spec.fileName, Buffer.from(spec.content, 'utf8'));

      const [insertedDoc] = await db
        .insert(documents)
        .values({
          docCode: spec.docCode,
          title: spec.title,
          description: spec.description,
          categoryId: cat.id,
          departmentId: dept.id,
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

      insertedDocs.push({
        id: insertedDoc.id,
        docCode: insertedDoc.docCode,
        title: insertedDoc.title,
        status: insertedDoc.status,
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
        changeNotes: 'Initial controlled repository ingestion',
        createdAt: spec.updatedAt,
      });

      if (spec.status === 'Approved') {
        await db.insert(documentApprovals).values({
          documentId: insertedDoc.id,
          reviewerId: userByEmail.get('elena.santos@llcc.edu.ph')!.id,
          fromStatus: 'Under Review',
          toStatus: 'Approved',
          decision: 'Approved',
          reason: 'Verified institutional compliance and formatting standards.',
          createdAt: spec.updatedAt,
        });
      } else if (spec.status === 'Rejected' && spec.rejectionReason) {
        await db.insert(documentApprovals).values({
          documentId: insertedDoc.id,
          reviewerId: userByEmail.get('marco.villanueva@llcc.edu.ph')!.id,
          fromStatus: 'Under Review',
          toStatus: 'Rejected',
          decision: 'Rejected',
          reason: spec.rejectionReason,
          createdAt: spec.updatedAt,
        });
      }
    }

    const docByCode = new Map(insertedDocs.map((d) => [d.docCode, d]));
    const superAdmin = userByEmail.get('elena.santos@llcc.edu.ph')!;
    const registrar = userByEmail.get('marco.villanueva@llcc.edu.ph')!;
    const faculty = userByEmail.get('patricia.lim@llcc.edu.ph')!;
    const student = userByEmail.get('juan.delacruz@llcc.edu.ph')!;

    await db.insert(documentShares).values([
      {
        documentId: docByCode.get('LLCC-REG-2026-011')!.id,
        sharedById: registrar.id,
        targetUserId: student.id,
        permission: 'download',
        expiresAt: new Date('2027-06-30T23:59:59.000Z'),
      },
      {
        documentId: docByCode.get('LLCC-QAO-2026-003')!.id,
        sharedById: faculty.id,
        targetDepartmentId: deptByCode.get('REG')!.id,
        permission: 'edit',
        expiresAt: new Date('2027-03-31T23:59:59.000Z'),
      },
    ]);

    await db.insert(documentComments).values([
      {
        documentId: docByCode.get('LLCC-FIN-2026-007')!.id,
        userId: superAdmin.id,
        body: 'BAC pre-procurement validation scheduled for next Tuesday. Please keep Q3 equipment specs attached.',
        createdAt: new Date('2026-11-03T09:15:00.000Z'),
      },
    ]);

    await db.insert(notifications).values([
      {
        userId: superAdmin.id,
        type: 'approval_request',
        title: 'Pending Approval Request',
        message: 'UniFAST RA 10931 Free Higher Education & TES Billing Guidelines is awaiting review.',
        documentId: docByCode.get('LLCC-OSA-2026-009')!.id,
        isRead: false,
      },
      {
        userId: faculty.id,
        type: 'rejected',
        title: 'Document Returned for Revision',
        message: 'LLCC-QAO-2026-014 requires Barangay partner endorsement and itemized transport schedule.',
        documentId: docByCode.get('LLCC-QAO-2026-014')!.id,
        isRead: false,
      },
      {
        userId: student.id,
        type: 'shared',
        title: 'New Document Shared With You',
        message: 'Prof. Marco A. Villanueva shared Academic Calendar & Enrollment Clearance Protocol AY 2026–2027.',
        documentId: docByCode.get('LLCC-REG-2026-011')!.id,
        isRead: false,
      },
    ]);

    await db.insert(activityLogs).values([
      {
        userId: registrar.id,
        actorName: registrar.fullName,
        actorRole: 'ADMIN',
        action: 'UPLOADED',
        targetType: 'document',
        targetId: String(docByCode.get('LLCC-REG-2026-019')!.id),
        targetRef: 'LLCC-REG-2026-019',
        targetTitle: 'BS Information Technology & Hospitality Tech Curriculum Revision Matrix',
        details: 'Uploaded draft v0.9 curriculum matrix.',
        ipAddress: '10.14.2.18',
        createdAt: new Date('2026-11-16T10:15:00.000Z'),
      },
      {
        userId: faculty.id,
        actorName: faculty.fullName,
        actorRole: 'FACULTY / STAFF',
        action: 'SUBMITTED_REVIEW',
        targetType: 'document',
        targetId: String(docByCode.get('LLCC-OSA-2026-009')!.id),
        targetRef: 'LLCC-OSA-2026-009',
        targetTitle: 'UniFAST RA 10931 Free Higher Education & TES Billing Guidelines',
        details: 'Submitted v1.0 for compliance approval.',
        ipAddress: '10.14.3.41',
        createdAt: new Date('2026-11-10T15:20:00.000Z'),
      },
      {
        userId: superAdmin.id,
        actorName: superAdmin.fullName,
        actorRole: 'SUPER ADMIN',
        action: 'APPROVED',
        targetType: 'document',
        targetId: String(docByCode.get('LLCC-MIS-2026-002')!.id),
        targetRef: 'LLCC-MIS-2026-002',
        targetTitle: 'NPC Data Privacy Act Compliance & Student Records Security Playbook',
        details: 'Approved v2.1 following Q3 Data Privacy Office audit validation.',
        ipAddress: '10.14.1.5',
        createdAt: new Date('2026-09-22T17:05:00.000Z'),
      },
    ]);

    console.log('LLCC PostgreSQL repository seed complete.');
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
