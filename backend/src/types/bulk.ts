export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum SourceType {
  FILE = 'file',
  PASTE = 'paste',
}

export interface BulkJob {
  id: string;
  userId: string;
  sourceType: SourceType;
  filename?: string;
  totalCount: number;
  processedCount: number;
  status: JobStatus;
  validCount: number;
  invalidCount: number;
  riskyCount: number;
  unknownCount: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  resultExpiresAt?: Date;
  resultUrl?: string;
}

export interface VerificationResult {
  id: string;
  jobId: string;
  email: string;
  status: string;
  deliverable: boolean;
  risky: boolean;
  unknown: boolean;
  riskScore: number;
  mxRecords?: Record<string, any>;
  smtpProvider?: string;
  isFreeEmail: boolean;
  isRoleBased: boolean;
  isCatchAll: boolean;
  isDisposable: boolean;
  hasMxRecords: boolean;
  createdAt: Date;
}

export interface BulkUploadResponse {
  jobId: string;
  totalCount: number;
  creditsDeducted: number;
}

export interface ProgressEvent {
  jobId: string;
  processedCount: number;
  totalCount: number;
  percentage: number;
  validCount: number;
  invalidCount: number;
  riskyCount: number;
  unknownCount: number;
}

export interface JobStatusResponse {
  job: BulkJob;
  progress: ProgressEvent;
}
