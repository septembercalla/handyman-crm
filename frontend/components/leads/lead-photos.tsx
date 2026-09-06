"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ImageIcon, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { leadPhotosApi, type LeadPhoto } from "@/lib/api/client";
import { useLeadPhotoActions, useLeadPhotos } from "@/lib/api/lead-photos";
import { businessTime, useOperations } from "@/lib/api/operations";

const ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function photoValidation(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!TYPES[extension] || (file.type && file.type !== TYPES[extension])) return "Only JPG, PNG and WEBP images are supported.";
  if (file.size === 0) return "The image is empty.";
  if (file.size > 10 * 1024 * 1024) return "Image must be 10 MB or smaller.";
  return null;
}

function PhotoImage({ photo, large = false }: { photo: LeadPhoto; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="flex min-h-24 items-center justify-center p-3 text-xs text-ink-muted">Photo unavailable. Try reopening or downloading it.</span>;
  // The backend requires the user's cookies; Next image optimization cannot proxy this private URL.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={leadPhotosApi.url(photo.lead_id, photo.id)} alt={photo.file_name}
    crossOrigin="use-credentials" loading={large ? "eager" : "lazy"} decoding="async"
    onError={() => setFailed(true)}
    className={large ? "max-h-[60vh] w-full object-contain" : "aspect-square w-full object-cover"} />;
}

type UploadResult = { name: string; state: "uploading" | "uploaded" | "failed"; message?: string };
const message = (error: unknown) => error instanceof Error ? error.message : "Please retry.";

export function LeadPhotos({ leadId }: { leadId: string }) {
  const { data: photos = [], isLoading, error, refetch } = useLeadPhotos(leadId);
  const { upload, remove } = useLeadPhotoActions(leadId);
  const { data: ops } = useOperations();
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<LeadPhoto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const index = photos.findIndex((photo) => photo.id === selectedId);
  const selected = photos[index];

  async function uploadFiles(files: File[]) {
    if (!files.length || busy.current) return;
    busy.current = true;
    setUploading(true);
    setResults([]);
    try {
      for (const [i, file] of files.entries()) {
        const invalid = photoValidation(file);
        setResults((previous) => [...previous, { name: file.name, state: invalid ? "failed" : "uploading", message: invalid ?? undefined }]);
        if (invalid) continue;
        try {
          await upload.mutateAsync(file);
          setResults((previous) => previous.map((result, n) => n === i ? { ...result, state: "uploaded" } : result));
        } catch (error) {
          setResults((previous) => previous.map((result, n) => n === i ? { ...result, state: "failed", message: message(error) } : result));
        }
      }
    } finally {
      busy.current = false;
      setUploading(false);
    }
  }

  function navigate(direction: number) {
    if (photos.length > 1) setSelectedId(photos[(index + direction + photos.length) % photos.length].id);
  }

  async function deletePhoto() {
    if (!confirm) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(confirm.id);
      if (selectedId === confirm.id) setSelectedId(null);
      setConfirm(null);
    } catch (error) { setDeleteError(message(error)); }
  }

  return <Card>
    <CardHeader><CardTitle icon={<ImageIcon />}>Photos</CardTitle>
      <Button size="sm" variant="outline" disabled={uploading} onClick={() => input.current?.click()}><Upload />{uploading ? "Uploading…" : "Upload photos"}</Button>
      <input ref={input} className="hidden" type="file" accept={ACCEPT} multiple aria-label="Upload lead photos"
        onChange={(event) => {const files = Array.from(event.target.files ?? []); event.target.value = ""; void uploadFiles(files);}} />
    </CardHeader>
    <CardBody onDragOver={(event) => event.preventDefault()} onDrop={(event) => {event.preventDefault(); void uploadFiles(Array.from(event.dataTransfer.files));}}>
      <p className="mb-3 text-xs text-ink-muted">Drop photos here or use Upload photos. JPG, PNG, WEBP · up to 10 MB each.</p>
      {results.length > 0 && <ul aria-live="polite" className="mb-3 space-y-1 text-xs">{results.map((result, i) => <li key={i} className={result.state === "failed" ? "text-danger" : "text-ink-muted"}>
        {result.name}: {result.state === "failed" ? result.message : result.state === "uploaded" ? "Uploaded" : "Uploading…"}
      </li>)}</ul>}
      {error ? <p role="alert" className="text-sm">Could not load photos. <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></p>
        : isLoading ? <p className="py-6 text-center text-sm text-ink-muted">Loading photos…</p>
        : photos.length === 0 ? <p className="py-6 text-center text-sm text-ink-muted">No photos uploaded yet.</p>
        : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{photos.map((photo) => <button key={photo.id} type="button" onClick={() => setSelectedId(photo.id)}
          aria-label={`View ${photo.file_name}`} className="overflow-hidden rounded-[4px] border border-line bg-subtle text-left hover:border-brand focus-visible:outline-brand">
          <PhotoImage photo={photo} /><span className="block truncate p-2 text-xs">{photo.file_name}</span>
        </button>)}</div>}
    </CardBody>
    <Dialog open={!!selected} onOpenChange={(open) => {if (!open) setSelectedId(null);}}>
      {selected && <DialogContent title={selected.file_name} className="max-h-[95vh] w-[calc(100%_-_2rem)] max-w-4xl overflow-y-auto [&_h2]:break-all" description={`${businessTime(selected.uploaded_at, ops?.timezone)} · ${selected.uploaded_by_name}`}
        onKeyDown={(event) => {if (confirm) return; if (event.key === "ArrowLeft" || event.key === "ArrowRight") {event.preventDefault(); navigate(event.key === "ArrowLeft" ? -1 : 1);}}}>
        <div className="space-y-3 p-4"><PhotoImage key={selected.id} photo={selected} large />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Button size="iconSm" variant="outline" aria-label="Previous photo" disabled={photos.length < 2} onClick={() => navigate(-1)}><ChevronLeft /></Button>
              <span className="text-xs">{index + 1} / {photos.length}</span><Button size="iconSm" variant="outline" aria-label="Next photo" disabled={photos.length < 2} onClick={() => navigate(1)}><ChevronRight /></Button></div>
            <div className="flex gap-2"><Button asChild size="sm" variant="outline"><a href={leadPhotosApi.url(leadId, selected.id, true)}><Download />Download</a></Button>
              <Button size="sm" variant="dangerOutline" onClick={() => {setDeleteError(null); setConfirm(selected);}}><Trash2 />Delete</Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedId(null)}>Close</Button></div>
          </div>
        </div>
      </DialogContent>}
    </Dialog>
    <Dialog open={!!confirm} onOpenChange={(open) => {if (!open && !remove.isPending) setConfirm(null);}}>
      <DialogContent title="Delete photo?" description={confirm?.file_name} className="w-[calc(100%_-_2rem)]">
        <div className="space-y-3 p-4"><p className="text-sm">This permanently removes the photo. Activity history will remain.</p>
          {deleteError && <p role="alert" className="text-sm text-danger">{deleteError}</p>}
          <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={remove.isPending} onClick={() => setConfirm(null)}>Cancel</Button>
            <Button size="sm" variant="danger" disabled={remove.isPending} onClick={deletePhoto}>{remove.isPending ? "Deleting…" : "Delete"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </Card>;
}
