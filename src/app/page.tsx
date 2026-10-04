import ChatInterface from "@/components/ChatInterface";
import DocumentUpload from "@/components/DocumentUpload";
import MobileSidebar from "@/components/MobileSidebar";
import SignOutButton from "@/components/SignOutButton";

// A Server Component. The mobile sidebar toggle was the only state here, and it
// now lives in MobileSidebar, so "use client" is no longer at the page level.
export default function Home() {
  return (
    <main className="flex flex-col md:flex-row h-screen bg-[#f5f4f0] text-[#111110] overflow-hidden">

      <MobileSidebar signOut={<SignOutButton />}>
        <DocumentUpload />
      </MobileSidebar>

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
