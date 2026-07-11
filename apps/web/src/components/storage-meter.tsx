"use client";

import { HardDrive } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/format";

export function StorageMeter() {
  const { user } = useAuth();
  if (!user) return null;
  const percent = Math.min(100, Math.round((user.storageUsed / user.storageLimit) * 100));

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <HardDrive className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Storage</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(user.storageUsed)} of {formatBytes(user.storageLimit)} ({percent}%)
            </p>
          </div>
          <Progress value={percent} />
        </div>
      </CardContent>
    </Card>
  );
}
