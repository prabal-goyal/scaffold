"use client";

import { useChat } from "ai/react";
import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import SourceCard, { type Source } from "./SourceCard";

type MessageSources = Record<string, Source[]>;

export default function ChatInterface() {
  const [messageSources, setMessageSources] = useState<MessageSources>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});

  // We capture the question text at submit time so onFinish can use it.
  // By the time onFinish fires, the input box has already been cleared by useChat.
  const pendingQuestionRef = useRef<string>("");

  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",

    onFinish: (message) => {
      // Stream is done — bind sources to this message id.
      // We fire /api/retrieve here so the embed + search is not duplicated
      // during the initial chat request. (The chat route already embeds + searches
      // for its own prompt — this is a second, parallel call for the UI only.)
      const question = pendingQuestionRef.current;
      if (!question) return;

      fetch("/api/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      })
        .then((r) => r.json())
        .then(({ chunks }) => {
          if (chunks?.length) {
            setMessageSources((prev) => ({ ...prev, [message.id]: chunks }));
          }
        });

      pendingQuestionRef.current = "";
    },
  });

  // Auto-scroll as tokens arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Custom submit: capture the question before useChat clears the input
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    pendingQuestionRef.current = input;
    handleSubmit(e);
  }

  async function submitRating(message: { id: string; content: string }, rating: 1 | -1) {
    if (ratings[message.id]) return;
    setRatings((prev) => ({ ...prev, [message.id]: rating }));

    const idx = messages.findIndex((m) => m.id === message.id);
    const question = idx > 0 ? messages[idx - 1].content : "";

    await fetch("/api/eval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        answer: message.content,
        sources: messageSources[message.id] ?? [],
        rating,
      }),
    });
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const visibleSources = lastAssistant ? (messageSources[lastAssistant.id] ?? []) : [];

  return (
    <div className="flex flex-1 min-w-0 min-h-0">

      {/* ── Center: messages + input ── */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <p className="text-white/20 text-sm">Upload a PDF then ask anything about it</p>
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
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  message.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-white/10 text-white/90 rounded-bl-sm"
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
                      "text-base transition-opacity",
                      ratings[message.id] === 1 ? "opacity-100" : "opacity-25 hover:opacity-60"
                    )}
                  >👍</button>
                  <button
                    onClick={() => submitRating(message, -1)}
                    title="Bad answer"
                    className={cn(
                      "text-base transition-opacity",
                      ratings[message.id] === -1 ? "opacity-100" : "opacity-25 hover:opacity-60"
                    )}
                  >👎</button>
                </div>
              )}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex items-start">
              <div className="bg-white/10 rounded-2xl rounded-bl-sm px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-white/50" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={onSubmit}
          className="p-4 border-t border-white/10 flex gap-3 items-end"
        >
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
            className="flex-1 bg-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-2.5 bg-blue-600 rounded-xl text-white disabled:opacity-30 hover:bg-blue-500 transition-colors shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* ── Right: sources panel ── */}
      <div className="w-72 border-l border-white/10 flex flex-col shrink-0">
        <div className="p-4 border-b border-white/10">
          <h2 className="text-sm font-medium">Sources</h2>
          <p className="text-xs text-white/30 mt-0.5">Retrieved chunks for the last answer</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {visibleSources.length === 0 ? (
            <p className="text-xs text-white/20 text-center py-8">
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
