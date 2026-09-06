"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { leadPhotosApi, type LeadPhoto } from "./client";

export function useLeadPhotos(leadId: string) {
  return useQuery({ queryKey: ["lead-photos", leadId], queryFn: () => leadPhotosApi.list(leadId) });
}

export function useLeadPhotoActions(leadId: string) {
  const qc = useQueryClient();
  function refresh() {
    for (const key of [["lead-photos", leadId], ["lead", leadId], ["leads"], ["operations"]]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  }
  const upload = useMutation({
    mutationFn: (file: File) => leadPhotosApi.upload(leadId, file),
    onSuccess: (photo) => {
      qc.setQueryData<LeadPhoto[]>(["lead-photos", leadId], (previous = []) =>
        [...previous.filter((item) => item.id !== photo.id), photo]);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (photoId: string) => leadPhotosApi.remove(leadId, photoId),
    onSuccess: (_, photoId) => {
      qc.setQueryData<LeadPhoto[]>(["lead-photos", leadId], (previous = []) =>
        previous.filter((item) => item.id !== photoId));
      refresh();
    },
  });
  return { upload, remove };
}
