import { Prisma, PrismaClient } from "@prisma/client";
import {
  SACKS_PUBLICATION_AUDIT_MODEL,
  SACKS_PUBLICATION_AUDIT_PROMPT_VERSION,
  SACKS_PUBLICATION_AUDIT_PROVIDER
} from "../src/repositories/sefariaComplementReviews.js";
import { SACKS_TARGET_BOOK_SLUGS } from "../src/text/sacksProcessingEligibility.js";

const prisma = new PrismaClient();
const targetBookSlugs = Object.values(SACKS_TARGET_BOOK_SLUGS);

const repairedRefByComplementId = new Map<string, string>([
  ["cmrjzn60u0004qerkd58wb51f", "Bava Metzia 30b:14"],
  ["cmrjzoknn00akqe1kiffewycu", "Bava Metzia 30b:14"],
  ["cmrjzn6hr0046qerkf2sddg0r", "Bava Metzia 30b:14"],
  ["cmrjzo6ij005nqedszk8z5qqx", "Berakhot 61b:7"],
  ["cmrjzoko600b1qe1k3xehjidc", "Mishneh Torah, Reading the Shema 1:8"],
  ["cmrjzokna00afqe1k1gcr4clo", "Berakhot 54a:3"],
  ["cmrjzoknp00aqqe1k88qhkcb8", "Bava Metzia 83a:10"],
  ["cmrjzn6fe003kqerki2rfp5kn", "Bava Batra 8b:5-8"],
  ["cmrjzn687001tqerk4tafxtn7", "Bava Metzia 33a:7-9"],
  ["cmrjzn65j0017qerkguhqeyva", "Bava Kamma 30a:16-18"],
  ["cmrjzold000i2qe1kcx085hsk", "Yoma 22b:8-9"],
  ["cmrjzn6re0060qerkx1i9punm", "Bava Batra 8b:8"]
]);

const acceptedComplementIds = [
  "cmrjzoknn00akqe1kiffewycu",
  "cmrjzokih008cqe1kkw5m3pe6",
  "cmrjzokd80068qe1kvefinapk",
  "cmrjzokl3008zqe1kr6v1g16f",
  "cmrjzoln000kbqe1kgsdb35q4",
  "cmrjzok1i000qqe1k8lkf3bni",
  "cmrjzokiy008nqe1kan66qhzt",
  "cmrjzokmr009yqe1kd09r8teb",
  "cmrjzol0j00ftqe1kfse7osa0",
  "cmrjzokfd0079qe1kmi7tbtvj",
  "cmrjzokl40092qe1kc302jwp4",
  "cmrjzoklk009dqe1ka59g2x9x",
  "cmrjzoko600b1qe1k3xehjidc",
  "cmrjzoln200keqe1kpmtoacen",
  "cmrjzokms00a1qe1kcjd16bfq",
  "cmrjzok8k003zqe1k9uxgdaor",
  "cmrjzokbe005aqe1kcxfyfs7v",
  "cmrjzokj0008qqe1k3yv3z5x9",
  "cmrjzokna00afqe1k1gcr4clo",
  "cmrjzokzo00flqe1ky044riz2",
  "cmrjzoldt00i7qe1ke8kaxyum",
  "cmrjzokq100c9qe1kzpivb27z",
  "cmrjzok1z0011qe1kptuaedf2",
  "cmrjzok4i002dqe1kepd10xxa",
  "cmrjzok7d003hqe1ku3cksf6a",
  "cmrjzokda006bqe1kk4ucfgz1",
  "cmrjzokqw00cpqe1kolmezsi2",
  "cmrjzolzi00m4qe1kjq6f4ps8",
  "cmrjzoknp00aqqe1k88qhkcb8",
  "cmrjzok7e003kqe1khy6a8bt2",
  "cmrjzok8m0042qe1kzss3td8c",
  "cmrjzokmt00a4qe1k64mjvppd",
  "cmrjzokqh00chqe1kukkpzhvs",
  "cmrjzok200014qe1k7c2pr9qm",
  "cmrjzok7f003nqe1kufwj4vbz",
  "cmrjzo68a000vqedsf1s7jvvm",
  "cmrjzo6br0023qedst7oipqd0",
  "cmrjzo6ij005nqedszk8z5qqx",
  "cmrjzn60u0004qerkd58wb51f",
  "cmrjzn6hn0043qerk8b8s1xe5",
  "cmrjzn6sh006bqerk03vdflvk",
  "cmrjzn6fe003kqerki2rfp5kn",
  "cmrjzn6hr0046qerkf2sddg0r",
  "cmrjzn6qf005pqerksu4w9n28",
  "cmrjzn687001tqerk4tafxtn7",
  "cmrjzn65j0017qerkguhqeyva",
  "cmrjzn61a000aqerkk9ec9lyq",
  "cmrjzn6re0060qerkx1i9punm",
] as const;

