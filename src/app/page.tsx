"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import ChatInterface from "@/components/ChatInterface";
import DocumentUpload from "@/components/DocumentUpload";
import SignOutButton from "@/components/SignOutButton";

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <main className="flex flex-col md:flex-row h-screen bg-[#f5f4f0] text-[#111110] overflow-hidden">

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[#e0dfd8] shrink-0">
        <button onClick={() => setSidebarOpen(true)} className="p-1 text-[#6b6a65] hover:text-[#111110] transition-colors">
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold tracking-tight">RAG</span>
        <SignOutButton />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-[#e0dfd8] flex flex-col">
            <div className="p-4 border-b border-[#e0dfd8] flex items-center justify-between">
              <div>
                <h1 className="text-base font-semibold tracking-tight">RAG</h1>
                <p className="text-xs text-[#a3a29c] mt-0.5">Chat with your documents</p>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 text-[#a3a29c] hover:text-[#111110] transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <DocumentUpload />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-72 border-r border-[#e0dfd8] flex-col shrink-0 bg-white">
        <div className="p-4 border-b border-[#e0dfd8] flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold tracking-tight">RAG</h1>
            <p className="text-xs text-[#a3a29c] mt-0.5">Chat with your documents</p>
          </div>
          <SignOutButton />
        </div>
        <DocumentUpload />
      </aside>

      <div className="flex flex-1 min-w-0 min-h-0">
        <ChatInterface />
      </div>

    </main>
  );
}
