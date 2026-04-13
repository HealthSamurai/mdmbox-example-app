import type { PatientFullInfo, PatientSummary as PatientSummaryType } from "@/api/types";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { toast, FieldDisplay, MdmTabs as Tabs } from "@/components/ui";
import { toUSformat } from "@/lib/utils";

type PatientInfoProps = {
  patient: PatientSummaryType;
};

function PatientInfo({ patient }: PatientInfoProps) {
  const patientFullAddress = [patient.state, patient.city, patient.street].filter(Boolean);
  return (
    <div className="p-6">
      <div className="space-y-2 text-text-secondary">
        <FieldDisplay label="ID" value={patient.id} />
        <FieldDisplay
          label="Name"
          value={`${patient.givenNames ? patient.givenNames.join(" ") : ""} ${patient.family || ""}`}
        />
        <FieldDisplay label="Created" value={toUSformat(patient.createdAt)} />
        <FieldDisplay
          label="Last Updated"
          value={toUSformat(patient.updatedAt ?? patient.createdAt)}
        />
        <FieldDisplay label="Gender" value={patient.gender} />
        <FieldDisplay label="Street" value={patient.street} />
        <FieldDisplay label="ZIP" value={patient.zip} />
        <FieldDisplay
          label="Full address"
          value={patientFullAddress.join(" ")}
        />
        <FieldDisplay label="Phone number" value={patient.phone} />
        <FieldDisplay label="Email" value={patient.email} />
      </div>
    </div>
  );
}

type PatientSummaryProps = {
  patientId: string;
};

export function PatientSummary({ patientId }: PatientSummaryProps) {
  const [patient, setPatient] = useState<PatientFullInfo>();

  useEffect(() => {
    api
      .getPatientSummary(patientId)
      .then(setPatient)
      .catch((error) => {
        toast.error({
          title: "Failed to load patient summary",
          description:
            error?.body?.issue?.[0]?.diagnostics ||
            error?.message ||
            "An unexpected error occurred",
        });
      });
  }, [patientId]);

  if (!patient) return null;

  return (
    <Tabs
      defaultValue="summary"
      tabs={[
        {
          id: "summary",
          label: "Summary",
          content: <PatientInfo patient={patient.summary} />,
        },
      ]}
    />
  );
}