const rejectionReasonByComplementId = new Map<string, string>([
  [
    "cmrjzoksb00dpqe1kfgutzyo9",
    "Genesis 2:4 merely opens the creation narrative; the proposed claim about the dual divine names depends on later interpretation not present in this verse."
  ],
  [
    "cmrjzn66v001iqerk0niq852i",
    "Micah 4:5 distinguishes Israel's worship from that of other peoples, but does not itself establish the paragraph's account of particularism within a shared moral order."
  ],
  [
    "cmrjzn6d0002yqerkionw2qfs",
    "Pirkei Avot 1:2 offers a broad maxim about the world's supports and does not directly ground the paragraph's account of social service or civic foundations."
  ],
  [
    "cmrjzn6fi003nqerk5fhxwbte",
    "Pirkei Avot 1:2 is too general to substantiate this paragraph's specific claim about local public welfare and civic responsibility."
  ],
  [
    "cmrjzokax004zqe1k0qe4m5jx",
    "Deuteronomy 20:1-4 addresses reassurance before battle, not the paragraph's proposed account of religion and collective defense."
  ],
  [
    "cmrjzold000i2qe1kcx085hsk",
    "Yoma 22b:8-9 is a complex aggadah about Saul's misplaced mercy and later cruelty; it is too indirect and potentially misleading for the target paragraph."
  ],
  [
    "cmrjzokub00e7qe1ks8t56czd",
    "Mishnah Sanhedrin 4:5 is a general source on human dignity, but this use adds no specific textual support beyond nearby repeated applications of the same maxim."
  ],
  [
    "cmrjzokv100eiqe1k39rnin4k",
    "Mishnah Sanhedrin 4:5 is a general source on human dignity, but this use repeats an interchangeable conceptual anchor rather than illuminating the paragraph's distinct claim."
  ]
]);

type ComplementWithContext = Prisma.TextSefariaComplementGetPayload<{
  include: { sefariaReference: true; textUnit: { include: { book: true } } };
}>;

