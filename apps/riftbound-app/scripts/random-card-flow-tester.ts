#!/usr/bin/env bun
/**
 * Random Card Flow Tester
 *
 * Picks N random spell/gear cards from the registered card pool, seeds an
 * SPA session with each one in player-1's hand + sufficient energy, drives a
 * click-flow against the SPA (load page → click hand chip → wait for picker)
 * and records what happened: which picker appeared, did the text look right
 * for the card's effect type, any visible errors.
 *
 * Outputs:
 *   - /tmp/card-flow-report.json  — full structured results
 *   - /tmp/card-flow-report.md    — human-readable summary table
 *   - /tmp/card-flow/<cardId>.jpg — per-card "after click" screenshot
 *
 * Usage:
 *   bun run apps/riftbound-app/scripts/random-card-flow-tester.ts
 *   bun run apps/riftbound-app/scripts/random-card-flow-tester.ts --seed 7 --n 12
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

import { getAllCards } from "@tcg/riftbound-cards";

interface CliArgs {
  seed: number;
  n: number;
  origin: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    n: 8,
    origin: process.env.CARD_FLOW_ORIGIN ?? "http://localhost:3000",
    seed: 42,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed") {out.seed = Number(argv[++i]);}
    else if (a === "--n") {out.n = Number(argv[++i]);}
    else if (a === "--origin") {out.origin = argv[++i];}
  }
  return out;
}

const ARGS = parseArgs(process.argv.slice(2));
const ORIGIN = ARGS.origin;
const VIEWPORT = { height: 1400, width: 1400 } as const;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENSHOT_DIR = "/tmp/card-flow";
const REPORT_JSON = "/tmp/card-flow-report.json";
const REPORT_MD = "/tmp/card-flow-report.md";

mkdirSync(SCREENSHOT_DIR, { recursive: true });

/* --- deterministic shuffle --------------------------------------------- */

// Mulberry32 — small, deterministic PRNG. Good enough for sampling.
function makeRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* --- card selection ---------------------------------------------------- */

interface SelectedCard {
  id: string;
  name: string;
  cardType: string;
  firstAbilityType?: string;
  targetType?: string;
  rulesText?: string;
  /** All abilities — used to determine if card is auto-resolve/triggered/reaction. */
  allAbilities?: readonly {
    type?: string;
    timing?: string;
    trigger?: unknown;
    effect?: { target?: { type?: string } };
  }[];
}

interface AbilityShape {
  effect?: { target?: { type?: string } };
  type?: string;
  timing?: string;
  trigger?: unknown;
}

/**
 * The "ability that drives the play-from-hand UI" — i.e. the one that
 * matters for picker behaviour. Looks for the first `spell`/`activated`
 * ability with action timing (or no timing, treated as action by default).
 * Reaction-timed and triggered abilities are NOT cast directly from hand
 * so they're not the source of picker-target expectations.
 */
function findPlayableAbility(
  abilities: ReadonlyArray<AbilityShape> | undefined,
): AbilityShape | undefined {
  if (!abilities) {return undefined;}
  return abilities.find((a) => {
    if (a.type === "spell") {
      return a.timing == null || a.timing === "action";
    }
    if (a.type === "activated") {
      return a.timing == null || a.timing === "action";
    }
    return false;
  });
}

function pickCards(seed: number, n: number): SelectedCard[] {
  const all = getAllCards();
  const eligible = all.filter(
    (c) => c.cardType === "spell" || c.cardType === "gear",
  );
  const rng = makeRng(seed);
  const shuffled = shuffleInPlace([...eligible], rng);
  return shuffled.slice(0, n).map((c) => {
    const {abilities} = (c as { abilities?: ReadonlyArray<AbilityShape> });
    // Prefer the "playable from hand" ability for classification; fall back
    // To the first ability (so we still surface keyword/triggered types in
    // The report when there's no playable ability).
    const playable = findPlayableAbility(abilities);
    const reporting = playable ?? abilities?.[0];
    const targetType = reporting?.effect?.target?.type;
    return {
      allAbilities: abilities,
      cardType: c.cardType,
      firstAbilityType: reporting?.type,
      id: c.id,
      name: c.name,
      rulesText: (c as { rulesText?: string }).rulesText,
      targetType,
    };
  });
}

