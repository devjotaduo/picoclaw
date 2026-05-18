import type { StepKey } from "./constants";

export type Basic = {
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_whatsapp: string;
  city_region: string;
  site_instagram: string;
};

export type BasicErrors = Partial<Record<keyof Basic, string>>;

export type TouchedBasic = Partial<Record<keyof Basic, boolean>>;

export type SummaryPreview = {
  title: string;
  headline: string;
  highlights: string[];
  next_steps: string[];
};

export const emptyBasic: Basic = {
  company_name: "",
  contact_name: "",
  contact_email: "",
  contact_whatsapp: "",
  city_region: "",
  site_instagram: "",
};

export type { StepKey };
