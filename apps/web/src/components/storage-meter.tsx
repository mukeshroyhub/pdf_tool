"use client";

import { HardDrive } from "lucide-react";
import { useStorageUsage } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/format";

/**
 * Shows how much space the browser-local library is using. Usage/quota come
 * from the Storage API (IndexedDB), not the server — files live on this device.
 */
export function StorageMeter() {
  const { data } = useStorageUsage();
  const used = data?.usedBytes ?? 0;
  const quota = data?.quotaBytes ?? null;
  const percent = quota && quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <HardDrive className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Browser storage</p>
            <p className="text-xs text-muted-foreground">
              {quota ? `${formatBytes(used)} of ${formatBytes(quota)}` : formatBytes(used)}
            </p>
          </div>
          <Progress value={percent} />
        </div>
      </CardContent>
    </Card>
  );
}
