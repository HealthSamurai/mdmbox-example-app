import type { GetPatientsFilter, SearchParamsObj } from "@/api/types";

export const searchParamsToGetPatientsFilter = (
  searchParams: SearchParamsObj
): GetPatientsFilter => ({
  id: (searchParams["id"] as string) || undefined,
  firstName: (searchParams["firstname"] as string) || undefined,
  lastName: (searchParams["lastname"] as string) || undefined,
  birthdate: (searchParams["birthdate"] as string) || undefined,
  phone: (searchParams["phonenumber"] as string) || undefined,
  email: (searchParams["email"] as string) || undefined,
});

export function paramsToObject(searchParams: URLSearchParams): SearchParamsObj {
  const obj: SearchParamsObj = {};
  const keys = new Set([...searchParams.keys()]);
  for (const key of keys) {
    const values = searchParams.getAll(key);
    obj[key] = values.length === 1 ? values[0] : values;
  }
  return obj;
}

const dateFormatterUS = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export const toUSformat = (dateString: string): string => {
  return dateFormatterUS.format(new Date(dateString));
};
