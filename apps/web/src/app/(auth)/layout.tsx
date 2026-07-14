"use client";

import { FileCog } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileCog className="h-5 w-5" />
          </span>
          <span className="text-2xl font-bold tracking-tight">PDF Tool</span>
        </Link>
        {children}
      </motion.div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Edit, convert, organize and sign PDF files online.
      </p>
    </main>
  );
}
