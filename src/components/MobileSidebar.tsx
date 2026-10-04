"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

// The only stateful part of the home page: opening and closing the sidebar on
// small screens. Kept as a leaf so the page itself stays a Server Component.
export default function MobileSidebar({
  signOut,
  children,
}: {
  signOut: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[#e0dfd8] shrink-0">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open documents"
          className="p-1 text-[#6b6a65] hover:text-[#111110] transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold tracking-tight">RAG</span>
        {signOut}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-[#e0dfd8] flex flex-col">
            <div className="p-4 border-b border-[#e0dfd8] flex items-center justify-between">
              <div>
                <h1 className="text-base font-semibold tracking-tight">RAG</h1>
                <p className="text-xs text-[#a3a29c] mt-0.5">Chat with your documents</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close documents"
                className="p-1 text-[#a3a29c] hover:text-[#111110] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </aside>
        </div>
      )}
    </>
  );
}
