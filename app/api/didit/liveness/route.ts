import { NextResponse } from "next/server";
import { verifyPassiveLiveness } from "@/lib/didit/liveness";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const image = form.get("image") as File | null;
    if (!image) {
      return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
    }
    const vendorData = (form.get("vendor_data") as string) || undefined;
    const declineThreshold = Number(form.get("decline_threshold")) || 30;
    const result = await verifyPassiveLiveness(image, {
      vendor_data: vendorData,
      declineThreshold,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json(
      { error: e.message || "Liveness check failed" },
      { status },
    );
  }
}
