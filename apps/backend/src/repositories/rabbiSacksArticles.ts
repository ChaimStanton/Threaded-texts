import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

const activeRabbiSacksArticleWhere = {
  deletedAt: null
} satisfies Prisma.RabbiSacksArticleWhereInput;

export async function listRabbiSacksArticles() {
  return prisma.rabbiSacksArticle.findMany({
    where: activeRabbiSacksArticleWhere,
    include: { author: true },
    orderBy: { scrapedAt: "desc" }
  });
}

export async function upsertRabbiSacksArticle(input: {
  authorId: string;
  sourceUrl: string;
  title: string;
  body: string;
  excerpt?: string;
  publishedAt?: Date;
}) {
  return prisma.rabbiSacksArticle.upsert({
    where: { sourceUrl: input.sourceUrl },
    create: input,
    update: {
      ...input,
      scrapedAt: new Date(),
      deletedAt: null
    }
  });
}
