import { env } from "../env.js";

export type SefariaTextResponse = {
  ref: string;
  heRef?: string;
  text?: string | string[];
  he?: string | string[];
  versions?: Array<{
    title?: string;
    versionTitle?: string;
    language?: string;
  }>;
};

export async function getSefariaText(ref: string): Promise<SefariaTextResponse> {
  const url = new URL(`${env.SEFARIA_API_BASE_URL}/texts/${encodeURIComponent(ref)}`);
  url.searchParams.set("context", "0");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Sefaria request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<SefariaTextResponse>;
}
