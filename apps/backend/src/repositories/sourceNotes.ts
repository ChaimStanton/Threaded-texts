import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

const activeSourceNoteWhere = {
  deletedAt: null
} satisfies Prisma.SourceNoteWhereInput;

export async function listSourceNotes() {
  return prisma.sourceNote.findMany({
    where: activeSourceNoteWhere,
    orderBy: { updatedAt: "desc" }
  });
}

export async function createSourceNote(input: {
  ref: string;
  title?: string;
  text?: string;
  version?: string;
  language: string;
  tags: string[];
}) {
  return prisma.sourceNote.create({
    data: {
      ...input,
      tags: JSON.stringify(input.tags)
    }
  });
}

export function serializeSourceNote<T extends { tags: string | null }>(note: T) {
  return {
    ...note,
    tags: note.tags ? (JSON.parse(note.tags) as string[]) : []
  };
}
