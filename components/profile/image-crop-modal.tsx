"use client";

import * as React from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, ZoomIn, ZoomOut, Check } from "lucide-react";

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
  file: File | null;
  aspect: number;
  cropShape?: "rect" | "round";
  /**
   * Target canvas edge in pixels. The cropped image is rendered at
   * (targetSize × targetSize) so the saved file is crisp on retina
   * displays and large enough to be cropped later. Default 512.
   */
  targetSize?: number;
  onCropComplete: (croppedBlob: Blob) => void;
};

/**
 * Render the cropped region to a high-resolution canvas, then export
 * as a JPEG blob. The output edge is `targetSize` (default 512) so the
 * saved photo looks sharp on retina + large enough for cover use.
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  targetSize: number,
): Promise<Blob> {
  const img = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext("2d")!;
  // Highest-quality scaling.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetSize,
    targetSize,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/jpeg", 0.95);
  });
}

export function ImageCropModal({
  open,
  onClose,
  file,
  aspect,
  cropShape = "rect",
  targetSize = 512,
  onCropComplete,
}: Props) {
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load the file as an object URL when the modal opens.
  React.useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setPreviewUrl(null);
      setError(null);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  function onCropCompleteHandler(_: Area, croppedPixels: Area) {
    setCroppedAreaPixels(croppedPixels);
    // Live preview: build a small blob URL of the cropped area
    if (imageSrc) {
      getCroppedImg(imageSrc, croppedPixels, 128)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          setPreviewUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return url;
          });
        })
        .catch(() => undefined);
    }
  }

  // Revoke preview URL on unmount
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleSave() {
    if (!imageSrc || !croppedAreaPixels) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels, targetSize);
      onCropComplete(blob);
      onClose();
    } catch (e) {
      setError((e as Error).message ?? "Crop failed");
      // fallback: upload original uncropped
      if (file) {
        onCropComplete(file);
        onClose();
      }
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          {/* Cropper — fills the available width, square aspect */}
          <div className="relative h-80 w-full overflow-hidden rounded-md bg-black sm:h-96">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                cropShape={cropShape}
                showGrid={!cropShape || cropShape === "rect"}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropCompleteHandler}
                objectFit="contain"
                restrictPosition
                style={{
                  containerStyle: { background: "#000" },
                }}
              />
            )}
          </div>

          {/* Live preview column */}
          <div className="flex flex-col items-center justify-center gap-3 rounded-md border bg-muted/30 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Preview
            </p>

            {/* Big preview — shows how it'll look as the actual avatar */}
            <div className="relative">
              <Avatar className="h-24 w-24 ring-2 ring-primary/20">
                {previewUrl ? (
                  <AvatarImage src={previewUrl} className="object-cover" />
                ) : null}
                <AvatarFallback className="text-xl">?</AvatarFallback>
              </Avatar>
            </div>

            {/* Smaller previews — show how it'll look at the actual sizes used in the app */}
            <div className="flex items-end gap-2">
              <div className="flex flex-col items-center gap-1">
                <Avatar className="h-12 w-12">
                  {previewUrl ? <AvatarImage src={previewUrl} className="object-cover" /> : null}
                  <AvatarFallback>?</AvatarFallback>
                </Avatar>
                <span className="text-[9px] text-muted-foreground">48px</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Avatar className="h-8 w-8">
                  {previewUrl ? <AvatarImage src={previewUrl} className="object-cover" /> : null}
                  <AvatarFallback>?</AvatarFallback>
                </Avatar>
                <span className="text-[9px] text-muted-foreground">32px</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Avatar className="h-6 w-6">
                  {previewUrl ? <AvatarImage src={previewUrl} className="object-cover" /> : null}
                  <AvatarFallback>?</AvatarFallback>
                </Avatar>
                <span className="text-[9px] text-muted-foreground">24px</span>
              </div>
            </div>

            <p className="mt-1 text-center text-[10px] text-muted-foreground">
              Center your face in the frame. {cropShape === "round" ? "Circular crop." : "Square crop."}
            </p>
          </div>
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 px-1">
          <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer accent-primary"
            aria-label="Zoom"
          />
          <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !croppedAreaPixels}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
            Save photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
