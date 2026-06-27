"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface Source {
  content: string;
  document_name: string;
  chunk_index: number;
  similarity: number;
}

export default function SourceCard({ source, index }: { source: Source; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const relevance = Math.round(source.similarity * 100);

  const badgeColor =
    relevance >= 80 ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
    relevance >= 60 ? "text-amber-700 bg-amber-50 border-amber-200" :
                      "text-[#6b6a65] bg-[#f5f4f0] border-[#e0dfd8]";

  return (
    <div className="bg-white border border-[#e0dfd8] overflow-hidden">

      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-[#f5f4f0] transition-colors"
      >
        <span className="text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 shrink-0">
          {index}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[#111110] truncate">
            {source.document_name}
          </p>
          <p className="text-xs text-[#a3a29c] font-mono mt-0.5">
            chunk {source.chunk_index}
          </p>
        </div>

        <span className={`text-xs font-mono border px-1.5 py-0.5 shrink-0 ${badgeColor}`}>
          {relevance}%
        </span>

        {expanded
          ? <ChevronUp className="h-3 w-3 text-[#a3a29c] shrink-0" />
          : <ChevronDown className="h-3 w-3 text-[#a3a29c] shrink-0" />
        }
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-[#e0dfd8]">
          <p className="text-xs text-[#6b6a65] leading-relaxed mt-2 whitespace-pre-wrap">
            {source.content}
          </p>
        </div>
      )}

    </div>
  );
}
