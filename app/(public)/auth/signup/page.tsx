import { Suspense } from "react";
import { SignUpForm } from "./signup-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Sign up — HiVR" };

export default function SignUpPage() {
  return (
    <main className="container flex min-h-[80vh] items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Create your account</CardTitle>
          <CardDescription>It's free. No card required.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense><SignUpForm /></Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
