export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const UPLOAD_ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

export function uploadFormat(name: string): "pdf" | "png" | "jpeg" | undefined {
  const extension = name.toLowerCase().split(".").at(-1);
  if (extension === "pdf" || extension === "png") return extension;
  if (extension === "jpg" || extension === "jpeg") return "jpeg";
}