/* --- flow per card ----------------------------------------------------- */

interface FlowResult {
  cardId: string;
  cardName: string;
  cardType: string;
  firstAbilityType?: string;
  targetType?: string;
  seeded: boolean;
  instanceId?: string;
  pickerKind:
    | "target-picker"
    | "battlefield-picker"
    | "none"
    | "seed-failed"
    | "chip-not-found";
  pickerText?: string;
  pickerHint?: string;
  classification: "OK" | "MISMATCH" | "NO_PICKER" | "ERROR";
  notes: string[];
  consoleErrors: string[];
  screenshotPath: string;
}

async function seedCard(
  sessionId: string,
  cardId: string,
): Promise<{
  ok: boolean;
  seed?: { seeded?: boolean; instanceId?: string; cardName?: string };
  error?: string;
}> {
  const url = `${ORIGIN}/api/v2/scenario/cast-card/${encodeURIComponent(sessionId)}`;
  const r = await fetch(url, {
    body: JSON.stringify({ cardId, casterId: "player-1", energy: 10 }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!r.ok) {
    return { error: `HTTP ${r.status}`, ok: false };
  }
  const body = (await r.json()) as {
    ok?: boolean;
    seed?: { seeded?: boolean; instanceId?: string; cardName?: string };
  };
  return { ok: Boolean(body.ok), seed: body.seed };
}

function classify(
  card: SelectedCard,
  pickerKind: FlowResult["pickerKind"],
  pickerText?: string,
): { classification: FlowResult["classification"]; notes: string[] } {
  const notes: string[] = [];
  if (pickerKind === "seed-failed") {
    return { classification: "ERROR", notes: ["seed endpoint reported seeded=false"] };
  }
  if (pickerKind === "chip-not-found") {
    return {
      classification: "ERROR",
      notes: ["hand chip selector for seeded card never appeared in the DOM"],
    };
  }
  // Iter-P: cards whose only abilities are triggered / reaction-timed are
  // Not cast-from-hand-with-explicit-target. They auto-resolve via play
  // (triggered fires on game events; reaction-timed spells activate only
  // During opponent's turn). Either picker behaviour (open or none) is
  // Acceptable for these — what matters is that the SPA doesn't crash.
  const abilities = card.allAbilities ?? [];
  const hasActionAbility = abilities.some((a) => {
    if (a.type === "spell" || a.type === "activated") {
      return a.timing == null || a.timing === "action";
    }
    return false;
  });
  if (!hasActionAbility && abilities.length > 0) {
    // No play-from-hand-with-target ability — auto-resolve is correct.
    return {
      classification: "OK",
      notes: [
        "card has no action-timed spell/activated ability; triggered or reaction-only — picker presence does not matter",
      ],
    };
  }
  // The card targets a specific kind of game object?
  const tt = card.targetType;
  const needsExplicitTarget =
    Boolean(tt) && tt !== "self" && tt !== "trigger-source" && tt !== "pending-value";

  if (pickerKind === "none") {
    if (!needsExplicitTarget) {
      // No explicit target needed — auto-resolve is the right behaviour.
      notes.push(
        `card has no explicit-target effect (target.type=${tt ?? "n/a"}); auto-resolve via direct play is expected`,
      );
      return { classification: "OK", notes };
    }
    notes.push(
      `card declares target.type="${tt}" but no picker appeared — likely a UI gap (TargetPicker not opened)`,
    );
    return { classification: "NO_PICKER", notes };
  }

  // We have a picker. Check the text matches the target type.
  const text = (pickerText ?? "").toLowerCase();
  if (pickerKind === "target-picker") {
    if (tt === "unit") {
      // Unit targets — picker should mention "unit" or have unit options
      if (
        text.includes("unit") ||
        text.includes("battlefield") ||
        text.includes("friendly") ||
        text.includes("enemy")
      ) {
        return { classification: "OK", notes: ["target picker text matches unit-target expectation"] };
      }
      // Iter-R: card declares target.type="unit" but with a `location` qualifier
      // (e.g. `location: "trash"` for return-to-hand effects like Morbid Return).
      // The SPA correctly opens the card-in-trash picker variant. Recognise
      // This by looking for "trash" in the picker text.
      if (text.includes("trash")) {
        const trashTargetedAbility = (card.allAbilities ?? []).find((a) => {
          const t = (a.effect as { target?: unknown } | undefined)?.target;
          if (!t || typeof t !== "object") {return false;}
          const obj = t as { type?: string; location?: string };
          return obj.type === "unit" && obj.location === "trash";
        });
        if (trashTargetedAbility) {
          return {
            classification: "OK",
            notes: [
              `target.type="unit" with location="trash"; SPA correctly opened card-in-trash picker variant`,
            ],
          };
        }
      }
      notes.push(
        `target.type="unit" but picker text "${pickerText}" doesn't mention units/battlefield`,
      );
      return { classification: "MISMATCH", notes };
    }
    if (tt === "player") {
      // Player targets — picker should mention "player" or "opponent"
      if (text.includes("player") || text.includes("opponent")) {
        return { classification: "OK", notes };
      }
      notes.push(
        `target.type="player" but TargetPicker opened a UNIT picker (text mentions units, not players) — wrong picker UI for player-target spells`,
      );
      return { classification: "MISMATCH", notes };
    }
    if (tt === "card") {
      if (text.includes("card")) {
        return { classification: "OK", notes };
      }
      notes.push(
        `target.type="card" but TargetPicker shows unit options — no dedicated card-from-zone picker UI`,
      );
      return { classification: "MISMATCH", notes };
    }
    if (tt === "rune") {
      if (text.includes("rune")) {return { classification: "OK", notes };}
      notes.push(
        `target.type="rune" but TargetPicker shows unit options — no dedicated rune picker UI`,
      );
      return { classification: "MISMATCH", notes };
    }
    if (!tt) {
      // Iter-Q: the "playable" ability (action-timed) may be self-targeted
      // (e.g. Combat Experience's [Level 6] level-up branch with target:"self"),
      // BUT the same card may have a separate reaction/spell ability with a
      // Non-self target descriptor that the SPA-side `spellRequiresExplicitTarget`
      // Legitimately picks up. Walk all spell/activated abilities for any
      // Non-self object target before flagging as MISMATCH.
      const altTarget = (card.allAbilities ?? []).find((a) => {
        if (a.type !== "spell" && a.type !== "activated") {return false;}
        const t = (a.effect as { target?: unknown } | undefined)?.target;
        if (!t) {return false;}
        if (typeof t === "string") {return false;}
        const obj = t as { type?: string };
        return typeof obj.type === "string" && obj.type !== "self";
      });
      if (altTarget) {
        const altType = ((altTarget.effect as { target?: { type?: string } } | undefined)?.target?.type) ?? "?";
        notes.push(
          `playable ability self-targeted but card has a separate ${altTarget.type} ability with target.type="${altType}"; picker correctly opened for that branch`,
        );
        return { classification: "OK", notes };
      }
      notes.push("card has no target descriptor but picker opened anyway");
      return { classification: "MISMATCH", notes };
    }
    notes.push(`target.type="${tt}" — unrecognised, picker text "${pickerText}"`);
    return { classification: "OK", notes };
  }
  if (pickerKind === "battlefield-picker") {
    if (card.cardType === "gear") {
      notes.push("gear opened battlefield/location picker — expected for placement");
      return { classification: "OK", notes };
    }
    notes.push("spell opened battlefield picker instead of TargetPicker");
    return { classification: "MISMATCH", notes };
  }
  return { classification: "OK", notes };
}

async function driveCard(
  browser: import("puppeteer-core").Browser,
  card: SelectedCard,
  idx: number,
): Promise<FlowResult> {
  const sessionId = `card-flow-${Date.now()}-${idx}-${card.id}`;
  const consoleErrors: string[] = [];
  const screenshotPath = resolve(SCREENSHOT_DIR, `${card.id}.jpg`);

  // 1. Seed.
  let seedResp: Awaited<ReturnType<typeof seedCard>>;
  try {
    seedResp = await seedCard(sessionId, card.id);
  } catch (error) {
    consoleErrors.push(`seed fetch failed: ${(error as Error).message}`);
    seedResp = { ok: false };
  }
  const seeded = Boolean(seedResp.seed?.seeded);
  const instanceId = seedResp.seed?.instanceId;

  if (!seeded || !instanceId) {
    const { classification, notes } = classify(card, "seed-failed");
    return {
      cardId: card.id,
      cardName: card.name,
      cardType: card.cardType,
      classification,
      consoleErrors,
      firstAbilityType: card.firstAbilityType,
      notes,
      pickerKind: "seed-failed",
      screenshotPath,
      seeded: false,
      targetType: card.targetType,
    };
  }

  // 2. Drive the SPA.
  const page = await browser.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") {consoleErrors.push(`console.error: ${m.text()}`);}
  });

  let pickerKind: FlowResult["pickerKind"] = "none";
  let pickerText: string | undefined;
  let pickerHint: string | undefined;
  try {
    const url = `${ORIGIN}/play/?session=${encodeURIComponent(sessionId)}&realDecks=true`;
    await page.goto(url, { timeout: 20_000, waitUntil: "networkidle2" });
    // Wait for the play page to settle.
    await page
      .waitForSelector("[data-testid=\"play-page\"]", { timeout: 8000 })
      .catch((error) => consoleErrors.push(`play-page wait failed: ${(error as Error).message}`));
    // Give cards a beat to render.
    await new Promise((r) => setTimeout(r, 800));

    const chipSelector = `[data-testid="hand-chip-${instanceId}"]`;
    const chipHandle = await page.$(chipSelector);
    if (!chipHandle) {
      pickerKind = "chip-not-found";
    } else {
      await chipHandle.click();
      // Wait briefly for a picker. Race the two known picker testids.
      const pickerHandle = await Promise.race([
        page
          .waitForSelector("[data-testid=\"target-picker\"]", { timeout: 2000 })
          .then((h) => (h ? { handle: h, kind: "target-picker" as const } : null))
          .catch(() => null),
        page
          .waitForSelector("[data-testid=\"battlefield-picker\"]", { timeout: 2000 })
          .then((h) => (h ? { handle: h, kind: "battlefield-picker" as const } : null))
          .catch(() => null),
      ]);
      if (pickerHandle) {
        pickerKind = pickerHandle.kind;
        const sel =
          pickerHandle.kind === "target-picker"
            ? "[data-testid=\"target-picker\"]"
            : "[data-testid=\"battlefield-picker\"]";
        try {
          pickerText = (await page.$eval(sel, (el) => el.textContent ?? "")) ?? undefined;
        } catch {
          pickerText = undefined;
        }
        if (pickerHandle.kind === "target-picker") {
          try {
            pickerHint = await page.$eval(
              "[data-testid=\"target-picker-hint\"]",
              (el) => el.textContent ?? "",
            );
          } catch {
            pickerHint = undefined;
          }
        }
      } else {
        pickerKind = "none";
      }
    }

    await page.screenshot({
      fullPage: true,
      path: screenshotPath,
      quality: 80,
      type: "jpeg",
    });

    // If we opened a target picker, dismiss it via Cancel so it doesn't
    // Leak into the next iteration's screenshot. (Pages are per-card, so
    // Strictly defensive — but also lets us record that Cancel worked.)
    if (pickerKind === "target-picker") {
      try {
        await page.click("[data-testid=\"target-cancel\"]");
      } catch {
        /* Best-effort */
      }
    } else if (pickerKind === "battlefield-picker") {
      try {
        await page.click("[data-testid=\"battlefield-picker-cancel\"]");
      } catch {
        /* Best-effort */
      }
    }
  } catch (error) {
    consoleErrors.push(`drive error: ${(error as Error).message}`);
  } finally {
    await page.close().catch(() => {});
  }

  const { classification, notes } = classify(card, pickerKind, pickerText);
  if (consoleErrors.length > 0 && classification !== "ERROR") {
    notes.push(`${consoleErrors.length} console/page error(s) captured`);
  }
  return {
    cardId: card.id,
    cardName: card.name,
    cardType: card.cardType,
    classification,
    consoleErrors,
    firstAbilityType: card.firstAbilityType,
    instanceId,
    notes,
    pickerHint: pickerHint?.trim() || undefined,
    pickerKind,
    pickerText: pickerText?.replace(/\s+/g, " ").trim() || undefined,
    screenshotPath,
    seeded: true,
    targetType: card.targetType,
  };
}

