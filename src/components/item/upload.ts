export interface UploadResult {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export async function uploadFile(file: File, workItemId: number): Promise<UploadResult> {
  const fd = new FormData();
  fd.set("file", file, file.name || `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
  fd.set("workItemId", String(workItemId));
  const res = await fetch("/api/attachments", { method: "POST", body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
  return json as UploadResult;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
