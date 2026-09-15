"use client";

import { useChat } from "ai/react";
import { useState, useRef, useEffect } from "react";
import { Send, Loader2, X, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import SourceCard, { type Source } from "./SourceCard";
import gsap from "gsap";

type MessageSources = Record<string, Source[]>;

// The AI SDK surfaces a failed response as an Error carrying the raw body, so
// the route's own JSON message is in there — worth unwrapping, since "Too many
// requests" is far more useful than the stringified body.
function readErrorMessage(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Not JSON — fall through to the generic message below.
  }
  return "Something went wrong. Please try again.";
}

export default function ChatInterface() {
  const [messageSources, setMessageSources] = useState<MessageSources>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<unknown[]>([]);
  const consumedDataRef = useRef(0);
  const prevMsgCount = useRef(0);
  const messagesBodyRef = useRef<HTMLDivElement>(null);
  const sourcePanelRef = useRef<HTMLDivElement>(null);

  const [chatError, setChatError] = useState<string | null>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, data } = useChat({
    api: "/api/chat",
    // Without this the route's 429 and 400 responses fail silently — the
    // request disappears and the user is left looking at an unchanged screen.
    onError: (error) => {
      setChatError(readErrorMessage(error));
    },
    onFinish: (message) => {
      const allData = dataRef.current as Array<{ sources?: Source[] }>;
      const entry = allData[consumedDataRef.current];
      consumedDataRef.current += 1;
      const sources = entry?.sources ?? [];
      if (sources.length) {
        setMessageSources((prev) => ({ ...prev, [message.id]: sources }));
      }
    },
  });

  useEffect(() => {
    dataRef.current = data ?? [];
  }, [data]);

  // Animate new message sliding up
  useEffect(() => {
    if (messages.length > prevMsgCount.current && messagesBodyRef.current) {
      const children = messagesBodyRef.current.children;
      const el = children[children.length - 2] as HTMLElement;
      if (el) {
        gsap.fromTo(el,
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.22, ease: "power2.out" }
        );
      }
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const visibleSources = lastAssistant ? (messageSources[lastAssistant.id] ?? []) : [];

  // Stagger desktop source cards in from right
  useEffect(() => {
    if (visibleSources.length > 0 && sourcePanelRef.current) {
      const cards = Array.from(sourcePanelRef.current.children);
      gsap.fromTo(cards,
        { x: 10, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.2, stagger: 0.06, ease: "power2.out" }
      );
    }
  }, [visibleSources.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setChatError(null);
    handleSubmit(e);
  }

  async function submitRating(message: { id: string; content: string }, rating: 1 | -1) {
    if (ratings[message.id]) return;
    setRatings((prev) => ({ ...prev, [message.id]: rating }));
    const idx = messages.findIndex((m) => m.id === message.id);
    const question = idx > 0 ? messages[idx - 1].content : "";
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          answer: message.content,
          sources: messageSources[message.id] ?? [],
          rating,
        }),
      });
      if (!res.ok) throw new Error("Rating was not saved");
    } catch {
      // The rating was applied optimistically above; roll it back so the UI
      // does not claim feedback was recorded when it was not.
      setRatings((prev) => {
        const next = { ...prev };
        delete next[message.id];
        return next;
      });
      setChatError("Could not save your rating. Please try again.");
    }
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-0">

      {/* Center: messages + input */}
      <div className="flex flex-col flex-1 min-w-0 bg-[#f5f4f0]">
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5" ref={messagesBodyRef}>
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <p className="text-[#a3a29c] text-sm text-center px-4">Upload a PDF then ask anything about it</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex flex-col gap-1.5",
                message.role === "user" ? "items-end" : "items-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] md:max-w-[80%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  message.role === "user"
                    ? "bg-[#111110] text-white"
                    : "bg-white border border-[#e0dfd8] text-[#111110]"
                )}
              >
                {message.content}
              </div>

              {message.role === "assistant" && (
                <div className="flex items-center gap-2 px-1">
                  <button
                    onClick={() => submitRating(message, 1)}
                    title="Good answer"
                    className={cn(
                      "text-sm transition-opacity",
                      ratings[message.id] === 1 ? "opacity-100" : "opacity-25 hover:opacity-60"
                    )}
                  >👍</button>
                  <button
                    onClick={() => submitRating(message, -1)}
                    title="Bad answer"
                    className={cn(
                      "text-sm transition-opacity",
                      ratings[message.id] === -1 ? "opacity-100" : "opacity-25 hover:opacity-60"
                    )}
                  >👎</button>
                </div>
              )}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex items-start">
              <div className="bg-white border border-[#e0dfd8] px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-[#a3a29c]" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {chatError && (
          <div
            role="alert"
            className="mx-3 md:mx-4 mb-2 flex items-start justify-between gap-3 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            <span>{chatError}</span>
            <button
              type="button"
              onClick={() => setChatError(null)}
              aria-label="Dismiss error"
              className="shrink-0 text-red-400 hover:text-red-700 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="p-3 md:p-4 border-t border-[#e0dfd8] flex gap-2 md:gap-3 items-end bg-white"
        >
          {/* Mobile sources button */}
          {visibleSources.length > 0 && (
            <button
              type="button"
              onClick={() => setSourcesOpen(true)}
              className="md:hidden shrink-0 p-2.5 border border-[#e0dfd8] text-[#6b6a65] hover:text-[#111110] hover:border-[#111110] transition-colors relative"
            >
              <BookOpen className="h-4 w-4" />
              <span className="absolute -top-1.5 -right-1.5 bg-[#111110] text-white text-[9px] font-mono w-4 h-4 flex items-center justify-center">
                {visibleSources.length}
              </span>
            </button>
          )}

          <textarea
            value={input}
            onChange={handleInputChange}
            placeholder="Ask a question about your documents…"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e as unknown as React.FormEvent);
              }
            }}
            className="flex-1 bg-[#f5f4f0] border border-[#e0dfd8] px-4 py-2.5 text-sm text-[#111110] placeholder-[#a3a29c] resize-none focus:outline-none focus:border-[#111110] transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-2.5 bg-[#111110] text-white disabled:opacity-30 hover:bg-[#2d2d2c] transition-colors shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* Mobile sources bottom sheet */}
      {sourcesOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSourcesOpen(false)} />
          <div className="relative bg-white border-t border-[#e0dfd8] flex flex-col" style={{ maxHeight: "65vh" }}>
            <div className="flex items-center justify-between p-4 border-b border-[#e0dfd8] shrink-0">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-widest">Sources</h2>
                <p className="text-[10px] text-[#a3a29c] mt-0.5">Retrieved chunks for the last answer</p>
              </div>
              <button onClick={() => setSourcesOpen(false)} className="p-1 text-[#a3a29c] hover:text-[#111110] transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-3 flex flex-col gap-1.5">
              {visibleSources.map((source, i) => (
                <SourceCard key={i} source={source} index={i + 1} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Desktop sources panel */}
      <div className="hidden md:flex w-72 border-l border-[#e0dfd8] flex-col shrink-0 bg-white">
        <div className="p-4 border-b border-[#e0dfd8]">
          <h2 className="text-xs font-semibold uppercase tracking-widest">Sources</h2>
          <p className="text-[10px] text-[#a3a29c] mt-0.5">Retrieved chunks for the last answer</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5" ref={sourcePanelRef}>
          {visibleSources.length === 0 ? (
            <p className="text-xs text-[#a3a29c] text-center py-8">
              Sources appear here after you ask a question
            </p>
          ) : (
            visibleSources.map((source, i) => (
              <SourceCard key={i} source={source} index={i + 1} />
            ))
          )}
        </div>
      </div>

    </div>
  );
}
