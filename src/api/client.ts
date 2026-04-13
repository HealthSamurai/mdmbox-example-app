import { makeAidboxClient, makeClient as makeMdmboxClient } from "mdmbox-sdk";
import type {
  PatientRow,
  PatientFullInfo,
  GetPatientsFilter,
  MergeTaskRow,
  MergeDetail,
  GetMergesFilter,
  ProvenanceEntity,
  MergeStatus,
} from "./types";

const aidbox = makeAidboxClient({ baseurl: window.location.origin });

export const mdmbox = makeMdmboxClient({ baseUrl: `${window.location.origin}/mdm-api` });

// ==================== Aidbox helpers via rawRequest ====================

async function aidboxFetch(method: string, url: string): Promise<any> {
  const resp = await aidbox.rawRequest({ method: method as any, url });
  return resp.response.json();
}

async function aidboxRead(type: string, id: string): Promise<any> {
  return aidboxFetch("GET", `/fhir/${type}/${id}`);
}

async function aidboxSearch(
  type: string,
  params: [string, string][]
): Promise<{ entries: any[]; total?: number }> {
  const qs = new URLSearchParams(params).toString();
  const bundle = await aidboxFetch("GET", `/fhir/${type}?${qs}`);
  return {
    entries: bundle.entry?.map((e: any) => e.resource) ?? [],
    total: bundle.total,
  };
}

async function aidboxQuery<T = any>(
  name: string,
  params?: Record<string, string | number | undefined>
): Promise<{ data: T[]; total?: number }> {
  const filtered = Object.entries(params ?? {}).filter(
    ([, v]) => v !== undefined && v !== ""
  );
  const qs = filtered.length
    ? "?" + new URLSearchParams(filtered.map(([k, v]) => [k, String(v)])).toString()
    : "";
  const bundle = await aidboxFetch("GET", `/$query/${name}${qs}`);
  const entries = bundle.entry || bundle.data || [];
  return {
    data: entries.map((e: any) => (e.resource ?? e) as T),
    total: bundle.total,
  };
}

// ==================== Unwrap helper ====================

function unwrap<T>(result: { isErr(): boolean; value: any }): T {
  if (result.isErr()) {
    const outcome = result.value?.resource;
    const msg =
      outcome?.issue?.[0]?.details?.text ??
      outcome?.issue?.[0]?.diagnostics ??
      "Request failed";
    throw Object.assign(new Error(msg), { outcome });
  }
  return result.value;
}

// ==================== API ====================

export const api = {
  async getPatients(params: {
    page: number;
    count: number;
    filter: GetPatientsFilter;
    sortDir?: string;
    sortBy?: string;
  }): Promise<{ items: PatientRow[]; total: number }> {
    const { page, count, filter, sortDir, sortBy } = params;
    const result = await aidboxQuery<PatientRow>("patients", {
      _page: page,
      _count: count,
      _sortDir: sortDir,
      _sortBy: sortBy,
      id: filter.id,
      firstName: filter.firstName,
      lastName: filter.lastName,
      birthdate: filter.birthdate,
      phone: filter.phone,
      email: filter.email,
    });
    return { items: result.data, total: result.total ?? 0 };
  },

  async matchPatientById(
    id: string,
    params: {
      page?: number;
      count?: number;
      model?: string;
      threshold?: number;
      projectionId?: string;
    } = {}
  ) {
    const result = await mdmbox.matchById({
      resourceType: "Patient",
      id,
      modelId: params.model,
      threshold: params.threshold,
      page: params.page,
      count: params.count,
      projectionId: params.projectionId,
    });
    return unwrap<{ resource: import("mdmbox-sdk").MatchResponse }>(result).resource;
  },

  async getModel(id: string) {
    const result = await mdmbox.getModel({ id });
    return unwrap<{ resource: import("mdmbox-sdk").MatchingModel }>(result).resource;
  },

  async getMergePair(params: { sourceId: string; targetId: string }) {
    const [source, target] = await Promise.all([
      aidboxRead("Patient", params.sourceId),
      aidboxRead("Patient", params.targetId),
    ]);
    return { sourcePatient: source, targetPatient: target };
  },

  async getMerges(params: {
    page: number;
    count: number;
    filter: GetMergesFilter;
  }): Promise<{ items: MergeTaskRow[]; total: number }> {
    const { page, count, filter } = params;
    const searchParams: [string, string][] = [
      ["code", "merge"],
      ["_count", String(count)],
      ["_page", String(page)],
      ["_sort", "-authored-on"],
    ];
    if (filter.status) searchParams.push(["business-status", filter.status]);
    if (filter.source) searchParams.push(["subject", filter.source]);
    if (filter.target) searchParams.push(["focus", filter.target]);
    if (filter.startDate)
      searchParams.push(["authored-on", `ge${filter.startDate}`]);
    else if (filter.endDate)
      searchParams.push(["authored-on", `le${filter.endDate}`]);

    const { entries, total } = await aidboxSearch("Task", searchParams);
    const items: MergeTaskRow[] = entries.map((t: any) => ({
      id: t.id,
      status: (t.businessStatus?.coding?.[0]?.code ?? "merged") as MergeStatus,
      source: t.for?.reference,
      target: t.focus?.reference,
      date: t.authoredOn,
    }));
    return { items, total: total ?? items.length };
  },

  async getMerge(id: string): Promise<MergeDetail> {
    const task = await aidboxRead("Task", id);
    const { entries: provResults } = await aidboxSearch("Provenance", [
      ["target", `Task/${id}`],
      ["_count", "1"],
    ]);
    const provenance: any = provResults[0];

    const entities: ProvenanceEntity[] = (provenance?.entity ?? []).map(
      (e: any) => ({
        role: e.role,
        what: e.what?.reference ?? "",
      })
    );

    const entityRefs = new Set(
      entities.map((e) => e.what.replace(/\/_history\/.+$/, ""))
    );
    const taskRef = `Task/${task.id}`;
    const targetRefs: string[] = (provenance?.target ?? [])
      .map((t: any) => t.reference as string)
      .filter(Boolean);
    const createdRefs = targetRefs.filter(
      (ref) => ref !== taskRef && !entityRefs.has(ref)
    );

    return { task, provenance, entities, createdRefs };
  },

  async readResource(reference: string) {
    // handles "Patient/123/_history/2" and "Patient/123"
    const parts = reference.split("/");
    const type = parts[0];
    const rest = parts.slice(1).join("/");
    return aidboxRead(type, rest);
  },

  async readVersionedResource(reference: string) {
    return this.readResource(reference);
  },

  async getPatientSummary(id: string): Promise<PatientFullInfo> {
    const patient = await aidboxRead("Patient", id);
    return {
      summary: {
        id: patient.id,
        givenNames: patient.name?.[0]?.given ?? [],
        family: patient.name?.[0]?.family ?? "",
        birthDate: patient.birthDate ?? "",
        gender: patient.gender ?? "unknown",
        street: patient.address?.[0]?.line?.[0],
        city: patient.address?.[0]?.city,
        state: patient.address?.[0]?.state,
        zip: patient.address?.[0]?.postalCode,
        country: patient.address?.[0]?.country,
        phone: patient.telecom?.find((t: any) => t.system === "phone")?.value,
        email: patient.telecom?.find((t: any) => t.system === "email")?.value,
        createdAt: patient.meta?.lastUpdated ?? "",
      },
      mergeHistory: [],
    };
  },
};
