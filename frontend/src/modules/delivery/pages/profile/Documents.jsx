import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileCheck, UploadCloud, Clock } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { toast } from "sonner";
import { useAuth } from "@core/context/AuthContext";

const Documents = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const docsData = user?.documents || {};

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

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
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
          return (
            <Card key={doc.id} className="p-4 border border-gray-100">
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
                    onClick={() =>
                      toast.info("Document upload will open file picker here")
                    }
                  >
                    <UploadCloud size={14} className="mr-1" />
                    {doc.url ? "Update" : "Upload"}
                  </Button>
                )}
                {doc.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={() => window.open(doc.url, "_blank", "noopener,noreferrer")}
                  >
                    View File
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Documents;
