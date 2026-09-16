"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ThumbsUp, ThumbsDown, Activity } from "lucide-react";
import gsap from "gsap";
import type { EvalStats } from "@/lib/stats";

/**
 * The only part of the dashboard that needs the browser: a stagger-in and a
 * count-up on the accuracy figure. Everything else is static given `stats`, so
 * it renders on the server and arrives already populated — no hydrate, no
 * round trip, no "Loading…" flash.
 */
export default function DashboardView({ stats }: { stats: EvalStats }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const accuracyRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    gsap.fromTo(
      containerRef.current.children,
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.35, stagger: 0.07, ease: "power2.out" }
    );

    if (accuracyRef.current) {
      const obj = { val: 0 };
      gsap.to(obj, {
        val: stats.accuracy,
        duration: 0.8,
        ease: "power2.out",
        delay: 0.3,
        onUpdate: () => {
          if (accuracyRef.current) {
            accuracyRef.current.textContent = `${Math.round(obj.val)}%`;
          }
        },
      });
    }
  }, [stats]);

  return (
    <div className="min-h-screen bg-[#f5f4f0] p-8 max-w-3xl mx-auto">

      <Link
        href="/"
        className="inline-flex items-center gap-2 text-[#a3a29c] hover:text-[#111110] text-xs mb-10 transition-colors uppercase tracking-wide"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to chat
      </Link>

      <div ref={containerRef} className="flex flex-col gap-8">

        <div>
          <h1 className="text-2xl font-semibold text-[#111110]">Eval Dashboard</h1>
          <p className="text-sm text-[#6b6a65] mt-1">
            Answer quality based on thumbs up / down feedback
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
          <StatCard
            icon={<Activity className="h-4 w-4 text-[#6b6a65]" />}
            label="Total ratings"
            value={stats.total}
          />
          <StatCard
            icon={<ThumbsUp className="h-4 w-4 text-emerald-600" />}
            label="Positive"
            value={stats.positive}
          />
          <StatCard
            icon={<ThumbsDown className="h-4 w-4 text-red-500" />}
            label="Negative"
            value={stats.negative}
          />
        </div>

        {/* Accuracy */}
        <div className={`p-6 border ${
          stats.accuracy >= 70
            ? "bg-emerald-50 border-emerald-200"
            : stats.accuracy >= 40
            ? "bg-amber-50 border-amber-200"
            : "bg-red-50 border-red-200"
        }`}>
          <p className="text-xs text-[#6b6a65] uppercase tracking-widest mb-2">Answer accuracy</p>
          <p ref={accuracyRef} className="text-5xl font-semibold text-[#111110]">0%</p>
          <p className="text-xs text-[#6b6a65] mt-3">
            {stats.accuracy >= 70
              ? "Good — chunking strategy is working well"
              : stats.accuracy >= 40
              ? "Fair — review recent 👎 answers to improve chunking"
              : "Poor — check chunk size, overlap, and prompt design"}
          </p>
        </div>

        {/* Recent ratings */}
        <div>
          <p className="text-[10px] text-[#a3a29c] uppercase tracking-widest font-medium mb-3">
            Recent feedback
          </p>

          {stats.recent.length === 0 ? (
            <p className="text-sm text-[#a3a29c]">
              No ratings yet — go chat and rate some answers!
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {stats.recent.map((entry, i) => (
                <div
                  key={i}
                  className="bg-white border border-[#e0dfd8] p-4 flex items-start gap-4"
                >
                  <span className="text-base shrink-0 mt-0.5">
                    {entry.rating === 1 ? "👍" : "👎"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#111110] truncate">
                      {entry.question}
                    </p>
                    <p className="text-xs text-[#6b6a65] mt-1 line-clamp-2">
                      {entry.answer}
                    </p>
                    <p className="text-[10px] text-[#a3a29c] font-mono mt-2">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
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
    <div className="bg-white border border-[#e0dfd8] p-5">
      <div className="mb-3">{icon}</div>
      <p className="text-3xl font-semibold text-[#111110]">{value}</p>
      <p className="text-[10px] text-[#a3a29c] uppercase tracking-widest mt-1">{label}</p>
    </div>
  );
}
