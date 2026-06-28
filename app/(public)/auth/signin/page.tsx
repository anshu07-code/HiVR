import { Suspense } from "react";
import { SignInForm } from "./signin-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, KeyRound } from "lucide-react";
import { ResetSuccessBanner } from "./reset-banner";

export const metadata = { title: "Log in — HiVR" };

export default function SignInPage() {
  return (
    <main className="container flex min-h-[80vh] items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Welcome back</CardTitle>
          <CardDescription>Log in to continue to HiVR.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <ResetSuccessBanner />
          </Suspense>
          <SignInForm />
        </CardContent>
      </Card>
    </main>
  );
}
