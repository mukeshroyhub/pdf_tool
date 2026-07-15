"use client";

import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useProtectPdf, useUnlockPdf } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ProtectDialog({ fileId }: { fileId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"protect" | "unlock">("protect");
  const [password, setPassword] = useState("");
  const protect = useProtectPdf(fileId);
  const unlock = useUnlockPdf(fileId);
  const { refreshUser } = useAuth();
  const pending = protect.isPending || unlock.isPending;
  const minLen = mode === "protect" ? 4 : 1;

  const run = async () => {
    try {
      if (mode === "protect") {
        await protect.mutateAsync({ password });
        toast.success("Protected copy created");
      } else {
        await unlock.mutateAsync({ password });
        toast.success("Unlocked copy created");
      }
      await refreshUser();
      setOpen(false);
      setPassword("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Operation failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Lock /> Password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Password protection</DialogTitle>
          <DialogDescription>
            Add or remove a password. The result is saved as a new file.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {(["protect", "unlock"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-lg border p-2 text-sm transition-colors",
                mode === m ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
              )}
            >
              {m === "protect" ? "Add password" : "Remove password"}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pw">{mode === "protect" ? "New password" : "Current password"}</Label>
          <Input
            id="pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "protect" ? "At least 4 characters" : "Enter the PDF's password"}
          />
        </div>

        <DialogFooter>
          <Button disabled={pending || password.length < minLen} onClick={() => void run()}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {mode === "protect" ? "Protect PDF" : "Unlock PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
