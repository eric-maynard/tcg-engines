/**
 * Card pool loading: allCards, registry, CDN image URL map, legend patching,
 * set JSON loading, and the engine lookup payload builder.
 */

import { getAllCards, getCardRegistry } from "@tcg/riftbound-cards";
import { getGlobalCardRegistry } from "@tcg/riftbound";
import * as fs from "node:fs";
import * as path from "node:path";
import { SETS_DIR } from "./config";

// Legend name → champion tag mapping (LoL title → champion name)
export const LEGEND_TAG_MAP: Record<string, string> = {
  "Bashful Bloom": "Lillia",
  "Battle Mistress": "Illaoi",
  "Blade Dancer": "Irelia",
  "Blind Monk": "Lee Sin",
  "Bloodharbor Ripper": "Pyke",
  "Bounty Hunter": "Vayne",
  "Chem-Baroness": "Renata",
  "Dark Child": "Annie",
  "Dark Child - Starter": "Annie",
  "Daughter of the Void": "Kai'Sa",
  "Deceiver": "Leblanc",
  "Emperor of the Sands": "Azir",
  "Fire Below the Mountain": "Ornn",
  "Gloomist": "Vex",
  "Glorious Executioner": "Draven",
  "Grand Duelist": "Fiora",
  "Grandmaster at Arms": "Jax",
  "Green Father": "Ivern",
  "Hand of Noxus": "Darius",
  "Herald of the Arcane": "Viktor",
  "Keeper of the Hammer": "Poppy",
  "Lady of Luminosity": "Lux",
  "Lady of Luminosity - Starter": "Lux",
  "Loose Cannon": "Jinx",
  "Mechanized Menace": "Rumble",
  "Might of Demacia": "Garen",
  "Might of Demacia - Starter": "Garen",
  "Nine-Tailed Fox": "Ahri",
  "Piltover Enforcer": "Vi",
  "Pridestalker": "Rengar",
  "Prodigal Explorer": "Ezreal",
  "Purifier": "Lucian",
  "Radiant Dawn": "Leona",
  "Relentless Storm": "Volibear",
  "Scorn of the Moon": "Diana",
  "Swift Scout": "Teemo",
  "The Boss": "Sett",
  "Unforgiven": "Yasuo",
  "Virtuoso": "Jhin",
  "Void Burrower": "Rek'Sai",
  "Voidreaver": "Kha'Zix",
  "Wuju Bladesman": "Yi",
  "Wuju Bladesman - Starter": "Yi",
  "Wuju Master": "Yi",
};

// Load cards once at startup
console.log("Loading cards...");
export const allCards = getAllCards();
export const registry = getCardRegistry();

// cardId → CDN imageUrl, from the per-set JSON. Used as a fallback when
// downloads/card-images/ is absent.
export const cardImageUrls = new Map<string, string>();
for (const setJson of Object.values(
  await import("../../../packages/riftbound-cards/src/data/sets/index").catch(() => ({})),
)) {
  const cards = (setJson as { cards?: { id: string; name?: string; cardType?: string; imageUrl?: string }[] })?.cards ?? [];
  for (const c of cards) {
    if (c.id && c.imageUrl) {
      cardImageUrls.set(c.id, c.imageUrl);
      // Tokens minted in-game carry a synthetic definitionId of the form
      // `token-def-<slug>` (see riftbound-engine moves/token.ts). Index each
      // set-token image by that slug too so /card-image/ can serve it. The
      // set JSON name may carry a region suffix ("Recruit (NX)") — strip it.
      if (/-t\d+$/.test(c.id) && c.name) {
        const slug = c.name.replace(/\s*\([^)]*\)$/, "").toLowerCase().replace(/\s+/g, "-");
        if (!cardImageUrls.has(`token-def-${slug}`)) {
          cardImageUrls.set(`token-def-${slug}`, c.imageUrl);
        }
      }
    }
  }
}
/**
 * Token art the official set data does not carry.
 *
 * Spiritforged introduced Mech and Sand Soldier tokens — Ferrous Forerunner,
 * Guards!, Arise!, Assembly Rig, Royal Guard, Azir and the Rumble legends all
 * play them — but Riot's card gallery publishes only SFD-T03 (Gold) of that
 * set's tokens, so `token-def-mech` and `token-def-sand-soldier` had no image
 * and rendered blank. The community archive hosts both, addressed by the same
 * public card code, and its alt text is what identifies which is which
 * (SFD-T01 = Mech, SFD-T02 = Sand Soldier).
 *
 * Keyed by token slug so it survives a set-data refresh: when Riot publishes
 * these, the loop above will set the official URL first and these entries are
 * skipped rather than overriding it.
 */
