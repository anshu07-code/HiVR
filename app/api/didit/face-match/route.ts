import { NextResponse } from "next/server";
import { matchFaces } from "@/lib/didit/face-match";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const userImage = form.get("user_image") as File | null;
    const refImage = form.get("ref_image") as File | null;
    if (!userImage || !refImage) {
      return NextResponse.json(
        { error: "Both user_image and ref_image are required" },
        { status: 400 },
      );
    }
    const vendorData = (form.get("vendor_data") as string) || undefined;
    const declineThreshold = Number(form.get("decline_threshold")) || 50;
    const result = await matchFaces(userImage, refImage, {
      vendor_data: vendorData,
      declineThreshold,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json(
      { error: e.message || "Face match failed" },
      { status },
    );
  }
}