try {
  const decisionByComplementId = new Map<string, "accept" | "reject">();
  for (const id of acceptedComplementIds) decisionByComplementId.set(id, "accept");
  for (const id of rejectionReasonByComplementId.keys()) {
    if (decisionByComplementId.has(id)) throw new Error(`Conflicting manual decision for ${id}`);
    decisionByComplementId.set(id, "reject");
  }
  if (decisionByComplementId.size !== 56) {
    throw new Error(`Expected 56 active manual decisions, found ${decisionByComplementId.size}`);
  }

  const originalRows = await prisma.textSefariaComplement.findMany({
    where: {
      id: { in: [...decisionByComplementId.keys()] },
      deletedAt: null,
      textUnit: { book: { slug: { in: targetBookSlugs } } }
    },
    include: { sefariaReference: true, textUnit: { include: { book: true } } }
  });
  const originalRowById = new Map(originalRows.map((row) => [row.id, row]));
  const missingIds = [...decisionByComplementId.keys()].filter((id) => !originalRowById.has(id));
  if (missingIds.length > 0) throw new Error(`Missing active adjudication rows: ${missingIds.join(", ")}`);

  const survivorIdByOriginalId = new Map<string, string>();
  const repairs = [];
  for (const [complementId, canonicalRef] of repairedRefByComplementId) {
    const row = originalRowById.get(complementId);
    if (!row) throw new Error(`Missing repair row: ${complementId}`);
    const oldRef = row.sefariaReference.ref;
    if (oldRef === canonicalRef) {
      survivorIdByOriginalId.set(complementId, complementId);
      continue;
    }

    const destinationReference = await prisma.sefariaReference.upsert({
      where: { ref: canonicalRef },
      create: {
        ref: canonicalRef,
        normalizedRef: canonicalRef,
        corpus: row.sefariaReference.corpus,
        book: row.sefariaReference.book,
        category: row.sefariaReference.category,
        url: `https://www.sefaria.org/${canonicalRef.replaceAll(" ", "_").replaceAll(":", ".")}`
      },
      update: { normalizedRef: canonicalRef, deletedAt: null }
    });
    const collision = await prisma.textSefariaComplement.findFirst({
      where: {
        id: { not: complementId },
        paragraphId: row.paragraphId,
        sefariaReferenceId: destinationReference.id,
        deletedAt: null
      }
    });

    if (collision) {
      const deletedAt = new Date();
      await prisma.$transaction([
        prisma.sefariaComplementAiReview.updateMany({
          where: { textSefariaComplementId: complementId, deletedAt: null },
          data: { deletedAt }
        }),
        prisma.textSefariaComplement.update({ where: { id: complementId }, data: { deletedAt } })
      ]);
      survivorIdByOriginalId.set(complementId, collision.id);
    } else {
      await prisma.textSefariaComplement.update({
        where: { id: complementId },
        data: { sefariaReferenceId: destinationReference.id }
      });
      survivorIdByOriginalId.set(complementId, complementId);
    }
    repairs.push({ complementId, survivorId: survivorIdByOriginalId.get(complementId), oldRef, canonicalRef });
  }

  const adjudicated = [];
  for (const [originalId, verdict] of decisionByComplementId) {
    const complementId = survivorIdByOriginalId.get(originalId) ?? originalId;
    const row = (await prisma.textSefariaComplement.findUnique({
      where: { id: complementId },
      include: { sefariaReference: true, textUnit: { include: { book: true } } }
    })) as ComplementWithContext | null;
    if (!row || row.deletedAt) throw new Error(`Missing active adjudication survivor: ${complementId}`);

    const repairedRef = repairedRefByComplementId.get(originalId);
    const rationale =
      verdict === "reject"
        ? rejectionReasonByComplementId.get(originalId)!
        : repairedRef
          ? `Manual Sefaria text review corrected the exact reference to ${repairedRef}; that text directly supplies the principle used in the target paragraph.`
          : "Manual Sefaria text review confirmed a defensible textual or conceptual entry point to a central claim in the target paragraph.";
    const result = {
      verdict,
      score: verdict === "accept" ? 3 : 1,
      issueTags:
        verdict === "accept"
          ? ["good_conceptual_match", "good_teaching_entry"]
          : ["weak_thematic_echo"],
      rationale,
      suggestedAction: verdict === "accept" ? "keep" : "hide",
      suggestedRef: repairedRef ?? null
    };
    const prompt = {
      version: SACKS_PUBLICATION_AUDIT_PROMPT_VERSION,
      task: "Publication adjudication after manual inspection of the exact Sefaria source text.",
      method: "Sefaria MCP/API text inspection; no external LLM call.",
      candidate: {
        bookTitle: row.textUnit.book.title,
        paragraphRef: row.textUnit.ref,
        paragraphText: row.textUnit.text,
        sefariaRef: row.sefariaReference.ref,
        topic: row.topic,
        originalRationale: row.rationale,
        originalConfidence: row.confidence
      },
      decision: result
    } satisfies Prisma.InputJsonObject;
    const request = {
      provider: SACKS_PUBLICATION_AUDIT_PROVIDER,
      reviewer: "Codex",
      method: "manual-sefaria-mcp-api-audit",
      noExternalLlmCall: true
    } satisfies Prisma.InputJsonObject;
    const responseText = JSON.stringify(result);
    const existing = await prisma.sefariaComplementAiReview.findFirst({
      where: {
        textSefariaComplementId: complementId,
        provider: SACKS_PUBLICATION_AUDIT_PROVIDER,
        model: SACKS_PUBLICATION_AUDIT_MODEL,
        promptVersion: SACKS_PUBLICATION_AUDIT_PROMPT_VERSION,
        deletedAt: null
      }
    });
    const data = {
      prompt,
      request,
      response: result,
      responseText,
      status: "completed",
      error: null,
      verdict,
      score: result.score,
      issueTags: result.issueTags,
      rationale,
      suggestedAction: result.suggestedAction,
      suggestedRef: result.suggestedRef,
      completedAt: new Date(),
      deletedAt: null
    } satisfies Prisma.SefariaComplementAiReviewUpdateInput;

    if (existing) {
      await prisma.sefariaComplementAiReview.update({ where: { id: existing.id }, data });
    } else {
      await prisma.sefariaComplementAiReview.create({
        data: {
          textSefariaComplementId: complementId,
          provider: SACKS_PUBLICATION_AUDIT_PROVIDER,
          model: SACKS_PUBLICATION_AUDIT_MODEL,
          promptVersion: SACKS_PUBLICATION_AUDIT_PROMPT_VERSION,
          ...data
        }
      });
    }
    adjudicated.push({ originalId, complementId, ref: row.sefariaReference.ref, verdict });
  }

  console.log(
    JSON.stringify(
      {
        repaired: repairs.length,
        accepted: adjudicated.filter((row) => row.verdict === "accept").length,
        rejected: adjudicated.filter((row) => row.verdict === "reject").length,
        repairs,
        adjudicated
      },
      null,
      2
    )
  );
} finally {
  await prisma.$disconnect();
}
