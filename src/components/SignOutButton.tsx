"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={handleSignOut}
      title="Sign out"
      className="p-1.5 text-[#a3a29c] hover:text-[#111110] transition-colors"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}
