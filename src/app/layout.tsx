import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAG — Chat with your docs",
  description: "Upload PDFs, ask questions, get cited answers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
