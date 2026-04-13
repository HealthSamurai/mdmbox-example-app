export type PatientRow = {
  id: string;
  firstname?: string;
  lastname?: string;
  phonenumber?: string;
  email?: string;
  birthdate?: string;
  gender?: "male" | "female" | "other" | "unknown";
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  encounters?: number;
};

export type PatientSummary = {
  id: string;
  givenNames: string[];
  family: string;
  birthDate: string;
  gender: "male" | "female" | "other" | "unknown";
  addressLines?: string[];
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  email?: string;
  createdAt: string;
  updatedAt?: string;
};

export type PatientMergeHistory = {
  id: string;
  status: string;
  user?: string;
  date?: string;
  sourcePatientId?: string;
  targetPatientId?: string;
};

export type PatientFullInfo = {
  summary: PatientSummary;
  mergeHistory: PatientMergeHistory[];
};

export type GetPatientsFilter = {
  id?: string;
  firstName?: string;
  lastName?: string;
  birthdate?: string;
  phone?: string;
  email?: string;
};

export type SearchParamsObj = {
  [key: string]: string | string[] | undefined;
};

export type { MatchResult, MatchResponse, MatchingModel } from "mdmbox-sdk";

export type PatientMatchRow = {
  id: string;
  firstname: string;
  lastname: string;
  birthdate: string;
  email: string;
  gender: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  encounters: number;
  weight?: number;
  duplicate: boolean;
};

export type MergeStatus = "merged" | "unmerged";

export type MergeTaskRow = {
  id: string;
  status: MergeStatus;
  source?: string; // e.g. "Patient/123"
  target?: string; // e.g. "Patient/456"
  date?: string; // Task.authoredOn (ISO)
};

export type ProvenanceEntity = {
  role: "revision" | "removal" | string;
  /** versioned reference, e.g. "Patient/123/_history/2" */
  what: string;
};

export type MergeDetail = {
  task: Record<string, any>;
  provenance?: Record<string, any>;
  /** parsed from provenance.entity */
  entities: ProvenanceEntity[];
  /** parsed from provenance.target — references that were created (in target but not in entity) */
  createdRefs: string[];
};

export type GetMergesFilter = {
  status?: MergeStatus;
  source?: string;
  target?: string;
  startDate?: string; // ISO
  endDate?: string; // ISO
};
