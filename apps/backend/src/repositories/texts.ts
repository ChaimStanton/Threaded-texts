import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { isNonMainTextSection } from "../text/nonMainText.js";

const activeBookWhere = {
  deletedAt: null
} satisfies Prisma.BookWhereInput;

const activeTextUnitWhere = {
  deletedAt: null
} satisfies Prisma.TextUnitWhereInput;

const activeChapterWhere = {
  deletedAt: null
} satisfies Prisma.ChapterWhereInput;

export async function listBooks() {
  return prisma.book.findMany({
    where: activeBookWhere,
    include: { author: true },
    orderBy: { title: "asc" }
  });
}

export async function upsertBook(input: {
  slug: string;
  title: string;
  heTitle?: string;
  category?: string;
  authorId?: string;
}) {
  return prisma.book.upsert({
    where: { slug: input.slug },
    create: input,
    update: {
      ...input,
      deletedAt: null
    }
  });
}

export async function listChapters(bookId: string) {
  return prisma.chapter.findMany({
    where: {
      ...activeChapterWhere,
      bookId
    },
    orderBy: { number: "asc" }
  });
}

export async function upsertChapter(input: {
  bookId: string;
  number: number;
  ref: string;
  title?: string;
  heTitle?: string;
  isNonMainText?: boolean;
}) {
  const isNonMainText = input.isNonMainText ?? isNonMainTextSection(input);

  return prisma.chapter.upsert({
    where: {
      bookId_number: {
        bookId: input.bookId,
        number: input.number
      }
    },
    create: {
      ...input,
      isNonMainText
    },
    update: {
      ...input,
      isNonMainText,
      deletedAt: null
    }
  });
}

export async function listTextUnits(bookId: string) {
  return prisma.textUnit.findMany({
    where: {
      ...activeTextUnitWhere,
      bookId
    },
    include: { chapterRef: true },
    orderBy: [{ chapter: "asc" }, { verse: "asc" }, { paragraph: "asc" }]
  });
}

export async function getPublicationBook(bookId: string, language: "all" | "en" | "he" = "all") {
  const textUnitWhere = {
    ...activeTextUnitWhere,
    ...(language === "all" ? {} : { language })
  } satisfies Prisma.TextUnitWhereInput;

  return prisma.book.findFirst({
    where: {
      ...activeBookWhere,
      id: bookId
    },
    include: {
      author: true,
      chapters: {
        where: activeChapterWhere,
        orderBy: { number: "asc" },
        include: {
          textUnits: {
            where: textUnitWhere,
            orderBy: [{ verse: "asc" }, { paragraph: "asc" }]
          }
        }
      }
    }
  });
}

export async function upsertTextUnit(input: {
  paragraphId: string;
  bookId: string;
  chapterId?: string;
  chapter: number;
  verse?: number;
  paragraph: number;
  ref: string;
  text: string;
  language: string;
  version?: string;
}) {
  return prisma.textUnit.upsert({
    where: { paragraphId: input.paragraphId },
    create: input,
    update: {
      ...input,
      deletedAt: null
    }
  });
}
