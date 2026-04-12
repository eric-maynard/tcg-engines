/**
 * Audit: identify every Riftbound card still in a broken state.
 *
 * Broken = has rulesText but:
 *   (a) no abilities parsed, OR
 *   (b) at least one ability contains a `raw` effect (parser recognized structure but failed)
 */

import type { Ability, Card } from "@tcg/riftbound-types/cards";
import { writeFileSync } from "node:fs";
import { getAllCards } from "../src/data";

interface BrokenCardInfo {
  id: string;
  name: string;
  setId: string;
  cardType: string;
  rulesText: string;
  status: "no-abilities" | "raw-effect" | "partial-raw";
  abilityCount: number;
  rawEffectCount: number;
  rawEffectTexts: string[];
  /** Sample category tags used for classification */
  tags: string[];
}

const STRIP_REMINDER = /\([^)]*\)/g;
const WS = /\s+/g;

function clean(text: string): string {
  return text.replace(STRIP_REMINDER, " ").replace(WS, " ").trim();
}

function findRawEffects(ability: Ability, out: string[]): void {
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") {return;}
    const obj = node as Record<string, unknown>;
    if (obj.type === "raw" && typeof obj.text === "string") {
      out.push(obj.text);
    }
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) {v.forEach(visit);}
      else if (v && typeof v === "object") {visit(v);}
    }
  };
  visit(ability);
}

