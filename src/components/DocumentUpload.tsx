"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadedDoc {
  name: string;
  chunks: number;
  pages: number;
}

export default function DocumentUpload() {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  // We hide the real file input and trigger it programmatically
  // because the default <input type="file"> is unstyable across browsers
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);

    // FormData is the browser API for sending files over HTTP.
    // The server reads this with req.formData() and calls formData.get("file").
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error ?? "Upload failed");

      // Prepend new doc to the list so most recent is always on top
      setDocs((prev) => [
        { name: json.document, chunks: json.chunks, pages: json.pages },
        ...prev,
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); // stop browser from opening the file in a new tab
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  return (
    <div className="flex flex-col gap-4 p-4 flex-1 overflow-y-auto">

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors select-none",
          dragging
            ? "border-blue-400 bg-blue-400/10"
            : "border-white/20 hover:border-white/40"
        )}
      >
        {uploading
          ? <Loader2 className="mx-auto h-7 w-7 text-blue-400 animate-spin" />
          : <Upload className="mx-auto h-7 w-7 text-white/40" />
        }
        <p className="mt-2 text-sm text-white/50">
          {uploading ? "Chunking + embedding..." : "Drop a PDF or click to upload"}
        </p>
        {/* Hidden real file input */}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 text-red-400 text-sm bg-red-400/10 rounded-lg p-3">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* List of successfully indexed docs */}
      {docs.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-white/30 uppercase tracking-wider font-medium">
            Indexed
          </p>
          {docs.map((doc) => (
            <div
              key={doc.name}
              className="flex items-start gap-2 bg-white/5 rounded-lg p-3 border border-white/10"
            >
              <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{doc.name}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {doc.pages} pages · {doc.chunks} chunks
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link to eval dashboard at the bottom of the sidebar */}
      <a
        href="/dashboard"
        className="mt-auto text-xs text-white/30 hover:text-white/60 transition-colors text-center pt-4"
      >
        View eval dashboard →
      </a>

    </div>
  );
}
