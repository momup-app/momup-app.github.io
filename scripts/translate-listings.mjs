// Translates every listing into all site languages (en, de, uk, ru) with Claude, so a mom who only reads
// Russian or Ukrainian sees berlin.de and Instagram events in her language too.
// Run after the imports by .github/workflows/berlin-events.yml and instagram-sync.yml.
// Needs the ANTHROPIC_API_KEY secret; without it, the listings stay as they are and the site still works.

import { readFile, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { INSTRUCTIONS, missingTexts, applyTranslations, mergeResults, pruneCache, chunks } from "./translate-lib.mjs";

const FILES = ["activities.json", "events.json", "berlin-events.json"].map((f) => new URL("../data/" + f, import.meta.url));
const CACHE_FILE = new URL("../data/translations-cache.json", import.meta.url);
const MODEL = "claude-opus-5-5";
const BATCH = 30;      // texts per request
const MAX_TEXTS = 600; // per run, so a bad day can't run up the bill; the rest come next run

const Answer = z.object({
  items: z.array(z.object({ key: z.string(), en: z.string(), de: z.string(), uk: z.string(), ru: z.string() })),
});

async function readJson(url, fallback) {
  try { return JSON.parse(await readFile(url, "utf8")); } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}

// Each data file keeps its own indentation, so a run doesn't reformat the whole file.
async function indentOf(url) {
  const m = (await readFile(url, "utf8")).match(/\n( +)"/);
  return m ? m[1].length / 2 : 1;
}

async function translate(client, batch) {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: zodOutputFormat(Answer) },
    system: INSTRUCTIONS,
    messages: [{ role: "user", content: JSON.stringify(batch.map(({ key, field, text }) => ({ key, field, text }))) }],
  });
  if (response.stop_reason !== "end_turn" || !response.parsed_output) {
    throw new Error(`Unexpected answer (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output.items;
}

async function main() {
  const lists = await Promise.all(FILES.map((f) => readJson(f, [])));
  const all = lists.flat();
  let cache = await readJson(CACHE_FILE, {});

  const todo = missingTexts(all, cache).slice(0, MAX_TEXTS);
  if (todo.length && !process.env.ANTHROPIC_API_KEY) {
    console.log(`::warning::${todo.length} texts need translating, but the ANTHROPIC_API_KEY secret isn't set. Skipping.`);
  } else if (todo.length) {
    const client = new Anthropic();
    let failed = 0;
    for (const batch of chunks(todo, BATCH)) {
      try {
        cache = mergeResults(cache, batch, await translate(client, batch));
      } catch (e) {
        failed += batch.length; // asked again next run
        console.log(`::warning::Translation batch failed: ${e.message}`);
      }
    }
    console.log(`Translated ${todo.length - failed} texts${failed ? `, ${failed} left for next run` : ""}.`);
  } else {
    console.log("Every listing is already translated.");
  }

  cache = pruneCache(cache, all);
  await Promise.all(FILES.map(async (file, i) => {
    const before = JSON.stringify(lists[i]);
    const after = applyTranslations(lists[i], cache);
    if (JSON.stringify(after) !== before) await writeFile(file, JSON.stringify(after, null, await indentOf(file)) + "\n");
  }));
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
