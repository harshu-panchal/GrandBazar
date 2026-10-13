import { useState, useCallback } from "react";
import { toast } from "sonner";

// Shared blob-download helper for admin export buttons (Excel/CSV/PDF).
// `fetcher` must return an axios response with `responseType: 'blob'`.
export default function useExportBlob() {
  const [isExporting, setIsExporting] = useState(false);

  const exportBlob = useCallback(async (fetcher, filename, mimeType = "application/octet-stream") => {
    setIsExporting(true);
    try {
      const res = await fetcher();
      const blob = new Blob([res.data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || "Export failed");
      return false;
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportBlob, isExporting };
}
