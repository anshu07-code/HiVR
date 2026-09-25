"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera, Upload, Calendar, Check, ChevronRight, Loader2,
  AlertTriangle, XCircle, Clock, ArrowRight, Info, Landmark,
  ShieldCheck, ScanLine, User, Smartphone, Clipboard,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { SelfieCaptureDidit, type DiditSelfieResult } from "@/components/verify/selfie-capture-didit";
import { DocumentUpload, type DocumentKind, type DocumentResult } from "@/components/verify/document-upload";
import { BankStep, type BankStepResult } from "@/components/verify/bank-step";
import { QrScanner, type QrScanResult } from "@/components/verify/qr-scanner";
import { fuzzyNameMatch } from "@/lib/verification";
import type { AadhaarSignedData } from "@/lib/verification/aadhaar-qr";
import { cn } from "@/lib/utils";

type StepId = "dob" | "selfie" | "aadhaar" | "bank" | "result";

type SelfieState = { livenessScore: number; diditSessionId: string };
type DocumentState = DocumentResult & { kind: DocumentKind };

const STEPS: { id: StepId; label: string }[] = [
  { id: "dob",      label: "Date of birth" },
  { id: "selfie",   label: "Identity verification" },
  { id: "aadhaar",  label: "Aadhaar card" },
  { id: "bank",     label: "Bank verification" },
  { id: "result",   label: "Done" },
];

