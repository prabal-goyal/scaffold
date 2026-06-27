"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Loader2, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import gsap from "gsap";

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

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevDocCount = useRef(0);

  // Animate new doc card in when a doc is successfully added
  useEffect(() => {
    if (docs.length > prevDocCount.current && listRef.current) {
      const firstCard = listRef.current.firstElementChild as HTMLElement;
      if (firstCard) {
        gsap.fromTo(firstCard,
          { y: -8, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.25, ease: "power2.out" }
        );
      }
    }
    prevDocCount.current = docs.length;
  }, [docs.length]);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
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
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  return (
    <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto">

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "border-2 border-dashed p-6 text-center cursor-pointer transition-colors select-none",
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-[#d0cfc8] hover:border-[#a3a29c] hover:bg-[#f5f4f0]"
        )}
      >
        {uploading
          ? <Loader2 className="mx-auto h-6 w-6 text-blue-500 animate-spin" />
          : <Upload className="mx-auto h-6 w-6 text-[#a3a29c]" />
        }
        <p className="mt-2 text-xs text-[#6b6a65]">
          {uploading ? "Chunking + embedding…" : "Drop a PDF or click to upload"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 text-red-600 text-xs bg-red-50 border border-red-200 p-3">
          <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {docs.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] text-[#a3a29c] uppercase tracking-widest font-medium">
            Indexed
          </p>
          <div ref={listRef} className="flex flex-col gap-1.5">
            {docs.map((doc) => (
              <div
                key={doc.name}
                className="flex items-start gap-2 bg-white border border-[#e0dfd8] p-3"
              >
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{doc.name}</p>
                  <p className="text-[10px] text-[#a3a29c] font-mono mt-0.5">
                    {doc.pages}p · {doc.chunks} chunks
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <a
        href="/dashboard"
        className="mt-auto text-[10px] text-[#a3a29c] hover:text-[#111110] transition-colors text-center pt-4 tracking-wide uppercase"
      >
        Eval dashboard →
      </a>

    </div>
  );
}
