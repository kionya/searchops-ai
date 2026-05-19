import { compliancePackage } from "@searchops/compliance";
import { seoCorePackage } from "@searchops/seo-core";

export const workordersPackage = "workorders" as const;

export const workOrderInputSources = [seoCorePackage, compliancePackage] as const;