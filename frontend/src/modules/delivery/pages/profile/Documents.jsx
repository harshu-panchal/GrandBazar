import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileCheck, UploadCloud, Clock, RotateCw, X } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { toast } from "sonner";
import { useAuth } from "@core/context/AuthContext";
import { deliveryApi } from "../../services/deliveryApi";

const Documents = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const docsData = user?.documents || {};
  const fileInputRef = useRef(null);
  const pendingDocIdRef = useRef(null);
  const [uploadingId, setUploadingId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const docs = useMemo(
    () => [
      {
        id: "aadhar",
        title: "Aadhar Card",
        url: docsData.aadhar,
      },
      {
        id: "pan",
        title: "PAN Card",
        url: docsData.pan,
      },
      {
        id: "drivingLicense",
        title: "Driving License",
        url: docsData.drivingLicense,
      },
    ],
    [docsData.aadhar, docsData.pan, docsData.drivingLicense],
  );

  const getStatus = (url) => {
    if (!url) return "Missing";
    if (user?.isVerified) return "Verified";
    return "Pending";
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Verified":
        return (
          <span className="flex items-center text-brand-600 bg-brand-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
            <FileCheck size={12} className="mr-1" /> Verified
          </span>
        );
      case "Pending":
        return (
          <span className="flex items-center text-yellow-600 bg-yellow-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
            <Clock size={12} className="mr-1" /> Pending
          </span>
        );
      default:
        return (
          <span className="flex items-center text-gray-500 bg-gray-100 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
            Not uploaded
          </span>
        );
    }
  };

  const triggerUpload = (docId) => {
    if (uploadingId) return;
    pendingDocIdRef.current = docId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    const docId = pendingDocIdRef.current;
    e.target.value = "";
    if (!file || !docId) return;

    setUploadingId(docId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await deliveryApi.uploadMedia(formData);
      const url = uploadRes.data?.result?.url || uploadRes.data?.url;
      if (!url) {
        throw new Error("Upload did not return a file URL");
      }
      await deliveryApi.updateProfile({ documents: { [docId]: url } });
      await refreshUser({ forceRefresh: true });
      toast.success("Document uploaded successfully");
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to upload document",
      );
    } finally {
      setUploadingId(null);
      pendingDocIdRef.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">My Documents</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {docs.map((doc) => {
          const status = getStatus(doc.url);
          const isUploading = uploadingId === doc.id;
          return (
            <div key={doc.id} className="p-4 border border-gray-100">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-gray-800">{doc.title}</h4>
                {getStatusBadge(status)}
              </div>

              {doc.url ? (
                <p className="text-xs text-gray-500 mb-3 truncate">
                  {doc.url}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mb-3">
                  No file uploaded yet
                </p>
              )}

              <div className="flex space-x-2">
                {status !== "Verified" && (
                  <Button
                    size="sm"
                    className="w-full text-xs h-8"
                    disabled={isUploading}
                    onClick={() => triggerUpload(doc.id)}
                  >
                    {isUploading ? (
                      <RotateCw size={14} className="mr-1 animate-spin" />
                    ) : (
                      <UploadCloud size={14} className="mr-1" />
                    )}
                    {isUploading
                      ? "Uploading..."
                      : doc.url
                        ? "Update"
                        : "Upload"}
                  </Button>
                )}
                {doc.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={() => setPreviewUrl(doc.url)}
                  >
                    View File
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <X size={20} />
          </button>
          <img
            src={previewUrl}
            alt="Document preview"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default Documents;