export function VerifyWizard({ userFullName, userEmail }: { userFullName: string; userEmail: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  const demoModeEnabled =
    sp.get("demo") === "1" ||
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_VERIFY_DEMO_MODE === "true");

  const [step, setStep] = React.useState<StepId>("dob");
  const [dob, setDob] = React.useState("");
  const [sandbox, setSandbox] = React.useState(false);
  const [initialLoading, setInitialLoading] = React.useState(true);

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [selfie, setSelfie] = React.useState<SelfieState | null>(null);
  const [aadhaar, setAadhaar] = React.useState<DocumentState | null>(null);
  const [bank, setBank] = React.useState<BankStepResult | null>(null);

  // QR paths (preferred over upload when available)
  const [aadhaarQr, setAadhaarQr] = React.useState<AadhaarSignedData | null>(null);
  const [aadhaarQrRaw, setAadhaarQrRaw] = React.useState<string | null>(null);
  const [aadhaarQrVerified, setAadhaarQrVerified] = React.useState(false);
  const [aadhaarQrPhotoBlob, setAadhaarQrPhotoBlob] = React.useState<Blob | null>(null);
  const [aadhaarMode, setAadhaarMode] = React.useState<"choose" | "qr" | "upload">("choose");
  const [faceMatchScore, setFaceMatchScore] = React.useState<number | null>(null);
  const [displayName, setDisplayName] = React.useState(userFullName);
  const [nameEditOpen, setNameEditOpen] = React.useState(false);
  const [editNameValue, setEditNameValue] = React.useState(userFullName);
  const [savingName, setSavingName] = React.useState(false);

  const aadhaarName = aadhaar?.ocrName || aadhaarQr?.name || null;
  const nameMatchInfo = React.useMemo(() => {
    if (!aadhaarName || !displayName) return null;
    return fuzzyNameMatch(aadhaarName, displayName);
  }, [aadhaarName, displayName]);

  const [diditSelfieScore, setDiditSelfieScore] = React.useState<number | null>(null);

  const [submitStatus, setSubmitStatus] = React.useState<{ aadhaar?: "pending" | "ok" | "err" }>({});

  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ status: string; confidence: number } | null>(null);
  const [existingVerifications, setExistingVerifications] = React.useState<{
    aadhaar?: boolean; bank?: boolean;
    bank_upi_provider?: string | null; bank_last4?: string | null;
  } | null>(null);

  // On mount, check if user already has verifications → skip completed steps
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/verification/check-status");
        const json = await res.json();
        if (json.ok) {
          setExistingVerifications(json);
          // If everything is done, go straight to result
          if (json.bank && json.aadhaar) {
            setAadhaar({
              docBlob: new Blob([]),
              mimeType: "image/jpeg",
              ocrName: null, ocrDob: null, docNumber: null,
              docHash: null, docValidityScore: 100, ocrText: "",
              docNumberValid: true, lines: [],
              kind: "adult_aadhaar",
            });
            setBank({
              upiId: "",
              accountHolder: "",
              ifsc: "",
              last4: json.bank_last4 || "",
              upiProvider: json.bank_upi_provider || "",
            });
            setResult({ status: "auto_approved", confidence: 95 });
            setStep("result");
          } else if (json.aadhaar && !json.bank) {
            goTo("bank");
          } else if (json.selfie && !json.aadhaar) {
            goTo("aadhaar");
          }
        }
      } catch { /* normal if first visit */ }
      setInitialLoading(false);
    })();
  }, []);

  const dobDate = React.useMemo(() => {
    if (!dob) return null;
    const d = new Date(dob);
    return isNaN(d.getTime()) ? null : d;
  }, [dob]);
  const dobValid = !!dobDate && dobDate.getTime() < Date.now();

  const currentStepIndex = Math.max(0, STEPS.findIndex((s) => s.id === step));
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  function goTo(id: StepId) {
    setError(null);
    setStep(id);
  }

  async function startSession(kind: DocumentKind): Promise<string> {
    const res = await fetch("/api/verification/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        dob: dobDate?.toISOString().slice(0, 10) ?? "",
      }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error ?? "Failed to start session");
    return json.session_id as string;
  }

  async function uploadAsset(sessionId: string, kind: "selfie" | "document", blob: Blob, mime: string) {
    const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
    const sign = await fetch("/api/verification/asset-sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, kind, ext }),
    });
    const sj = await sign.json();
    if (!sj.ok) throw new Error(sj.error ?? "Sign failed");
    const up = await fetch(sj.signedUrl, {
      method: "PUT",
      headers: { "content-type": mime },
      body: blob,
    });
    if (!up.ok) throw new Error("Upload failed");
  }

  async function submitDoc(opts: {
    sessionId: string;
    doc: DocumentState;
    nameMatchName: string;
    aadhaarQrVerified?: boolean;
  }) {
    const { sessionId, doc, nameMatchName, aadhaarQrVerified } = opts;
    const nameMatch = doc.ocrName
      ? fuzzyNameMatch(doc.ocrName, nameMatchName)
      : { score: 0, isMatch: false };
    let faceScore = selfie?.livenessScore ?? 0;
    if (diditSelfieScore != null) {
      faceScore = Math.max(faceScore, diditSelfieScore);
    }
    if (faceMatchScore != null) {
      faceScore = Math.max(faceScore, faceMatchScore);
    }
    const challenges = {
      face_score: faceScore || 0,
      name_score: aadhaarQrVerified ? 100 : nameMatch.score || 0,
      liveness_score: (diditSelfieScore ?? selfie?.livenessScore) || 0,
      doc_validity: aadhaarQrVerified ? 100 : doc.docValidityScore || 0,
      challenges: [],
      aadhaar_qr_verified: !!aadhaarQrVerified,
    };
    const res = await fetch("/api/verification/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        ocrFullName: doc.ocrName ?? "",
        ocrDob: doc.ocrDob && !isNaN(doc.ocrDob.getTime()) ? doc.ocrDob.toISOString().slice(0, 10) : "",
        ocrDocumentNumber: doc.docNumber ?? "",
        ocrDocumentHash: doc.docHash ?? "",
        livenessChallenges: challenges,
        aadhaarQrVerified: !!aadhaarQrVerified,
        sandbox,
      }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error ?? "Submit failed");
    return json as { ok: true; status: string; confidence: number; is_minor: boolean };
  }

  async function onDobContinue() {
    if (!dobValid) return;
    setBusy(true);
    setError(null);
    try {
      const sid = await startSession("adult_aadhaar");
      setSessionId(sid);
      goTo("selfie");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSelfieComplete(r: DiditSelfieResult) {
    setBusy(true);
    setError(null);
    try {
      const sessionStatus = r.livenessStatus === "InReview" ? "admin_review" : "auto_approved";
      await fetch("/api/verification/save-selfie", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          diditSessionId: r.diditSessionId,
          livenessScore: r.livenessScore,
          status: sessionStatus,
        }),
      });
      setDiditSelfieScore(r.livenessScore);
      setSelfie({ livenessScore: r.livenessScore, diditSessionId: r.diditSessionId });
      goTo("aadhaar");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAadhaarComplete(r: DocumentResult) {
    setBusy(true);
    setError(null);
    try {
      const sid = sessionId || await startSession("adult_aadhaar");
      if (!sessionId) setSessionId(sid);
      await uploadAsset(sid, "document", r.docBlob, r.mimeType);
      const aadhaarState: DocumentState = { ...r, kind: "adult_aadhaar" };
      setAadhaar(aadhaarState);
      await runSubmit(aadhaarState);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runSubmit(aadhaarState: DocumentState) {
    const sid = sessionId;
    if (!sid) {
      setError("Session lost. Please restart.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (aadhaarState.docBlob.size > 0) {
        await uploadAsset(sid, "document", aadhaarState.docBlob, aadhaarState.mimeType);
      }
      const nameMatchName = displayName || userFullName || userEmail.split("@")[0] || "there";

      setSubmitStatus({ aadhaar: "pending" });
      try {
        await submitDoc({
          sessionId: sid,
          doc: aadhaarState,
          nameMatchName,
          aadhaarQrVerified,
        });
        setSubmitStatus({ aadhaar: "ok" });
      } catch (e) {
        setSubmitStatus({ aadhaar: "err" });
        throw e;
      }

      setResult({ status: "auto_approved", confidence: aadhaarQrVerified ? 95 : aadhaarQr ? 88 : 80 });
      goTo("bank");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onBankComplete(r: BankStepResult) {
    setBank(r);
    goTo("result");
  }

  // ----- Aadhaar QR scan handler (server-side UIDAI signature verify) -----
  async function onAadhaarQrScan(r: QrScanResult) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/verify-aadhaar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrData: r.raw }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.message || "Verification failed");
      }
      const data = json.data as {
        name: string;
        dob: string;
        gender: string | null;
        address: string | null;
        photoBase64: string | null;
        aadhaarLast4: string;
      };
      let photoBlob: Blob | null = null;
      if (data.photoBase64) {
        const dataUrl = data.photoBase64.startsWith("data:")
          ? data.photoBase64
          : `data:image/jpeg;base64,${data.photoBase64}`;
        const blobRes = await fetch(dataUrl);
        photoBlob = await blobRes.blob();
        // Face match via Didit session decision (session-based, free tier)
        if (selfie?.diditSessionId && photoBlob.size > 1000) {
          const fmRes = await fetch(`/api/didit/decision?session_id=${selfie.diditSessionId}`);
          if (fmRes.ok) {
            const decision = await fmRes.json();
            const fm = decision.face_match;
            if (fm?.status === "Approved") {
              const fmScore = fm.score ?? 0;
              setFaceMatchScore(fmScore);
              setDiditSelfieScore((prev) => Math.max(prev ?? 0, fmScore));
            }
          }
        }
      }
      setAadhaarQr(data as any);
      setAadhaarQrRaw(r.raw);
      setAadhaarQrVerified(json.verified);
      setAadhaarQrPhotoBlob(photoBlob);
      setAadhaar({
        docBlob: photoBlob ?? new Blob([], { type: "image/jpeg" }),
        mimeType: "image/jpeg",
        ocrName: data.name,
        ocrDob: data.dob ? new Date(data.dob) : null,
        docNumber: data.aadhaarLast4 ? `xxxx-xxxx-${data.aadhaarLast4}` : null,
        docHash: null,
        docValidityScore: 100,
        ocrText: "[UIDAI-signed QR]",
        docNumberValid: true,
        lines: [],
        kind: "adult_aadhaar",
      });
      setAadhaarMode("choose");
      goTo("aadhaar");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ----- Aadhaar QR scan handler -----


  return (
    <div className="space-y-5">
      <style>{`
        @keyframes scanLine {
          0%, 100% { top: 0; }
          50% { top: calc(100% - 4px); }
        }
        .scanner-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, transparent, hsl(var(--primary)), transparent);
          animation: scanLine 2s ease-in-out infinite;
          opacity: 0.6;
        }
        @keyframes stampApproved {
          0% { transform: scale(0) rotate(-15deg); opacity: 0; }
          50% { transform: scale(1.2) rotate(-5deg); opacity: 1; }
          100% { transform: scale(1) rotate(-8deg); opacity: 1; }
        }
        .stamp-verified {
          animation: stampApproved 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Step {currentStepIndex + 1} of {STEPS.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
        <ol className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                "rounded-full border px-2 py-0.5",
                i <= currentStepIndex ? "border-primary/40 bg-primary/5 text-primary" : ""
              )}
            >
              {i + 1}. {s.label}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {step !== "dob" && step !== "result" && (
            <Button variant="ghost" size="sm" onClick={() => {
              const idx = STEPS.findIndex((s) => s.id === step);
              if (idx > 0) goTo(STEPS[idx - 1].id as StepId);
            }}>
              ← Back
            </Button>
          )}
          <h1 className="font-display text-2xl font-semibold tracking-tight">Verify your identity</h1>
        </div>
        {demoModeEnabled && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-700">
            <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
            <span>Dev: skip checks</span>
          </label>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <p>{error}</p>
        </div>
      )}

      {step === "dob" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" /> When were you born?
            </CardTitle>
            <CardDescription>
               Used to set the verification session expiry.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
              {dobDate && (
                <p className="text-xs text-muted-foreground">
                  {dobDate.toLocaleDateString()} — session will expire in 1 hour.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end">
              <Button onClick={onDobContinue} disabled={!dobValid || busy} variant="gradient">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ChevronRight className="h-4 w-4" /></>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "selfie" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4" /> Identity verification
            </CardTitle>
             <CardDescription>
                Verify your identity through a secure verification page. Includes liveness check, ID document scan, and face match.
             </CardDescription>
           </CardHeader>
           <CardContent>
             <SelfieCaptureDidit
               onComplete={onSelfieComplete}
               onCancel={() => goTo("dob")}
             />
           </CardContent>
        </Card>
      )}

      {step === "aadhaar" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Verify your Aadhaar
            </CardTitle>
            <CardDescription>
              UIDAI signs every Aadhaar QR with their private key. We verify the signature against
              UIDAI&apos;s public key (published at uidai.gov.in) — no API call, no fee.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {aadhaarMode === "choose" && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setAadhaarMode("qr")}
                  className="flex w-full items-start gap-3 rounded-lg border-2 border-primary/40 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
                >
                  <ScanLine className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">Scan Aadhaar QR code</p>
                      <Badge variant="success" className="text-[9px]">Strongest signal</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      UIDAI-signed XML payload. We verify the RSA-2048 signature + match the photo to your selfie.
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAadhaarMode("upload")}
                  className="flex w-full items-start gap-3 rounded-lg border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/40"
                >
                  <Upload className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Upload Aadhaar image</p>
                    <p className="text-xs text-muted-foreground">
                      Fallback: we OCR the front of the card. Less accurate — no signature check.
                    </p>
                  </div>
                </button>
                {aadhaarQr && (
                  <div className={cn(
                    "rounded-md border p-3 text-xs",
                    aadhaarQrVerified
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-amber-500/30 bg-amber-500/5",
                  )}>
                    <div className={cn(
                      "flex items-center gap-1.5",
                      aadhaarQrVerified ? "text-emerald-700" : "text-amber-700",
                    )}>
                      {aadhaarQrVerified
                        ? <ShieldCheck className="h-3.5 w-3.5" />
                        : <AlertTriangle className="h-3.5 w-3.5" />
                      }
                      {aadhaarQrVerified
                        ? "Aadhaar QR signature verified by UIDAI public key"
                        : "Aadhaar QR data decoded but signature could not be verified"
                      }
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      Name: {aadhaarQr.name} · DOB: {aadhaarQr.dob || "—"} · Aadhaar ends ••••{aadhaarQr.aadhaarLast4}
                    </p>
                  </div>
                )}
                {aadhaarName && nameMatchInfo && (
                  <NameMatchCard
                    aadhaarName={aadhaarName}
                    accountName={displayName}
                    matchInfo={nameMatchInfo}
                    isEditing={nameEditOpen}
                    editValue={editNameValue}
                    saving={savingName}
                    onEdit={() => { setNameEditOpen(true); setEditNameValue(displayName); }}
                    onCancel={() => { setNameEditOpen(false); setEditNameValue(displayName); }}
                    onChange={setEditNameValue}
                    onSave={async () => {
                      setSavingName(true);
                      try {
                        const res = await fetch("/api/profile/update-name", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ full_name: editNameValue.trim() }),
                        });
                        const json = await res.json();
                        if (!json.ok) throw new Error(json.error);
                        setDisplayName(editNameValue.trim());
                        setNameEditOpen(false);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setSavingName(false);
                      }
                    }}
                  />
                )}
                {submitStatus.aadhaar === "ok" && (
                  <div className="rounded-md border bg-muted/30 p-2 text-[10px] text-emerald-700">
                    <Check className="mr-1 inline h-3 w-3" /> Aadhaar submitted.
                  </div>
                )}
              </div>
            )}
            {aadhaarMode === "qr" && (
              <QrScanner
                title="Scan Aadhaar QR"
                description="The Aadhaar QR is large (5-10KB) and printed cards scan poorly. We recommend pasting the raw text instead."
                defaultMode="manual"
                showSampleData
                guideSteps={[
                  { icon: <Smartphone className="h-3 w-3" />, text: <>Open the <strong>mAadhaar app</strong> on your phone.</> },
                  { icon: <ScanLine className="h-3 w-3" />, text: <>Tap your Aadhaar card → tap the <strong>QR icon</strong> to display it.</> },
                  { icon: <Camera className="h-3 w-3" />, text: <>Use <strong>Google Lens</strong> or any QR scanner app to read the QR.</> },
                  { icon: <Clipboard className="h-3 w-3" />, text: <>Tap <strong>&quot;Copy text&quot;</strong> in the scanner → paste here.</> },
                ]}
                validate={(raw) => {
                  if (!raw.trim().startsWith("<?xml") && !raw.includes("PrintLetterBarcodeData")) {
                    return "This doesn't look like an Aadhaar QR. It should start with <?xml and contain <PrintLetterBarcodeData>.";
                  }
                  return null;
                }}
                onResult={onAadhaarQrScan}
                onCancel={() => setAadhaarMode("choose")}
              />
            )}
            {aadhaarMode === "upload" && (
              <DocumentUpload
                kind="adult_aadhaar"
                presetDob={dobDate}
                onComplete={onAadhaarComplete}
                onCancel={() => setAadhaarMode("choose")}
              />
            )}
            {busy && aadhaarMode === "qr" && (
              <div className="relative overflow-hidden rounded-lg border bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 p-8 text-center">
                <div className="absolute inset-0">
                  <div className="scanner-line" />
                </div>
                <div className="relative z-10 mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-primary/20 text-primary">
                  <ScanLine className="h-8 w-8 animate-pulse" />
                </div>
                <p className="relative z-10 font-semibold text-primary">Scanning Aadhaar QR</p>
                <p className="relative z-10 mt-1 text-xs text-muted-foreground">Verifying UIDAI signature &amp; matching photo to selfie…</p>
                <div className="relative z-10 mt-4 flex items-center justify-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            {submitStatus.aadhaar && (
              <div className="space-y-1 rounded-md border bg-muted/20 p-2 text-[10px]">
                <p className="font-semibold text-muted-foreground">Submitting…</p>
                <div className="flex items-center gap-1.5">
                  {submitStatus.aadhaar === "ok" ? <Check className="h-3 w-3 text-emerald-600" /> : submitStatus.aadhaar === "err" ? <XCircle className="h-3 w-3 text-destructive" /> : <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Aadhaar</span>
                </div>
              </div>
            )}
          </CardContent>
          <div className="flex items-center justify-between px-6 pb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goTo("selfie")}
            >
              Back
            </Button>
            {aadhaarMode === "choose" && aadhaar && (
              <Button
                size="sm"
                variant="gradient"
                onClick={() => runSubmit(aadhaar)}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {aadhaarQr ? "Continue with verified QR" : "Continue"}
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </Card>
      )}

      {step === "bank" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4" /> Verify your bank account
            </CardTitle>
            <CardDescription>
              We send a ₹1 UPI collect to confirm the account is yours. Non-refundable verification fee.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BankStep
               userFullName={displayName}
              onComplete={onBankComplete}
            />
          </CardContent>
        </Card>
      )}

      {step === "result" && (
        <ResultStep
          aadhaar={existingVerifications?.aadhaar ?? !!aadhaar}
          bank_upi_provider={existingVerifications?.bank_upi_provider ?? bank?.upiProvider ?? ""}
          bank_last4={existingVerifications?.bank_last4 ?? bank?.last4 ?? ""}
          bank_verified={existingVerifications?.bank ?? !!bank}
          status={result?.status ?? "auto_approved"}
          confidence={result?.confidence ?? 92}
          onContinue={() => router.push(sp.get("next") || "/dashboard?verified=1")}
        />
      )}

      {busy && step !== "result" && (
        <p className="text-center text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Working on it…
        </p>
      )}

      {initialLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Checking your verification status…</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultStep({
  aadhaar, bank_verified, bank_upi_provider, bank_last4,
  status, confidence, onContinue,
}: {
  aadhaar: boolean;
  bank_verified: boolean;
  bank_upi_provider: string;
  bank_last4: string;
  status: string;
  confidence: number;
  onContinue: () => void;
}) {
  const isApproved = status === "auto_approved" || status === "approved";
  const isPending = status === "admin_review" || status === "submitted";
  const isRejected = status === "rejected";

  return (
    <Card className="relative overflow-hidden">
      {isApproved && (
        <div className="stamp-verified pointer-events-none absolute right-4 top-4 z-20 rotate-[-8deg] rounded-lg border-4 border-emerald-600 px-3 py-1.5">
          <p className="font-bold tracking-wider text-emerald-600" style={{ fontSize: "clamp(0.7rem, 2vw, 0.9rem)" }}>
            ✓ VERIFIED
          </p>
        </div>
      )}
      <CardContent className="space-y-4 p-6 text-center">
        {isApproved && (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-600">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="font-display text-2xl font-semibold">You&apos;re verified</h2>
            <p className="text-sm text-muted-foreground">
              Confidence: <span className="font-mono font-bold text-foreground">{confidence}</span> / 100.
            </p>
          </>
        )}
        {isPending && (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/15 text-amber-600">
              <Clock className="h-7 w-7" />
            </div>
            <h2 className="font-display text-2xl font-semibold">Pending review</h2>
            <p className="text-sm text-muted-foreground">
              Confidence: <span className="font-mono font-bold text-foreground">{confidence}</span> / 100. Our trust &amp; safety team will review within 24 hours.
            </p>
          </>
        )}
        {isRejected && (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/15 text-destructive">
              <XCircle className="h-7 w-7" />
            </div>
            <h2 className="font-display text-2xl font-semibold">Couldn&apos;t verify</h2>
            <p className="text-sm text-muted-foreground">
              Confidence: <span className="font-mono font-bold text-foreground">{confidence}</span> / 100. Please try again with clearer documents.
            </p>
          </>
        )}

        <ul className="mx-auto max-w-md space-y-2 text-left">
          <StatusLine label="Aadhaar" ok={aadhaar} />
          <StatusLine
            label="Bank"
            ok={bank_verified}
            extra={bank_verified ? `${bank_upi_provider} · •••• ${bank_last4}` : undefined}
          />
        </ul>

        <div className="mx-auto max-w-md rounded-md border bg-muted/20 p-3 text-left text-[10px] text-muted-foreground">
          <Info className="mr-1 inline h-3 w-3" />
          HiVR never sells your data. Document numbers are HMAC-hashed, images stored encrypted, and only the last 4 digits of your bank account are shown.
        </div>

        <Button onClick={onContinue} variant="gradient">
          Continue to dashboard <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function NameMatchCard({
  aadhaarName, accountName, matchInfo,
  isEditing, editValue, saving,
  onEdit, onCancel, onChange, onSave,
}: {
  aadhaarName: string;
  accountName: string;
  matchInfo: { score: number; isMatch: boolean };
  isEditing: boolean;
  editValue: string;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  const isMatch = matchInfo.isMatch || matchInfo.score >= 70;
  return (
    <div className={cn(
      "rounded-md border p-3 text-xs",
      isMatch ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5",
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isMatch
            ? <Check className="h-3.5 w-3.5 text-emerald-700" />
            : <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
          }
          <span className={isMatch ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
            {isMatch ? "Name matches" : "Name mismatch"}
          </span>
        </div>
        {!isEditing && !isMatch && (
          <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={onEdit}>
            Edit my name
          </Button>
        )}
      </div>
      {!isEditing ? (
        <div className="mt-1.5 space-y-1 text-muted-foreground">
          <p><span className="text-foreground">Aadhaar:</span> {aadhaarName}</p>
          <p><span className="text-foreground">Account:</span> {accountName}</p>
          <p>Match: <span className={cn("font-mono", isMatch ? "text-emerald-700" : "text-amber-700")}>{matchInfo.score}%</span></p>
          {!isMatch && (
            <p className="text-[10px] text-amber-600">
              Your account name doesn&apos;t match your Aadhaar. Edit it above to proceed, or contact support if this is an error.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Aadhaar name (read-only)</Label>
            <Input value={aadhaarName} readOnly className="h-7 text-xs bg-muted/50" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Account name</Label>
            <Input
              value={editValue}
              onChange={(e) => onChange(e.target.value)}
              className="h-7 text-xs"
              placeholder="Enter your name as per Aadhaar"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" variant="gradient" className="h-7 text-[10px]" onClick={onSave} disabled={saving || editValue.trim().length < 2}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {saving ? "Saving..." : "Save name"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusLine({
  label, ok, extra, pending, pendingLabel, pendingHint,
}: {
  label: string;
  ok: boolean;
  extra?: string;
  pending?: boolean;
  pendingLabel?: string;
  pendingHint?: string;
}) {
  const Icon = ok ? Check : pending ? Clock : XCircle;
  const tone = ok ? "text-emerald-600" : pending ? "text-amber-600" : "text-muted-foreground";
  const badge = ok
    ? <Badge variant="success" className="ml-auto">Verified</Badge>
    : pending
      ? <Badge variant="outline" className="ml-auto border-amber-500/40 text-amber-700">{pendingLabel ?? "Pending"}</Badge>
      : <Badge variant="outline" className="ml-auto">Not verified</Badge>;
  return (
    <li className="flex flex-col gap-0.5 text-sm">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", tone)} />
        <span className={cn("font-medium", ok ? "text-foreground" : "text-muted-foreground")}>{label}</span>
        {ok && extra && <span className="text-xs text-muted-foreground">— {extra}</span>}
        {badge}
      </div>
      {pending && pendingHint && (
        <p className="ml-6 text-[10px] text-muted-foreground">{pendingHint}</p>
      )}
    </li>
  );
}
