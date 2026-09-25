import { NextResponse } from "next/server";
import { verifyIdDocument } from "@/lib/didit/id-verification";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const frontImage = form.get("front_image") as File | null;
    const backImage = form.get("back_image") as File | null;
    if (!frontImage) {
      return NextResponse.json(
        { error: "No front_image uploaded" },
        { status: 400 },
      );
    }
    const vendorData = (form.get("vendor_data") as string) || undefined;
    const performDocLiveness = form.get("perform_document_liveness") === "true";
    const result = await verifyIdDocument(frontImage, {
      backImage: backImage || undefined,
      vendor_data: vendorData,
      performDocumentLiveness: performDocLiveness,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json(
      { error: e.message || "ID verification failed" },
      { status },
    );
  }
}
