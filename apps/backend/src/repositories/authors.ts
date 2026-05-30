import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

const activeAuthorWhere = {
  deletedAt: null
} satisfies Prisma.AuthorWhereInput;

export async function listAuthors() {
  return prisma.author.findMany({
    where: activeAuthorWhere,
    orderBy: [{ sortName: "asc" }, { displayName: "asc" }]
  });
}

export async function upsertAuthor(input: {
  slug: string;
  displayName: string;
  sortName?: string;
  bio?: string;
}) {
  return prisma.author.upsert({
    where: { slug: input.slug },
    create: input,
    update: {
      ...input,
      deletedAt: null
    }
  });
}