/* --- report rendering --------------------------------------------------- */

function renderMarkdown(
  args: CliArgs,
  results: readonly FlowResult[],
): string {
  const summary = {
    ERROR: 0,
    MISMATCH: 0,
    NO_PICKER: 0,
    OK: 0,
  };
  for (const r of results) {summary[r.classification]++;}
  const lines: string[] = [];
  lines.push(`# Random Card Flow Report`);
  lines.push("");
  lines.push(
    `**Seed:** ${args.seed} · **N:** ${args.n} · **Origin:** ${args.origin} · **Generated:** ${new Date().toISOString()}`,
  );
  lines.push("");
  lines.push(
    `## Summary: ${results.length} cards tested; ${summary.OK} OK, ${summary.MISMATCH} MISMATCH, ${summary.NO_PICKER} NO_PICKER, ${summary.ERROR} ERROR`,
  );
  lines.push("");
  lines.push("| # | Card ID | Name | Type | Ability | Target | Picker | Class | Notes |");
  lines.push("|---|---------|------|------|---------|--------|--------|-------|-------|");
  results.forEach((r, i) => {
    const notes = r.notes.join("; ").replace(/\|/g, String.raw`\|`);
    lines.push(
      `| ${i + 1} | \`${r.cardId}\` | ${r.cardName} | ${r.cardType} | ${r.firstAbilityType ?? "—"} | ${r.targetType ?? "—"} | ${r.pickerKind} | **${r.classification}** | ${notes} |`,
    );
  });
  lines.push("");
  lines.push("## Detail");
  lines.push("");
  for (const r of results) {
    lines.push(`### ${r.cardName} (\`${r.cardId}\`)`);
    lines.push("");
    lines.push(`- **Type:** ${r.cardType}`);
    lines.push(`- **First ability:** ${r.firstAbilityType ?? "—"}`);
    lines.push(`- **Target descriptor type:** ${r.targetType ?? "—"}`);
    lines.push(`- **Picker observed:** ${r.pickerKind}`);
    lines.push(`- **Classification:** ${r.classification}`);
    if (r.pickerText) {lines.push(`- **Picker text:** ${r.pickerText}`);}
    if (r.pickerHint) {lines.push(`- **Picker hint:** ${r.pickerHint}`);}
    if (r.notes.length > 0) {lines.push(`- **Notes:** ${r.notes.join("; ")}`);}
    if (r.consoleErrors.length > 0)
      {lines.push(`- **Console errors:** \n\n\`\`\`\n${r.consoleErrors.join("\n")}\n\`\`\``);}
    lines.push(`- **Screenshot:** \`${r.screenshotPath}\``);
    lines.push("");
  }
  return lines.join("\n");
}

