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

  // similarity is 0–1 from our Postgres function (1 - cosine distance).
  // We display it as a percentage so it's human-readable.
  const relevance = Math.round(source.similarity * 100);

  // Color the relevance badge based on score: green > 80%, yellow > 60%, gray otherwise
  const badgeColor =
    relevance >= 80 ? "text-green-400 bg-green-400/10" :
    relevance >= 60 ? "text-yellow-400 bg-yellow-400/10" :
                      "text-white/40 bg-white/5";

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">

      {/* Header row — always visible, click to expand */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-white/5 transition-colors"
      >
        {/* Source number badge */}
        <span className="text-xs font-mono bg-blue-500/20 text-blue-300 rounded px-1.5 py-0.5 shrink-0">
          {index}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white/80 truncate">
            {source.document_name}
          </p>
          <p className="text-xs text-white/40 mt-0.5">
            chunk {source.chunk_index}
          </p>
        </div>

        {/* Relevance score */}
        <span className={`text-xs font-medium rounded px-1.5 py-0.5 shrink-0 ${badgeColor}`}>
          {relevance}%
        </span>

        {expanded
          ? <ChevronUp className="h-3 w-3 text-white/30 shrink-0" />
          : <ChevronDown className="h-3 w-3 text-white/30 shrink-0" />
        }
      </button>

      {/* Expanded content — the actual chunk text */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/10">
          <p className="text-xs text-white/60 leading-relaxed mt-2 whitespace-pre-wrap">
            {source.content}
          </p>
        </div>
      )}

    </div>
  );
}
