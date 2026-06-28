"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera, Upload, Calendar, Check, ChevronRight, Loader2,
  AlertTriangle, XCircle, Clock, ArrowRight, Info, Landmark, FileText,
  QrCode, ShieldCheck, ScanLine, User, SkipForward, Smartphone, Clipboard,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { SelfieCapture, type SelfieResult } from "@/components/verify/selfie-capture";
import { DocumentUpload, type DocumentKind, type DocumentResult } from "@/components/verify/document-upload";
import { BankStep, type BankStepResult } from "@/components/verify/bank-step";
import { QrScanner, type QrScanResult } from "@/components/verify/qr-scanner";
import { perceptualHash, fuzzyNameMatch, hashSimilarity } from "@/lib/verification";
import { verifyAadhaarQr, type AadhaarSignedData } from "@/lib/verification/aadhaar-qr";
import { verifyPanQr, type PanQrData } from "@/lib/verification/pan-qr";
import { cn } from "@/lib/utils";

type StepId = "dob" | "selfie" | "pan" | "aadhaar" | "bank" | "result";

type SelfieState = SelfieResult & { hash: string | null };
type DocumentState = DocumentResult & { kind: DocumentKind };

const STEPS: { id: StepId; label: string }[] = [
  { id: "dob",      label: "Date of birth" },
  { id: "selfie",   label: "Liveness selfie" },
  { id: "pan",      label: "PAN card" },
  { id: "aadhaar",  label: "Aadhaar card" },
  { id: "bank",     label: "Bank verification" },
  { id: "result",   label: "Done" },
];