const COMMUNITY_TOKEN_IMAGES: Record<string, string> = {
  mech: "https://cdn.piltoverarchive.com/cards/SFD-T01.webp",
  "sand-soldier": "https://cdn.piltoverarchive.com/cards/SFD-T02.webp",
};
for (const [slug, url] of Object.entries(COMMUNITY_TOKEN_IMAGES)) {
  // Official art wins wherever it exists.
  if (!cardImageUrls.has(`token-def-${slug}`)) {
    cardImageUrls.set(`token-def-${slug}`, url);
  }
}

console.log(`Card image CDN fallback: ${cardImageUrls.size} URLs loaded`);

// Patch legends with championTag at runtime
let legendsPatched = 0;
for (const card of allCards) {
  if (card.cardType === "legend") {
    const tag = LEGEND_TAG_MAP[card.name];
    if (tag && !("championTag" in card && (card as Record<string, unknown>).championTag)) {
      (card as Record<string, unknown>).championTag = tag;
      legendsPatched++;
    }
  }
}
console.log(`Loaded ${allCards.length} cards (${legendsPatched} legends patched with champion tags)`);

// Load set JSONs (with image URLs and parsed abilities)
export function loadSetJson(setId: string): unknown {
  const filepath = path.join(SETS_DIR, `${setId.toLowerCase()}.json`);
  if (!fs.existsSync(filepath)) {return null;}
  return JSON.parse(fs.readFileSync(filepath, "utf8"));
}

/**
 * Build the CardDefinitionLookup payload for the engine's global card registry
 * from a parsed card definition. Forwards marker flags (interactiveCostReduction,
 * moveEscalation, inheritExhaustAbilities, copyAttachedUnitText, tracksExiledCards)
 * and the card's abilities so the engine can read them during move execution.
 */
export function makeLookupPayload(def: Record<string, unknown>, cardId: string, overrides?: {
  cardType?: string;
  energyCost?: number;
}): Parameters<ReturnType<typeof getGlobalCardRegistry>["register"]>[1] {
  return {
    abilities: def.abilities as unknown as Parameters<ReturnType<typeof getGlobalCardRegistry>["register"]>[1]["abilities"],
    cardType: (overrides?.cardType ?? def.cardType) as string,
    copyAttachedUnitText: def.copyAttachedUnitText as boolean | undefined,
    domain: def.domain as string | string[] | undefined,
    energyCost: overrides?.energyCost ?? (def.energyCost as number | undefined),
    id: cardId,
    inheritExhaustAbilities: def.inheritExhaustAbilities as boolean | undefined,
    interactiveCostReduction: def.interactiveCostReduction as "target-might" | undefined,
    keywords: def.keywords as string[] | undefined,
    might: def.might as number | undefined,
    mightBonus: def.mightBonus as number | undefined,
    moveEscalation: def.moveEscalation as boolean | undefined,
    name: def.name as string,
    powerCost: def.powerCost as string[] | undefined,
    tags: def.tags as string[] | undefined,
    timing: def.timing as string | undefined,
    tracksExiledCards: def.tracksExiledCards as boolean | undefined,
  };
}

/** Register a card in the engine's internal state so zone ops can track ownership */
export function registerCard(
  internal: { cards: Record<string, { definitionId: string; owner: string; controller: string; zone: string; position?: number }>;
              cardMetas: Record<string, import("@tcg/riftbound").RiftboundCardMeta> },
  cardId: string,
  definitionId: string,
  owner: string,
  zone: string,
) {
  internal.cards[cardId] = { controller: owner, definitionId, owner, position: undefined, zone };
  internal.cardMetas[cardId] = { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false };
}
