import { useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FileUp,
  Upload,
  X,
} from 'lucide-react';
import { uploadDocument } from '../api.ts';
import type {
  ConfidentialityLevel,
  Department,
  DocumentCategory,
  DocumentStatus,
  RetentionPolicy,
  SystemSettings,
  UserAccount,
} from '../types.ts';
import { fileToBase64, formatBytes, getFileExtension } from '../utils/format.ts';

interface UploadDocumentViewProps {
  currentUser: UserAccount;
  categories: DocumentCategory[];
  departments: Department[];
  systemSettings: SystemSettings;
  onUploaded: (docId: number) => Promise<void>;
  onCancel: () => void;
}

const DOC_TYPES = [
  'Memorandum',
  'Resolution',
  'Policy & Guideline',
  'Academic Record',
  'Research Paper',
  'Financial Report',
  'Meeting Minutes',
  'Official Letter',
  'Compliance Filing',
  'Other',
];

export function UploadDocumentView({
  currentUser,
  categories,
  departments,
  systemSettings,
  onUploaded,
  onCancel,
}: UploadDocumentViewProps) {
  const isDeptHead = currentUser.roleSlug === 'department_head';
  const canPublishDirectly =
    currentUser.roleSlug === 'super_admin' || currentUser.roleSlug === 'department_head';

  const orderedDepartments = useMemo(() => {
    const rank: Record<string, number> = { COT: 0, HTM: 1, EDUC: 2 };
    return [...departments].sort(
      (a, b) => (rank[a.code] ?? 99) - (rank[b.code] ?? 99) || a.code.localeCompare(b.code)
    );
  }, [departments]);

  const defaultDept = currentUser.departmentId || orderedDepartments[0]?.id || 1;
  const [departmentId, setDepartmentId] = useState<number>(defaultDept);

  const availableCategories = useMemo(
    () => categories.filter((cat) => cat.departmentId === null || cat.departmentId === departmentId),
    [categories, departmentId]
  );

  const [categoryId, setCategoryId] = useState<number>(
    () =>
      categories.find((c) => c.departmentId === defaultDept || c.departmentId === null)?.id ||
      categories[0]?.id ||
      1
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState('Memorandum');
  const [academicYear, setAcademicYear] = useState(systemSettings.academicYear || 'AY 2026-2027');
  const [docCode, setDocCode] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [confidentiality, setConfidentiality] = useState<ConfidentialityLevel>('Internal');
  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPolicy>('5 Years');
  const [status, setStatus] = useState<DocumentStatus>(canPublishDirectly ? 'Approved' : 'Pending');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ id: number; docCode: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedList =
    systemSettings.allowedFormats.length > 0
      ? systemSettings.allowedFormats
      : ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'csv', 'txt', 'md'];
  const maxBytes = (systemSettings.maxUploadMb || 25) * 1024 * 1024;

  const handleDepartmentChange = (nextDeptId: number) => {
    setDepartmentId(nextDeptId);
    const stillValid = categories.some(
      (c) => c.id === categoryId && (c.departmentId === null || c.departmentId === nextDeptId)
    );
    if (!stillValid) {
      const fallback = categories.find(
        (c) => c.departmentId === nextDeptId || c.departmentId === null
      );
      if (fallback) setCategoryId(fallback.id);
    }
  };

  const validateAndAttachFile = (file: File) => {
    setError(null);
    const ext = getFileExtension(file.name).toLowerCase();
    if (!allowedList.includes(ext)) {
      setError(
        `Format .${ext} is not supported. Allowed formats: ${allowedList
          .map((f) => f.toUpperCase())
          .join(', ')}`
      );
      return;
    }
    if (file.size > maxBytes) {
      setError(`File exceeds maximum upload limit of ${systemSettings.maxUploadMb} MB.`);
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' '));
    }

    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      setPreviewUrl(URL.createObjectURL(file));
      setPreviewText(null);
    } else if (
      file.type.startsWith('text/') ||
      ext === 'csv' ||
      ext === 'txt' ||
      ext === 'md'
    ) {
      setPreviewUrl(null);
      file
        .slice(0, 12000)
        .text()
        .then((txt) => setPreviewText(txt))
        .catch(() => setPreviewText(null));
    } else {
      setPreviewUrl(null);
      setPreviewText(null);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndAttachFile(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessInfo(null);

    if (!title.trim()) {
      setError('Document Title is required.');
      return;
    }
    if (!selectedFile) {
      setError('Please select or drag-and-drop a document file to upload.');
      return;
    }

    setSubmitting(true);
    setProgress(22);
    try {
      const fileBase64 = await fileToBase64(selectedFile);
      setProgress(64);
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const created = await uploadDocument({
        docCode: docCode.trim() || undefined,
        title: title.trim(),
        description: description.trim(),
        categoryId,
        departmentId,
        documentType,
        academicYear: academicYear.trim() || systemSettings.academicYear,
        status,
        confidentiality,
        retentionPolicy,
        tags,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || 'application/octet-stream',
        fileBase64,
      });
      setProgress(100);
      setSuccessInfo(created);
      await onUploaded(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setProgress(0);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDept = orderedDepartments.find((d) => d.id === departmentId);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="rounded-xl bg-white border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-llcc-navy">Upload Document</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Every uploaded file is assigned to a college repository (COT, HTM, or EDUC) with SHA-256
              integrity verification.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Back to Repository
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successInfo && (
          <div
            role="status"
            className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              Document saved successfully under reference{' '}
              <span className="font-mono font-bold">{successInfo.docCode}</span>.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Metadata Fields */}
          <div className="lg:col-span-7 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Document Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Academic Calendar Revision AY 2026-2027"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-llcc-royal focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Document Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Summary of scope, signatory, or archival context..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-llcc-royal focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  College Department <span className="text-red-500">*</span>
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => handleDepartmentChange(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-llcc-royal focus:outline-none"
                >
                  {orderedDepartments.map((dept) => {
                    const disabled =
                      isDeptHead &&
                      currentUser.departmentId !== null &&
                      dept.id !== currentUser.departmentId;
                    return (
                      <option key={dept.id} value={dept.id} disabled={disabled}>
                        {dept.code} — {dept.name}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Document Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-llcc-royal focus:outline-none"
                >
                  {availableCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.departmentCode ? `[${cat.departmentCode}] ` : ''}
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Document Type
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-llcc-royal focus:outline-none"
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Academic Year
                </label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="AY 2026-2027"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-llcc-royal focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confidentiality Level
                </label>
                <select
                  value={confidentiality}
                  onChange={(e) => setConfidentiality(e.target.value as ConfidentialityLevel)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-llcc-royal focus:outline-none"
                >
                  <option value="Internal">Internal</option>
                  <option value="Restricted">Restricted</option>
                  <option value="Confidential">Confidential</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Retention Policy
                </label>
                <select
                  value={retentionPolicy}
                  onChange={(e) => setRetentionPolicy(e.target.value as RetentionPolicy)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-llcc-royal focus:outline-none"
                >
                  <option value="3 Years">3 Years</option>
                  <option value="5 Years">5 Years</option>
                  <option value="7 Years">7 Years</option>
                  <option value="Permanent">Permanent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Workflow Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DocumentStatus)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-llcc-royal focus:outline-none"
                >
                  <option value="Draft">Draft (Save privately)</option>
                  <option value="Pending">Pending (Submit for Approval)</option>
                  {canPublishDirectly && (
                    <option value="Approved">Approved (Publish directly)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Uploaded By
                </label>
                <input
                  type="text"
                  readOnly
                  value={currentUser.fullName}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tags and Keywords
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="syllabus, lab, 2026 (comma-separated)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-llcc-royal focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Document ID Override (Optional)
                </label>
                <input
                  type="text"
                  value={docCode}
                  onChange={(e) => setDocCode(e.target.value)}
                  placeholder={`Auto: LLCC-${selectedDept?.code || 'DEPT'}-2026-XXX`}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:border-llcc-royal focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Right Dropzone + Preview */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                File Upload <span className="text-red-500">*</span>
              </label>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  dragActive
                    ? 'border-llcc-royal bg-blue-50/70'
                    : 'border-slate-300 bg-slate-50/60 hover:border-llcc-royal hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={allowedList.map((ext) => `.${ext}`).join(',')}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) validateAndAttachFile(f);
                  }}
                  className="hidden"
                />
                <FileUp className="h-8 w-8 mx-auto text-llcc-royal" />
                <p className="mt-2 text-sm font-semibold text-llcc-navy">
                  Drag &amp; drop document here, or browse files
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Max {systemSettings.maxUploadMb} MB ·{' '}
                  {allowedList.slice(0, 9).map((e) => e.toUpperCase()).join(', ')}
                </p>
              </div>

              {selectedFile && (
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="h-5 w-5 text-llcc-royal shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {selectedFile.name}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {getFileExtension(selectedFile.name)} · {formatBytes(selectedFile.size)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                        setPreviewText(null);
                      }}
                      className="text-slate-400 hover:text-red-600 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {previewUrl && selectedFile.type.startsWith('image/') && (
                    <img
                      src={previewUrl}
                      alt="Upload preview"
                      className="max-h-48 w-full object-contain rounded-lg border border-slate-100 bg-slate-50"
                    />
                  )}
                  {previewUrl && selectedFile.type === 'application/pdf' && (
                    <iframe
                      src={previewUrl}
                      title="PDF preview"
                      className="w-full h-48 rounded-lg border border-slate-200"
                    />
                  )}
                  {previewText !== null && (
                    <pre className="max-h-44 overflow-auto rounded-lg bg-slate-900 text-slate-100 p-3 text-[11px] font-mono">
                      {previewText}
                    </pre>
                  )}
                </div>
              )}

              {progress > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600">
                      {progress === 100 ? 'Upload complete' : 'Uploading and hashing...'}
                    </span>
                    <span className="font-semibold text-llcc-navy tabular-nums">{progress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-llcc-royal transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-llcc-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-llcc-royal disabled:opacity-60 transition-colors"
              >
                <Upload className="h-4 w-4" />
                {submitting ? 'Uploading...' : 'Save to Repository'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