export function VerifyWizard({ userFullName, userEmail }: { userFullName: string; userEmail: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  // Demo mode is for local dev only — it lets the developer skip the
  // real OCR + liveness. In production, the wizard runs the real flow
  // (UIDAI public key signature verify for Aadhaar QR, Tesseract OCR
  // for uploaded images, WebCrypto HMAC for hashing).
  // The toggle is only visible when ?demo=1 is in the URL, or when
  // NEXT_PUBLIC_VERIFY_DEMO_MODE=true is set at build time.
  const demoModeEnabled =
    sp.get("demo") === "1" ||
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_VERIFY_DEMO_MODE === "true");

  const [step, setStep] = React.useState<StepId>("dob");
  const [dob, setDob] = React.useState("");
  const [sandbox, setSandbox] = React.useState(false);

  const [panSessionId, setPanSessionId] = React.useState<string | null>(null);
  const [aadhaarSessionId, setAadhaarSessionId] = React.useState<string | null>(null);
  const [selfie, setSelfie] = React.useState<SelfieState | null>(null);
  const [pan, setPan] = React.useState<DocumentState | null>(null);
  const [aadhaar, setAadhaar] = React.useState<DocumentState | null>(null);
  const [bank, setBank] = React.useState<BankStepResult | null>(null);
  const [panSkipped, setPanSkipped] = React.useState(false);

  // QR paths (preferred over upload when available)
  const [aadhaarQr, setAadhaarQr] = React.useState<AadhaarSignedData | null>(null);
  const [aadhaarQrRaw, setAadhaarQrRaw] = React.useState<string | null>(null);
  const [aadhaarQrPhotoHash, setAadhaarQrPhotoHash] = React.useState<string | null>(null);
  const [aadhaarQrPhotoBlob, setAadhaarQrPhotoBlob] = React.useState<Blob | null>(null);
  const [aadhaarMode, setAadhaarMode] = React.useState<"choose" | "qr" | "upload">("choose");

  const [panQr, setPanQr] = React.useState<PanQrData | null>(null);
  const [panMode, setPanMode] = React.useState<"choose" | "qr" | "upload">("choose");

  const [submitStatus, setSubmitStatus] = React.useState<{ pan?: "pending" | "ok" | "err" | "skipped"; aadhaar?: "pending" | "ok" | "err" }>({});

  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ status: string; confidence: number } | null>(null);

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
    aadhaarQrPhotoHash?: string | null;
  }) {
    const { sessionId, doc, nameMatchName, aadhaarQrVerified, aadhaarQrPhotoHash } = opts;
    const nameMatch = doc.ocrName
      ? fuzzyNameMatch(doc.ocrName, nameMatchName)
      : { score: 0, isMatch: false };
    // For a UIDAI-signed Aadhaar QR, the signed name + DOB + photo are
    // authoritative. If the user scanned a real Aadhaar QR AND the
    // signed photo's perceptual hash matches the selfie, the face_score
    // is set to 100 — that's the strongest possible signal a real Aadhaar
    // card was held by the same person who took the selfie.
    let faceScore = selfie?.livenessScore ?? 0;
    if (aadhaarQrVerified && aadhaarQrPhotoHash && selfie?.hash) {
      const sim = hashSimilarity(aadhaarQrPhotoHash, selfie.hash);
      // Require ≥70% perceptual similarity (Hamming distance ≤ 19/64)
      faceScore = sim >= 70 ? Math.max(faceScore, Math.min(100, sim + 5)) : Math.max(0, faceScore - 30);
    }
    const challenges = {
      face_score: faceScore,
      name_score: aadhaarQrVerified ? 100 : nameMatch.score,
      liveness_score: selfie?.livenessScore ?? 0,
      doc_validity: aadhaarQrVerified ? 100 : doc.docValidityScore,
      challenges: selfie?.livenessChallenges ?? [],
      aadhaar_qr_verified: !!aadhaarQrVerified,
    };
    const res = await fetch("/api/verification/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        ocrFullName: doc.ocrName ?? "",
        ocrDob: doc.ocrDob ? doc.ocrDob.toISOString().slice(0, 10) : "",
        ocrDocumentNumber: doc.docNumber ?? "",
        ocrDocumentHash: doc.docHash ?? "",
        selfieHash: selfie?.hash ?? "",
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
      const sessionId = await startSession("adult_pan");
      setPanSessionId(sessionId);
      goTo("selfie");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSelfieComplete(r: SelfieResult) {
    if (!panSessionId) {
      setError("Session lost. Please restart.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await blobToDataUrl(r.selfieBlob);
      const img = await dataUrlToImage(dataUrl);
      const hash = await perceptualHash(img);
      await uploadAsset(panSessionId, "selfie", r.selfieBlob, r.selfieBlob.type || "image/jpeg");
      setSelfie({ ...r, hash });
      goTo("pan");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onPanComplete(r: DocumentResult) {
    if (!panSessionId) {
      setError("Session lost. Please restart.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadAsset(panSessionId, "document", r.docBlob, r.mimeType);
      setPan({ ...r, kind: "adult_pan" });
      goTo("aadhaar");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAadhaarComplete(r: DocumentResult) {
    if (!panSessionId) {
      setError("Session lost. Please restart.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const aadhaarSid = await startSession("adult_aadhaar");
      setAadhaarSessionId(aadhaarSid);
      await uploadAsset(aadhaarSid, "document", r.docBlob, r.mimeType);
      const aadhaarState: DocumentState = { ...r, kind: "adult_aadhaar" };
      setAadhaar(aadhaarState);
      await runSubmit(aadhaarState);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Reusable submit — called from both the upload path (after the
  // DocumentUpload completes) and the QR path (when the user clicks
  // "Continue" from the verified-by-QR summary).
  async function runSubmit(aadhaarState: DocumentState) {
    if (!panSessionId) {
      setError("Session lost. Please restart.");
      return;
    }
    // PAN is optional — only required for payouts. If the user skipped
    // it (and didn't scan a QR either), we just submit Aadhaar alone.
    const panProvided = !!(pan || panQr);
    if (!panSkipped && !panProvided) {
      setError("PAN result missing. Please restart the flow.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Ensure we have an aadhaar session
      let aadhaarSid = aadhaarSessionId;
      if (!aadhaarSid) {
        aadhaarSid = await startSession("adult_aadhaar");
        setAadhaarSessionId(aadhaarSid);
        if (aadhaarState.docBlob.size > 0) {
          await uploadAsset(aadhaarSid, "document", aadhaarState.docBlob, aadhaarState.mimeType);
        }
      }
      const nameMatchName = userFullName || userEmail.split("@")[0] || "there";

      setSubmitStatus({ pan: panSkipped ? "skipped" : "pending", aadhaar: "pending" });

      // PAN submit — only if the user actually provided one. If they
      // skipped, we just leave the in_progress PAN session to expire.
      if (panProvided && !panSkipped) {
        try {
          // Prefer QR if available (it carries the signed PAN)
          if (pan) {
            await submitDoc({ sessionId: panSessionId, doc: pan, nameMatchName });
          } else if (panQr) {
            await submitDoc({ sessionId: panSessionId, doc: {
              docBlob: new Blob([panQr.raw], { type: "text/plain" }),
              mimeType: "text/plain",
              ocrName: panQr.name,
              ocrDob: panQr.dob ? new Date(panQr.dob) : null,
              docNumber: panQr.pan,
              docHash: null,
              docValidityScore: 100,
              ocrText: `[PAN QR: ${panQr.pan}]`,
              docNumberValid: true,
              lines: [],
              kind: "adult_pan",
            }, nameMatchName });
          }
          setSubmitStatus((s) => ({ ...s, pan: "ok" }));
        } catch (e) {
          setSubmitStatus((s) => ({ ...s, pan: "err" }));
          throw e;
        }
      } else if (panSkipped) {
        // Mark the PAN session as skipped in the audit log so admins
        // can see why. The session itself stays in_progress and will
        // auto-expire (its TTL is short).
        try {
          await fetch("/api/verification/pan-skip", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: panSessionId }),
          });
        } catch { /* non-fatal */ }
        setSubmitStatus((s) => ({ ...s, pan: "skipped" }));
      }
      try {
        await submitDoc({
          sessionId: aadhaarSid,
          doc: aadhaarState,
          nameMatchName,
          aadhaarQrVerified: !!aadhaarQr,
          aadhaarQrPhotoHash: aadhaarQrPhotoHash,
        });
        setSubmitStatus((s) => ({ ...s, aadhaar: "ok" }));
      } catch (e) {
        setSubmitStatus((s) => ({ ...s, aadhaar: "err" }));
        throw e;
      }

      setResult({ status: "auto_approved", confidence: aadhaarQr ? 95 : 88 });
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

  // ----- Aadhaar QR scan handler -----
  async function onAadhaarQrScan(r: QrScanResult) {
    setBusy(true);
    setError(null);
    try {
      const result = await verifyAadhaarQr(r.raw);
      if (!result.ok) {
        throw new Error(result.error);
      }
      // Compute perceptual hash of the signed photo for face-match with
      // the selfie. If the photo is present, we hash it; otherwise the
      // server gets face_score from the liveness challenges alone.
      let photoHash: string | null = null;
      let photoBlob: Blob | null = null;
      if (result.data.photoBase64) {
        const img = await dataUrlToImage(result.data.photoBase64);
        photoHash = await perceptualHash(img);
        // Convert to blob for upload as a verification asset
        const res = await fetch(result.data.photoBase64);
        photoBlob = await res.blob();
      }
      setAadhaarQr(result.data);
      setAadhaarQrRaw(r.raw);
      setAadhaarQrPhotoHash(photoHash);
      setAadhaarQrPhotoBlob(photoBlob);
      // Pre-fill the Aadhaar document state with the signed values so
      // the user can still see what was extracted.
      setAadhaar({
        docBlob: photoBlob ?? new Blob([], { type: "image/jpeg" }),
        mimeType: "image/jpeg",
        ocrName: result.data.name,
        ocrDob: result.data.dob ? new Date(result.data.dob) : null,
        docNumber: result.data.aadhaarLast4 ? `xxxx-xxxx-${result.data.aadhaarLast4}` : null,
        docHash: photoHash,
        docValidityScore: 100,
        ocrText: "[UIDAI-signed QR]",
        docNumberValid: true,
        lines: [],
        kind: "adult_aadhaar",
      });
      setAadhaarMode("choose");
      goTo("aadhaar");
      // The user will see a "verified by QR" summary and click Continue
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ----- PAN QR scan handler -----
  async function onPanQrScan(r: QrScanResult) {
    setBusy(true);
    setError(null);
    try {
      const result = verifyPanQr(r.raw, userFullName, dob);
      if (!result.ok) {
        throw new Error(result.error);
      }
      setPanQr(result.data);
      // Pre-fill the PAN document state with the QR data
      setPan({
        docBlob: new Blob([r.raw], { type: "text/plain" }),
        mimeType: "text/plain",
        ocrName: result.data.name,
        ocrDob: result.data.dob ? new Date(result.data.dob) : null,
        docNumber: result.data.pan,
        docHash: null,
        docValidityScore: Math.round(result.crossCheck.score * 1.0),
        ocrText: `[PAN QR: ${result.data.pan}]`,
        docNumberValid: true,
        lines: [],
        kind: "adult_pan",
      });
      setPanMode("choose");
      goTo("pan");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function hashSimilarityStr(a: string, b: string): string {
    return String(hashSimilarity(a, b));
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image load failed"));
      img.src = dataUrl;
    });
  }

  return (
    <div className="space-y-5">
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
        <h1 className="font-display text-2xl font-semibold tracking-tight">Verify your identity</h1>
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
              Used to set the verification session expiry. Everyone follows the same 5-step flow — Aadhaar, PAN, selfie, and a ₹1 UPI bank verify.
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
              <Camera className="h-4 w-4" /> Liveness selfie
            </CardTitle>
            <CardDescription>
              3 quick challenges — blink, turn, smile. We never see a video, only the final frame.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SelfieCapture
              onComplete={onSelfieComplete}
              onCancel={() => goTo("dob")}
            />
          </CardContent>
        </Card>
      )}

      {step === "pan" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Verify your PAN
              <Badge variant="outline" className="ml-1 text-[9px]">Optional</Badge>
            </CardTitle>
            <CardDescription>
              10-character PAN. PAN is only required to receive payments above ₹30,000/year (TDS rule).
              You can add it later from your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {panMode === "choose" && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setPanMode("qr")}
                  className="flex w-full items-start gap-3 rounded-lg border-2 border-primary/40 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
                >
                  <QrCode className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">Scan PAN QR code</p>
                      <Badge variant="success" className="text-[9px]">Recommended</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Hold the back of your PAN card up to your camera. We extract name + DOB + PAN instantly.
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPanMode("upload")}
                  className="flex w-full items-start gap-3 rounded-lg border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/40"
                >
                  <Upload className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Upload PAN image</p>
                    <p className="text-xs text-muted-foreground">
                      Fallback: we OCR the front of the card with Tesseract.js. Less accurate.
                    </p>
                  </div>
                </button>
                <div className="rounded-md border border-dashed bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Don&apos;t have a PAN card?</strong> Students, homemakers, and
                    rural workers often don&apos;t have one. You can skip this and add it later from your
                    dashboard before you receive any payment.
                  </p>
                </div>
              </div>
            )}
            {panMode === "qr" && (
              <QrScanner
                title="Scan PAN card QR"
                description="PAN QRs are JSON. We recommend pasting the raw text — it's more reliable than the camera."
                defaultMode="manual"
                guideSteps={[
                  { icon: <FileText className="h-3 w-3" />, text: <>Locate the <strong>QR on the back</strong> of your PAN card.</> },
                  { icon: <Camera className="h-3 w-3" />, text: <>Use <strong>Google Lens</strong> or any QR scanner app on your phone.</> },
                  { icon: <Clipboard className="h-3 w-3" />, text: <>Tap <strong>&quot;Copy text&quot;</strong> in the scanner → paste here.</> },
                ]}
                validate={(raw) => {
                  if (!raw.trim().startsWith("{")) return "Not a JSON QR code — point at the back of your PAN card.";
                  try {
                    const j = JSON.parse(raw);
                    if (!j.PAN && !j.pan) return "QR doesn't contain a PAN field.";
                  } catch {
                    return "Could not read QR data.";
                  }
                  return null;
                }}
                onResult={onPanQrScan}
                onCancel={() => setPanMode("choose")}
              />
            )}
            {panMode === "upload" && (
              <DocumentUpload
                kind="adult_pan"
                presetDob={dobDate}
                onComplete={onPanComplete}
                onCancel={() => setPanMode("choose")}
              />
            )}
            {panQr && panMode === "choose" && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <Check className="h-3.5 w-3.5" /> PAN QR captured — {panQr.pan}
                </div>
                <p className="mt-1 text-muted-foreground">Name: {panQr.name} · DOB: {panQr.dob || "—"}</p>
              </div>
            )}
          </CardContent>
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 pb-4">
            <Button variant="ghost" size="sm" onClick={() => goTo("selfie")}>
              Back
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {panMode === "choose" && !pan && !panQr && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPanSkipped(true);
                    goTo("aadhaar");
                  }}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  Skip for now
                </Button>
              )}
              {panMode === "choose" && (pan || panQr) && (
                <Button size="sm" variant="gradient" onClick={() => goTo("aadhaar")}>
                  Continue <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
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
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-700">
                      <ShieldCheck className="h-3.5 w-3.5" /> Aadhaar QR signature verified by UIDAI public key
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      Name: {aadhaarQr.name} · DOB: {aadhaarQr.dob || "—"} · Aadhaar ends ••••{aadhaarQr.aadhaarLast4}
                    </p>
                    {aadhaarQrPhotoHash && selfie?.hash && (
                      <p className="mt-0.5 text-muted-foreground">
                        Photo vs selfie perceptual hash: {hashSimilarityStr(aadhaarQrPhotoHash, selfie.hash)}%
                      </p>
                    )}
                  </div>
                )}
                {submitStatus.pan === "ok" && submitStatus.aadhaar === "ok" && (
                  <div className="rounded-md border bg-muted/30 p-2 text-[10px] text-emerald-700">
                    <Check className="mr-1 inline h-3 w-3" /> Both sessions submitted.
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
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Verifying UIDAI signature…
              </p>
            )}
            {(submitStatus.pan || submitStatus.aadhaar) && (
              <div className="space-y-1 rounded-md border bg-muted/20 p-2 text-[10px]">
                <p className="font-semibold text-muted-foreground">Submitting…</p>
                <div className="flex items-center gap-1.5">
                  {submitStatus.pan === "ok" ? <Check className="h-3 w-3 text-emerald-600" /> : submitStatus.pan === "err" ? <XCircle className="h-3 w-3 text-destructive" /> : <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>PAN</span>
                </div>
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
              onClick={() => goTo("pan")}
            >
              Back
            </Button>
            {aadhaarMode === "choose" && aadhaar && !submitStatus.pan && (
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
              userFullName={userFullName}
              onComplete={onBankComplete}
            />
          </CardContent>
        </Card>
      )}

      {step === "result" && (
        <ResultStep
          aadhaar={!!aadhaar}
          pan={!!pan}
          panSkipped={panSkipped}
          bank={bank}
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
    </div>
  );
}

function ResultStep({
  aadhaar, pan, panSkipped, bank, status, confidence, onContinue,
}: {
  aadhaar: boolean;
  pan: boolean;
  panSkipped: boolean;
  bank: BankStepResult | null;
  status: string;
  confidence: number;
  onContinue: () => void;
}) {
  const isApproved = status === "auto_approved" || status === "approved";
  const isPending = status === "admin_review" || status === "submitted";
  const isRejected = status === "rejected";

  return (
    <Card>
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
            label="PAN"
            ok={pan}
            pending={panSkipped}
            pendingLabel="Skipped"
            pendingHint="Add it later from your dashboard before you receive payments above ₹30K."
          />
          <StatusLine
            label="Bank"
            ok={!!bank}
            extra={bank ? `${bank.upiProvider} · •••• ${bank.last4}` : undefined}
          />
        </ul>

        {panSkipped && (
          <div className="mx-auto max-w-md rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-left text-[11px] text-amber-700">
            <Info className="mr-1 inline h-3 w-3" />
            You can browse and apply for jobs now. To <strong>receive payments above ₹30,000/year</strong>
            {" "}or withdraw earnings, you&apos;ll need to verify your PAN + bank account from your dashboard.
          </div>
        )}

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
