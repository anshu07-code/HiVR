"use client";

import { useContractRealtime } from "@/app/dashboard/realtime-hooks";
export function ContractRealtime({ contractId }: { contractId: string }) {
  useContractRealtime(contractId);
  return null;
}
