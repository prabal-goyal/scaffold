import ChatInterface from "@/components/ChatInterface";
import DocumentUpload from "@/components/DocumentUpload";
import SignOutButton from "@/components/SignOutButton";

export default function Home() {
  return (
    <main className="flex h-screen bg-[#f5f4f0] text-[#111110] overflow-hidden">

      <aside className="w-72 border-r border-[#e0dfd8] flex flex-col shrink-0 bg-white">
        <div className="p-4 border-b border-[#e0dfd8] flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold tracking-tight">RAG</h1>
            <p className="text-xs text-[#a3a29c] mt-0.5">Chat with your documents</p>
          </div>
          <SignOutButton />
        </div>
        <DocumentUpload />
      </aside>

      <div className="flex flex-1 min-w-0">
        <ChatInterface />
      </div>

    </main>
  );
}
