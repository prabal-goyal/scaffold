import ChatInterface from "@/components/ChatInterface";
import DocumentUpload from "@/components/DocumentUpload";

export default function Home() {
  return (
    <main className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden">

      {/* Left sidebar — document upload + indexed doc list */}
      <aside className="w-72 border-r border-white/10 flex flex-col shrink-0">
        <div className="p-4 border-b border-white/10">
          <h1 className="text-lg font-semibold tracking-tight">RAG</h1>
          <p className="text-xs text-white/40 mt-0.5">Chat with your documents</p>
        </div>
        <DocumentUpload />
      </aside>

      {/* Center + right — chat and sources side by side */}
      <div className="flex flex-1 min-w-0">
        <ChatInterface />
      </div>

    </main>
  );
}
