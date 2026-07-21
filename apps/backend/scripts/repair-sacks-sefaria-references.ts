import { PrismaClient } from "@prisma/client";
import { SACKS_TARGET_BOOK_SLUGS } from "../src/text/sacksProcessingEligibility.js";

const prisma = new PrismaClient();
const targetBookSlugs = Object.values(SACKS_TARGET_BOOK_SLUGS);
const canonicalRefByAlias = new Map<string, string>([
  ["Mishneh Torah, Hilkhot Yesodei HaTorah 5:11", "Mishneh Torah, Foundations of the Torah 5:11"],
  ["Mishneh Torah, Hanukkah 4:14", "Mishneh Torah, Scroll of Esther and Hanukkah 4:14"],
  ["Mishneh Torah, Hilchot Chanukah 4:14", "Mishneh Torah, Scroll of Esther and Hanukkah 4:14"],
  ["Mishneh Torah, Laws of Hanukkah 4:14", "Mishneh Torah, Scroll of Esther and Hanukkah 4:14"],
  ["Mishnah Uktzin 3:12", "Mishnah Oktzin 3:12"],
  ["Hilchot De'ot 6:3", "Mishneh Torah, Human Dispositions 6:3"],
  ["Hilchot De'ot 1:4-7", "Mishneh Torah, Human Dispositions 1:4-7"],
  ["Hilchot De'ot 6:7", "Mishneh Torah, Human Dispositions 6:7"],
  ["Hilchot Teshuvah 1:1", "Mishneh Torah, Repentance 1:1"],
  ["Hilkhot Melakhim uMilchamot 12:2", "Mishneh Torah, Kings and Wars 12:2"],
  ["Babylonian Talmud Sanhedrin 82a", "Sanhedrin 82a"],
  [
    "Mishneh Torah, Hilchot Sanhedrin 18:6",
    "Mishneh Torah, The Sanhedrin and the Penalties within Their Jurisdiction 18:6"
  ],
  [
    "Mishneh Torah, Sanhedrin 1:1",
    "Mishneh Torah, The Sanhedrin and the Penalties within Their Jurisdiction 1:1"
  ],
  ["Mishneh Torah, Torah Scroll 7:1", "Mishneh Torah, Tefillin, Mezuzah and the Torah Scroll 7:1"],
  [
    "Mishneh Torah, Tefillin, Mezuzah and Torah Scroll 10:1",
    "Mishneh Torah, Tefillin, Mezuzah and the Torah Scroll 10:1"
  ],
  ["Mishneh Torah, Mezuzah 6:13", "Mishneh Torah, Tefillin, Mezuzah and the Torah Scroll 6:13"],
  [
    "Mishneh Torah, Injuring a Person or Property 8:10-11",
    "Mishneh Torah, One Who Injures a Person or Property 8:10-11"
  ],
  ["Mishneh Torah, Chametz uMatzah 7:6", "Mishneh Torah, Leavened and Unleavened Bread 7:6"],
  ["Mishneh Torah, Chametz and Matzah 7:1", "Mishneh Torah, Leavened and Unleavened Bread 7:1"],
  ["Mishneh Torah, Chametz uMatzah 7:1", "Mishneh Torah, Leavened and Unleavened Bread 7:1"],
  ["Mishneh Torah, Chametz U'Matzah 7:1", "Mishneh Torah, Leavened and Unleavened Bread 7:1"],
  ["Mishneh Torah, Chametz and Matzah 7:3", "Mishneh Torah, Leavened and Unleavened Bread 7:3"],
  ["Mishneh Torah, Chametz uMatzah 7:3", "Mishneh Torah, Leavened and Unleavened Bread 7:3"],
  ["Mishneh Torah, Shabbat 20:14", "Mishneh Torah, Sabbath 20:14"],
  ["Mishneh Torah, Shabbat 6:18", "Mishneh Torah, Sabbath 6:18"],
  [
    "Mishneh Torah, Service on Yom Kippur 3:1",
    "Mishneh Torah, Service on the Day of Atonement 3:1"
  ],
  [
    "Mishneh Torah, Prayer and Priestly Blessing 12:1",
    "Mishneh Torah, Prayer and the Priestly Blessing 12:1"
  ],
  ["Mishneh Torah, Beit HaBechirah 1:1", "Mishneh Torah, The Chosen Temple 1:1"],
  ["Mishneh Torah, Fundamentals of the Torah 1:1", "Mishneh Torah, Foundations of the Torah 1:1"],
  ["Pirkei Avot 3:19", "Pirkei Avot 3:15"],
  ["Pirkei Avot 2:21", "Pirkei Avot 2:16"],
  ["Nehemiah 9:38", "Nehemiah 10:1"],
  ["Shabbat 88a:11", "Shabbat 88a:5"],
  ["Deuteronomy 24:6,10-15", "Deuteronomy 24:6-15"]
]);

try {
  const repaired = [];

  for (const [alias, canonicalRef] of canonicalRefByAlias) {
    const sourceReference = await prisma.sefariaReference.findUnique({ where: { ref: alias } });
    if (!sourceReference) continue;

    const complements = await prisma.textSefariaComplement.findMany({
      where: {
        deletedAt: null,
        sefariaReferenceId: sourceReference.id,
        textUnit: { book: { slug: { in: targetBookSlugs } } }
      }
    });
    if (complements.length === 0) continue;

    const destinationReference = await prisma.sefariaReference.upsert({
      where: { ref: canonicalRef },
      create: {
        ref: canonicalRef,
        normalizedRef: canonicalRef,
        corpus: sourceReference.corpus,
        book: sourceReference.book,
        category: sourceReference.category,
        url: `https://www.sefaria.org/${encodeURIComponent(canonicalRef).replace(/%20/g, "_")}`
      },
      update: {
        normalizedRef: canonicalRef,
        deletedAt: null
      }
    });

    for (const complement of complements) {
      await prisma.$transaction(async (tx) => {
        const collision = await tx.textSefariaComplement.findFirst({
          where: {
            id: { not: complement.id },
            paragraphId: complement.paragraphId,
            sefariaReferenceId: destinationReference.id,
            classificationRunId: complement.classificationRunId,
            deletedAt: null
          }
        });
        const destinationComplementId = collision?.id ?? complement.id;

        if (collision) {
          await tx.sefariaComplementAiReview.updateMany({
            where: { textSefariaComplementId: complement.id, deletedAt: null },
            data: { deletedAt: new Date() }
          });
          await tx.textSefariaComplement.update({
            where: { id: complement.id },
            data: { deletedAt: new Date() }
          });
        } else {
          await tx.textSefariaComplement.update({
            where: { id: complement.id },
            data: { sefariaReferenceId: destinationReference.id }
          });
        }

        repaired.push({ alias, canonicalRef, complementId: destinationComplementId, merged: Boolean(collision) });
      });
    }
  }

  console.log(JSON.stringify({ repaired: repaired.length, rows: repaired }, null, 2));
} finally {
  await prisma.$disconnect();
}
