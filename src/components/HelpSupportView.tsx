import { BookOpen, FileCheck2, HelpCircle, Mail, Shield } from 'lucide-react';
import type { SystemSettings } from '../types.ts';

interface HelpSupportViewProps {
  systemSettings: SystemSettings;
}

export function HelpSupportView({ systemSettings }: HelpSupportViewProps) {
  return (
    <div className="max-w-5xl space-y-5">
      <div className="rounded-xl glass-panel p-6">
        <div className="flex items-center gap-2.5">
          <HelpCircle className="h-5 w-5 text-llcc-royal" />
          <h2 className="font-display text-xl font-bold text-llcc-navy">
            Help and Institutional Support
          </h2>
        </div>
        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
          Operational reference for the {systemSettings.collegeName} {systemSettings.systemTitle}.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-xl glass-panel p-5 space-y-3">
          <div className="flex items-center gap-2 text-llcc-navy font-display font-bold text-sm">
            <BookOpen className="h-4 w-4 text-llcc-royal" />
            <span>Document Lifecycle Guide</span>
          </div>
          <ol className="space-y-2 text-xs text-slate-600 list-decimal pl-4 leading-relaxed">
            <li>
              <span className="font-semibold text-slate-800">Upload &amp; Classify:</span> Select
              the official Category, Department, Academic Year, and Retention Policy (3, 5, 7
              Years, or Permanent).
            </li>
            <li>
              <span className="font-semibold text-slate-800">Submission &amp; Review:</span>{' '}
              Faculty and Staff uploads enter <span className="font-semibold">Pending</span> for
              Records Office / Department Admin review.
            </li>
            <li>
              <span className="font-semibold text-slate-800">Version Control:</span> Commit minor
              (+0.1) or major (+1.0) revisions inside the Document Inspector. Every historical file
              keeps its SHA-256 checksum.
            </li>
            <li>
              <span className="font-semibold text-slate-800">Retention Monitoring:</span> Active
              documents within 90 days of retention expiration appear highlighted on the Dashboard
              and Repository table.
            </li>
          </ol>
        </div>

        <div className="rounded-xl glass-panel p-5 space-y-3">
          <div className="flex items-center gap-2 text-llcc-navy font-display font-bold text-sm">
            <Shield className="h-4 w-4 text-llcc-royal" />
            <span>Role Permissions Reference</span>
          </div>
          <div className="space-y-2 text-xs text-slate-600">
            <div>
              <span className="font-semibold text-llcc-navy">SUPER ADMIN:</span> Full system
              configuration, branding, user/role administration, departments, approvals, and exports.
            </div>
            <div>
              <span className="font-semibold text-llcc-navy">DEAN:</span> Centralized viewer and
              approver across COT, HTM, and EDUC repositories, analytics, and activity logs without
              altering departmental ownership.
            </div>
            <div>
              <span className="font-semibold text-llcc-navy">DEPARTMENT HEAD:</span> Full management
              of their assigned college repository (COT, HTM, or EDUC), departmental approvals,
              categories, archives, and department staff/student accounts.
            </div>
            <div>
              <span className="font-semibold text-llcc-navy">STAFF:</span> Scoped to their assigned
              department to upload records, manage owned revisions, share files, and track approvals.
            </div>
            <div>
              <span className="font-semibold text-llcc-navy">STUDENT:</span> View and download
              access to approved published records and documents explicitly shared with students.
            </div>
          </div>
        </div>

        <div className="rounded-xl glass-panel p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-llcc-navy font-display font-bold text-sm">
            <FileCheck2 className="h-4 w-4 text-llcc-royal" />
            <span>Supported Formats &amp; Limits</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Maximum upload size:{' '}
            <span className="font-semibold text-llcc-navy tabular-nums">
              {systemSettings.maxUploadMb} MB
            </span>
          </p>
          <p className="text-xs font-mono text-slate-700">
            {systemSettings.allowedFormats.map((f) => f.toUpperCase()).join(', ')}
          </p>
        </div>

        <div className="rounded-xl glass-panel p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-llcc-navy font-display font-bold text-sm">
            <Mail className="h-4 w-4 text-llcc-royal" />
            <span>Records &amp; MIS Helpdesk</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            For account provisioning, department reassignment, or archival retention questions,
            contact the LLCC Management Information Systems &amp; Records Control Office:
          </p>
          <div className="text-xs text-llcc-navy font-semibold">
            mis.records@llcc.edu.ph · {systemSettings.campusAddress}
          </div>
        </div>
      </div>
    </div>
  );
}
