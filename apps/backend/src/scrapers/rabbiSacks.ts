import * as cheerio from "cheerio";

export type RabbiSacksScrapeResult = {
  sourceUrl: string;
  title: string;
  body: string;
  excerpt?: string;
  publishedAt?: Date;
};

export async function scrapeRabbiSacksArticle(sourceUrl: string): Promise<RabbiSacksScrapeResult> {
  const url = new URL(sourceUrl);

  if (!url.hostname.endsWith("rabbisacks.org")) {
    throw new Error("Only rabbisacks.org URLs are supported");
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Rabbi Sacks request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const title =
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").text().trim();
  const excerpt = $("meta[property='og:description']").attr("content")?.trim();
  const publishedAtValue =
    $("meta[property='article:published_time']").attr("content") ||
    $("time[datetime]").first().attr("datetime");
  const body = [
    "article",
    "main",
    "#rs-main",
    ".rs-main",
    "[class*='post']",
    "[class*='content']"
  ].reduce((bestBody, selector) => {
    const candidate = $(selector)
      .find("p")
      .map((_, element) => $(element).text().trim())
      .get()
      .filter((paragraph) => paragraph.length > 20 && paragraph !== "Read More >")
      .join("\n\n");

    return candidate.length > bestBody.length ? candidate : bestBody;
  }, "");

  if (!title || !body) {
    throw new Error("Unable to extract article title and body");
  }

  return {
    sourceUrl: url.toString(),
    title,
    body,
    excerpt,
    publishedAt: publishedAtValue ? new Date(publishedAtValue) : undefined
  };
}