/* --- main --------------------------------------------------------------- */

const cards = pickCards(ARGS.seed, ARGS.n);
console.log(`[card-flow] picked ${cards.length} cards with seed=${ARGS.seed}`);
for (const c of cards) {
  console.log(
    `  - ${c.id.padEnd(16)} ${c.cardType.padEnd(6)} ${(c.firstAbilityType ?? "—").padEnd(10)} target=${c.targetType ?? "—"}  ${c.name}`,
  );
}

const browser = await puppeteer.launch({
  defaultViewport: VIEWPORT,
  executablePath: CHROME_PATH,
  headless: true,
});

const results: FlowResult[] = [];
try {
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    console.log(`[card-flow] ${i + 1}/${cards.length} ${card.id} ${card.name}`);
    const r = await driveCard(browser, card, i);
    console.log(`  → ${r.classification} · picker=${r.pickerKind}`);
    results.push(r);
  }
} finally {
  await browser.close();
}

writeFileSync(REPORT_JSON, JSON.stringify({ args: ARGS, results }, null, 2));
writeFileSync(REPORT_MD, renderMarkdown(ARGS, results));

const summary = { ERROR: 0, MISMATCH: 0, NO_PICKER: 0, OK: 0 };
for (const r of results) {summary[r.classification]++;}
console.log("");
console.log(
  `[card-flow] ${results.length} cards tested; ${summary.OK} OK, ${summary.MISMATCH} MISMATCH, ${summary.NO_PICKER} NO_PICKER, ${summary.ERROR} ERROR`,
);
console.log(`[card-flow] wrote ${REPORT_JSON}`);
console.log(`[card-flow] wrote ${REPORT_MD}`);