/** Tag a card by rough pattern hints for classification. */
function tagCard(text: string): string[] {
  const t = clean(text).toLowerCase();
  const tags: string[] = [];

  // Keyword mechanics (need engine support)
  if (/\[hunt\]|hunt\s+\d/.test(t)) {tags.push("kw:hunt");}
  if (/\[level|level\s+up|lvl\s*\d/.test(t)) {tags.push("kw:level");}
  if (/\[xp\]|\bxp\b|experience/.test(t)) {tags.push("kw:xp");}
  if (/\[repeat/.test(t)) {tags.push("kw:repeat");}
  if (/\[predict|predict\s+\d/.test(t)) {tags.push("kw:predict");}
  if (/\[mighty\]|while (?:i am |you are |you're )?mighty/.test(t)) {tags.push("kw:mighty");}
  if (/\[hidden\]/.test(t)) {tags.push("kw:hidden");}
  if (/\[overpower/.test(t)) {tags.push("kw:overpower");}
  if (/\[rally/.test(t)) {tags.push("kw:rally");}
  if (/\[ambush/.test(t)) {tags.push("kw:ambush");}
  if (/\[legend/.test(t)) {tags.push("kw:legendary");}
  if (/\[echo/.test(t)) {tags.push("kw:echo");}
  if (/\[scout/.test(t)) {tags.push("kw:scout");}
  if (/\[fleeting/.test(t)) {tags.push("kw:fleeting");}

  // Multi-effect / sequencing
  if (/\bthen\b/.test(t)) {tags.push("seq:then");}
  if (/,\s*(?:and|then)\s+/.test(t)) {tags.push("seq:compound");}
  if (/\bif you do\b/.test(t)) {tags.push("seq:if-you-do");}

  // Conditional
  if (/\bif (?:you|i|a|an|the|there|that)/.test(t)) {tags.push("cond:if");}
  if (/\bwhile\b/.test(t)) {tags.push("cond:while");}
  if (/\bwhenever\b/.test(t)) {tags.push("trig:whenever");}
  if (/\bwhen\b/.test(t)) {tags.push("trig:when");}
  if (/\bat the (?:start|beginning|end)\b/.test(t)) {tags.push("trig:phase");}

  // Static / aura
  if (/units? (?:here|at this location|you control)/.test(t)) {tags.push("static:aura");}
  if (/get(?:s)? \+\d|have (?:assault|shield|tank|backline|overpower|hidden|rally)/.test(t))
    {tags.push("static:buff");}
  if (/^\s*your units\b|^\s*allies\b/.test(t)) {tags.push("static:ally-buff");}

  // Core effects
  if (/\bdraw(?:s)? \d|\bdraw a card/.test(t)) {tags.push("eff:draw");}
  if (/\bdeal(?:s)? \d+ damage/.test(t)) {tags.push("eff:damage");}
  if (/\bkill\b/.test(t)) {tags.push("eff:kill");}
  if (/\bheal|restore/.test(t)) {tags.push("eff:heal");}
  if (/\bdiscard\b/.test(t)) {tags.push("eff:discard");}
  if (/\breturn .* to .*hand/.test(t)) {tags.push("eff:return-hand");}
  if (/\bbanish/.test(t)) {tags.push("eff:banish");}
  if (/\brecycle/.test(t)) {tags.push("eff:recycle");}
  if (/\bchannel\b/.test(t)) {tags.push("eff:channel");}
  if (/\+\d+\s*might/.test(t)) {tags.push("eff:buff-might");}
  if (/\bsearch\b/.test(t)) {tags.push("eff:search");}
  if (/\breveal\b/.test(t)) {tags.push("eff:reveal");}
  if (/\bcount(?:er)?\b/.test(t)) {tags.push("eff:counter");}
  if (/\bstun\b/.test(t)) {tags.push("eff:stun");}
  if (/\breadies?\b/.test(t)) {tags.push("eff:ready");}
  if (/\bexhaust/.test(t)) {tags.push("eff:exhaust");}
  if (/\bmove\b/.test(t)) {tags.push("eff:move");}
  if (/\bscore\b/.test(t)) {tags.push("eff:score");}
  if (/\bcreate\b|summon/.test(t)) {tags.push("eff:create");}
  if (/\bcopy\b/.test(t)) {tags.push("eff:copy");}
  if (/\btransform\b/.test(t)) {tags.push("eff:transform");}
  if (/\bcost(?:s)? \d|cost(?:s)? less|cost(?:s)? more/.test(t)) {tags.push("eff:cost-mod");}
  if (/\brune\b/.test(t)) {tags.push("ref:rune");}
  if (/equip/.test(t)) {tags.push("eff:equip");}
  if (/\bgear\b/.test(t)) {tags.push("ref:gear");}
  if (/\bspell(?:s)?\b/.test(t)) {tags.push("ref:spell");}

  // Triggers referencing opponent
  if (/\b(?:an )?opponent|your opponent/.test(t)) {tags.push("ref:opponent");}
  if (/\bdies?\b|\bkilled\b|when .* dies/.test(t)) {tags.push("trig:death");}
  if (/\bdamage(?:d)? to me\b/.test(t)) {tags.push("trig:damage");}

  // Targeting
  if (/target .* (?:unit|card|spell|ally|enemy)/.test(t)) {tags.push("target:explicit");}
  if (/choose a|choose an|choose one/.test(t)) {tags.push("target:choose");}
  if (/any (?:number|target)/.test(t)) {tags.push("target:any");}

  // Replacement
  if (/instead of|would .* instead/.test(t)) {tags.push("repl:instead");}

  // Cost abilities
  if (/^\[\w+\]\s*[-—]/.test(text) || /\]\s*[—-]\s*\w/.test(text)) {tags.push("cost:activated");}
  if (/recycle me|banish me|exhaust me/i.test(text)) {tags.push("cost:self");}

  // Legendary / once-per
  if (/only once|only one|can only be played/.test(t)) {tags.push("meta:limit");}

  return tags;
}

async function main(): Promise<void> {
  const cards = getAllCards();
  const broken: BrokenCardInfo[] = [];
  const tagCounts = new Map<string, number>();
  let total = 0;
  let withText = 0;
  let working = 0;

  for (const card of cards) {
    total++;
    const rulesText = card.rulesText ?? "";
    if (!rulesText.trim()) {continue;}
    withText++;

    const abilities = (card.abilities ?? []) as Ability[];
    const rawTexts: string[] = [];
    for (const a of abilities) {findRawEffects(a, rawTexts);}

    const hasRaw = rawTexts.length > 0;
    const noAbilities = abilities.length === 0;

    // Flag-based cards: behavior is implemented via engine flags on the card
    // Definition rather than structured ability objects. These count as working
    // Even though `abilities` is empty.
    const cardAny = card as Record<string, unknown>;
    const hasEngineFlag =
      cardAny.inheritExhaustAbilities === true ||
      cardAny.copyAttachedUnitText === true ||
      cardAny.tracksExiledCards === true ||
      cardAny.moveEscalation === true ||
      cardAny.interactiveCostReduction !== undefined;

    if (!hasRaw && !noAbilities) {
      working++;
      continue;
    }

    if (noAbilities && hasEngineFlag) {
      working++;
      continue;
    }

    const status: BrokenCardInfo["status"] = noAbilities
      ? "no-abilities"
      : (abilities.length > rawTexts.length
        ? "partial-raw"
        : "raw-effect");

    const tags = tagCard(rulesText);
    for (const t of tags) {tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);}

    broken.push({
      abilityCount: abilities.length,
      cardType: card.cardType,
      id: String(card.id),
      name: card.name,
      rawEffectCount: rawTexts.length,
      rawEffectTexts: rawTexts.slice(0, 3),
      rulesText: clean(rulesText),
      setId: card.setId,
      status,
      tags,
    });
  }

  // Group by status
  const byStatus = {
    "no-abilities": broken.filter((b) => b.status === "no-abilities"),
    "partial-raw": broken.filter((b) => b.status === "partial-raw"),
    "raw-effect": broken.filter((b) => b.status === "raw-effect"),
  };

  // Group by primary tag (first tag from a priority list)
  const primaryTagOrder = [
    "kw:hunt",
    "kw:level",
    "kw:xp",
    "kw:repeat",
    "kw:predict",
    "kw:mighty",
    "kw:hidden",
    "kw:overpower",
    "kw:rally",
    "kw:ambush",
    "kw:legendary",
    "kw:echo",
    "kw:scout",
    "kw:fleeting",
    "static:aura",
    "static:buff",
    "static:ally-buff",
    "repl:instead",
    "seq:then",
    "seq:if-you-do",
    "cond:while",
    "cond:if",
    "eff:damage",
    "eff:draw",
    "eff:kill",
    "eff:heal",
    "eff:return-hand",
    "eff:banish",
    "eff:recycle",
    "eff:channel",
    "eff:buff-might",
    "eff:search",
    "eff:reveal",
    "eff:stun",
    "eff:ready",
    "eff:exhaust",
    "eff:move",
    "eff:score",
    "eff:create",
    "eff:copy",
    "eff:transform",
    "eff:cost-mod",
    "eff:equip",
    "eff:discard",
    "eff:counter",
  ];

  const primaryGroups = new Map<string, BrokenCardInfo[]>();
  for (const b of broken) {
    let primary = "other";
    for (const tag of primaryTagOrder) {
      if (b.tags.includes(tag)) {
        primary = tag;
        break;
      }
    }
    if (!primaryGroups.has(primary)) {primaryGroups.set(primary, []);}
    primaryGroups.get(primary)!.push(b);
  }

  const groupSummary = [...primaryGroups.entries()]
    .map(([tag, list]) => ({
      all: list.map((c) => `${c.id}|${c.name}`),
      count: list.length,
      samples: list.slice(0, 5).map((c) => ({
        id: c.id,
        name: c.name,
        text: c.rulesText,
        raw: c.rawEffectTexts,
      })),
      tag,
    }))
    .toSorted((a, b) => b.count - a.count);

  const tagSummary = [...tagCounts.entries()]
    .map(([tag, count]) => ({ count, tag }))
    .toSorted((a, b) => b.count - a.count);

  const report = {
    allBroken: broken,
    byStatus: {
      noAbilities: byStatus["no-abilities"].length,
      rawEffect: byStatus["raw-effect"].length,
      partialRaw: byStatus["partial-raw"].length,
    },
    generated: new Date().toISOString(),
    groups: groupSummary,
    tagFrequency: tagSummary,
    totals: {
      total,
      withText,
      working,
      broken: broken.length,
      workingRate: withText > 0 ? ((working / withText) * 100).toFixed(1) : "0",
    },
  };

  const outPath = "/tmp/remaining-audit-report.json";
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Audit complete. Report written to ${outPath}`);
  console.log(
    `Total: ${total}, withText: ${withText}, working: ${working}, broken: ${broken.length}`,
  );
  console.log(
    `  no-abilities: ${byStatus["no-abilities"].length}, raw-effect: ${byStatus["raw-effect"].length}, partial-raw: ${byStatus["partial-raw"].length}`,
  );
  console.log("\nTop 20 groups by primary tag:");
  for (const g of groupSummary.slice(0, 20)) {
    console.log(`  ${g.tag.padEnd(20)} ${String(g.count).padStart(4)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
