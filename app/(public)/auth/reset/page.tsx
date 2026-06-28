import { Suspense } from "react";
import { ResetForm } from "./reset-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, ShieldCheck } from "lucide-react";

export const metadata = { title: "Reset password — HiVR" };

export default function ResetPasswordPage() {
  return (
    <main className="container flex min-h-[80vh] items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-2xl">
            <KeyRound className="h-5 w-5" /> Reset your password
          </CardTitle>
          <CardDescription>
            Enter the 6-digit code we emailed you, then choose a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
            <ResetForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
