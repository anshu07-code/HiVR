"use client";

import * as React from "react";
import { WalletCreditedPopup } from "@/components/wallet/wallet-credited-popup";
import { createClient } from "@/lib/supabase/client";

export function DashboardClientWrapper({ userId, children }: { userId: string; children: React.ReactNode }) {
  return (
    <>
      {children}
      <WalletCreditedPopup userId={userId} />
    </>
  );
}
