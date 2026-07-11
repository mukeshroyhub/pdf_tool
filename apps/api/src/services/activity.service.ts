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
  userId: string,
  action: ActivityDTO["action"],
  opts: { fileId?: string; detail?: string } = {},
): Promise<void> {
  // Respect the user's preference: when logging is disabled, record nothing.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activityLogging: true },
  });
  if (user && !user.activityLogging) return;

  await prisma.activity.create({
    data: { userId, action, fileId: opts.fileId ?? null, detail: opts.detail ?? null },
  });
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
