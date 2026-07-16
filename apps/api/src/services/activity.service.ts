import type { ActivityDTO, ListActivityQuery } from "@pdfforge/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type ActivityWithFile = Prisma.ActivityGetPayload<{ include: { file: true } }>;

export function toActivityDTO(a: ActivityWithFile): ActivityDTO {
  return {
    id: a.id,
    action: a.action as ActivityDTO["action"],
    detail: a.detail,
    fileId: a.fileId,
    fileName: a.file?.name ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

export async function log(
  _userId: string,
  _action: ActivityDTO["action"],
  _opts: { fileId?: string; detail?: string } = {},
): Promise<void> {
  // Privacy by design: the server intentionally records NO activity about files.
  // Files are processed transiently and never kept, so nothing about them —
  // including their names — is written to the database. The web app keeps a
  // private activity log in the browser instead (see web/src/lib/local-store).
  // Kept as a no-op so existing call sites don't need to change.
}

/** Deletes the given activity entries that belong to the user. Returns the count removed. */
export async function deleteMany(userId: string, ids: string[]): Promise<number> {
  const result = await prisma.activity.deleteMany({
    where: { userId, id: { in: ids } },
  });
  return result.count;
}

export async function list(userId: string, query: ListActivityQuery) {
  const [activities, total] = await prisma.$transaction([
    prisma.activity.findMany({
      where: { userId },
      include: { file: true },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.activity.count({ where: { userId } }),
  ]);
  return {
    activities: activities.map(toActivityDTO),
    total,
    page: query.page,
    limit: query.limit,
  };
}
