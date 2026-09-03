"use client";

import { useState } from "react";
import { Download, Eye, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { HandymanDocumentType } from "@/lib/types";
import { handymenApi } from "@/lib/api/client";
import {
  useDeleteHandymanDocument,
  useHandymanDocuments,
  useUploadHandymanDocument,
} from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const DOCUMENT_TYPES: HandymanDocumentType[] = [
  "contract",
  "driver_license",
  "w9",
  "insurance",
  "certification",
  "other",
];

const DOCUMENT_LABEL: Record<HandymanDocumentType, string> = {
  contract: "Contract",
  driver_license: "Driver license",
  w9: "W-9",
  insurance: "Insurance",
  certification: "Certification",
  other: "Other",
};

function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function HandymanDocuments({ handymanId }: { handymanId: string }) {
  const { data: documents = [], isLoading } = useHandymanDocuments(handymanId, true);
  const remove = useDeleteHandymanDocument();

  async function deleteDocument(documentId: string, fileName: string) {
    if (!window.confirm(`Delete ${fileName}? This cannot be undone.`)) return;
    try {
      await remove.mutateAsync({ handymanId, documentId });
      toast.success("Document deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete document");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={<FileText />}>Documents</CardTitle>
        <UploadDocumentDialog handymanId={handymanId}>
          <Button size="sm">
            <Plus /> Upload document
          </Button>
        </UploadDocumentDialog>
      </CardHeader>
      <CardBody className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : documents.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-ink-muted">
            No documents uploaded
          </p>
        ) : (
          <div className="divide-y divide-line">
            {documents.map((document) => (
              <div key={document.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="size-4 shrink-0 text-ink-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {document.file_name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {DOCUMENT_LABEL[document.document_type]} · {fileSize(document.file_size)} ·{" "}
                    {new Date(document.uploaded_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  {document.notes && (
                    <p className="mt-1 truncate text-[11px] text-ink-muted">
                      {document.notes}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button asChild variant="ghost" size="iconSm">
                    <a
                      href={handymenApi.documentUrl(handymanId, document.id)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`View ${document.file_name}`}
                    >
                      <Eye />
                    </a>
                  </Button>
                  <Button asChild variant="ghost" size="iconSm">
                    <a
                      href={handymenApi.documentUrl(handymanId, document.id, true)}
                      aria-label={`Download ${document.file_name}`}
                    >
                      <Download />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label={`Delete ${document.file_name}`}
                    onClick={() => deleteDocument(document.id, document.file_name)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="text-danger" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function UploadDocumentDialog({
  handymanId,
  children,
}: {
  handymanId: string;
  children: React.ReactNode;
}) {
  const upload = useUploadHandymanDocument();
  const [open, setOpen] = useState(false);
  const [documentType, setDocumentType] = useState<HandymanDocumentType>("contract");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");

  function reset() {
    setDocumentType("contract");
    setFile(null);
    setNotes("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      toast.error("Choose a document file");
      return;
    }
    try {
      await upload.mutateAsync({ handymanId, documentType, file, notes });
      toast.success("Document uploaded");
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload document");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title="Upload document"
        description="Files stay private and are served only through authenticated admin API."
      >
        <form onSubmit={submit} className="space-y-4 p-4">
          <div className="space-y-1">
            <Label htmlFor="document-type">Document type</Label>
            <Select
              value={documentType}
              onValueChange={(value) => setDocumentType(value as HandymanDocumentType)}
            >
              <SelectTrigger id="document-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {DOCUMENT_LABEL[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="document-file">File</Label>
            <Input
              id="document-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
            <p className="text-[11px] text-ink-muted">PDF, JPG or PNG · maximum 10 MB</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="document-notes">Optional note</Label>
            <Textarea
              id="document-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={upload.isPending}>
              {upload.isPending ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
