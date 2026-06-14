"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ThumbsUp, ThumbsDown, Activity } from "lucide-react";

interface EvalEntry {
  question: string;
  answer: string;
  rating: number;
  created_at: string;
}

interface Stats {
  total: number;
  positive: number;
  negative: number;
  accuracy: number;
  recent: EvalEntry[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  // Fetch stats when the page mounts.
  // useEffect with [] runs once after the first render — equivalent to componentDidMount.
  useEffect(() => {
    fetch("/api/eval")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  if (!stats) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <p className="text-white/30 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8 max-w-3xl mx-auto">

      <Link
        href="/"
        className="inline-flex items-center gap-2 text-white/40 hover:text-white text-sm mb-8 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to chat
      </Link>

      <h1 className="text-2xl font-semibold">Eval Dashboard</h1>
      <p className="text-white/40 text-sm mt-1 mb-8">
        Tracks answer quality based on thumbs up / down feedback
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <StatCard
          icon={<Activity className="h-5 w-5 text-blue-400" />}
          label="Total ratings"
          value={stats.total}
        />
        <StatCard
          icon={<ThumbsUp className="h-5 w-5 text-green-400" />}
          label="Positive"
          value={stats.positive}
        />
        <StatCard
          icon={<ThumbsDown className="h-5 w-5 text-red-400" />}
          label="Negative"
          value={stats.negative}
        />
      </div>

      {/* Accuracy — big prominent number */}
      <div className={`rounded-2xl p-6 mb-10 border ${
        stats.accuracy >= 70
          ? "bg-green-500/10 border-green-500/20"
          : stats.accuracy >= 40
          ? "bg-yellow-500/10 border-yellow-500/20"
          : "bg-red-500/10 border-red-500/20"
      }`}>
        <p className="text-sm text-white/50 mb-1">Answer accuracy</p>
        <p className="text-5xl font-bold">{stats.accuracy}%</p>
        <p className="text-xs text-white/30 mt-2">
          {stats.accuracy >= 70
            ? "Good — chunking strategy is working well"
            : stats.accuracy >= 40
            ? "Fair — review recent 👎 answers to improve chunking"
            : "Poor — check chunk size, overlap, and prompt design"}
        </p>
      </div>

      {/* Recent ratings table */}
      <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-3">
        Recent feedback
      </h2>

      {stats.recent.length === 0 ? (
        <p className="text-white/20 text-sm">
          No ratings yet — go chat and rate some answers!
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recent.map((entry, i) => (
            <div
              key={i}
              className="bg-white/5 rounded-xl p-4 border border-white/10 flex items-start gap-4"
            >
              <span className="text-xl shrink-0 mt-0.5">
                {entry.rating === 1 ? "👍" : "👎"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/90 truncate">
                  {entry.question}
                </p>
                <p className="text-xs text-white/40 mt-1 line-clamp-2">
                  {entry.answer}
                </p>
                <p className="text-xs text-white/20 mt-2">
                  {new Date(entry.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-white/5 rounded-xl p-5 border border-white/10">
      <div className="mb-3">{icon}</div>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-xs text-white/40 mt-1">{label}</p>
    </div>
  );
}
