import { Suspense } from "react";
import { ForgotForm } from "./forgot-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Mail } from "lucide-react";

export const metadata = { title: "Forgot password — HiVR" };

export default function ForgotPasswordPage() {
  return (
    <main className="container flex min-h-[80vh] items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-2xl">
            <KeyRound className="h-5 w-5" /> Forgot your password?
          </CardTitle>
          <CardDescription>
            Enter the email on your account. We'll send a 6-digit code to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
            <ForgotForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
