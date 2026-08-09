/**
 * Card Data Tests
 *
 * Verifies card definitions are properly generated and accessible.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { SETS, enrichCardsWithStats, getAllCards, getCardRegistry, getRawCards } from "../data";
import { richTextToPlain } from "../data/import-text";
import * as cards from "../cards";

const ENTITY = /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i;
const TAG = /<\/?[a-z][^>]*>/i;
/** The earlier importer spelled the `[0]` glyph `[energy_0]`. */
const RAW_GLYPH = /\[(?:energy|rune)_\w+\]|:rb_\w+:/;

const SETS_DIR = join(import.meta.dir, "..", "data", "sets");
type SetJsonCard = { id: string; cardType?: string; rulesText?: string; effectText?: string; abilities?: unknown[] };
const setJsonCards = (): { file: string; card: SetJsonCard }[] =>
  readdirSync(SETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .flatMap((file) =>
      ((JSON.parse(readFileSync(join(SETS_DIR, file), "utf8")) as { cards?: SetJsonCard[] }).cards ?? []).map(
        (card) => ({ card, file }),
      ),
    );

describe("Card text is plain text (no HTML entities, tags or raw glyph tokens)", () => {
  test("no set JSON rulesText/effectText carries an HTML entity, an HTML tag or an unconverted glyph", () => {
    const offenders: string[] = [];
    for (const { file, card } of setJsonCards()) {
      for (const field of ["rulesText", "effectText"] as const) {
        const text = card[field];
        if (typeof text === "string" && (ENTITY.test(text) || TAG.test(text) || RAW_GLYPH.test(text))) {
          offenders.push(`${file}:${card.id}:${field}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no enriched card reaches the engine with an HTML entity, tag or raw glyph in its text", () => {
    const offenders = getAllCards()
      .filter((c) =>
        [c.rulesText, c.effectText].some(
          (t) => typeof t === "string" && (ENTITY.test(t) || TAG.test(t) || RAW_GLYPH.test(t)),
        ),
      )
      .map((c) => c.id);
    expect(offenders).toEqual([]);
  });
});

/**
 * rule 136 / 150.2 — the Effect Text box of every printed Equipment, as the
 * gallery download (downloads/riftbound-cards.json, field `effect`) carries it,
 * converted to plain card text. This is the audit list for the importer: each
 * of these must be present in the card's `rulesText` (after its own rules
 * text) and in `effectText`.
 */
const EQUIPMENT_EFFECT_TEXT: Record<string, string> = {
  "sfd-009-221": "[Assault 2] (+2 [Might] while I'm an attacker.)", // Serrated Dirk
  "sfd-016-221": "When I attack or defend, deal 2 to an enemy unit here.", // Recurve Bow
  "sfd-030-221": "My hold effects are also conquer effects, and vice versa.", // Skyfall of Areion
  "sfd-033-221": "[Tank] (I must be assigned combat damage first.)", // Doran's Shield
  "sfd-042-221": "If this was attached to me this turn, I have an additional +2 [Might].", // Brutalizer
  "sfd-051-221": "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me.", // Guardian Angel
  "sfd-064-221": "[Shield 2] (+2 [Might] while I'm a defender.)", // Cloth Armor
  "sfd-073-221": "I am a Mech.", // Experimental Hexplate
  "sfd-086-221": "When I hold, play two Gold gear tokens exhausted.", // World Atlas
  "sfd-090-221": "[Deathknell] — Banish me. (When I die, get the effect.)", // The Zero Drive
  "sfd-102-221": "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)", // Hexdrinker
  "sfd-108-221": "When I conquer, buff me. (If I don't have a buff, I get a +1 [Might] buff.)", // Warmog's Armor
  "sfd-115-221": "When I hold, score 1 point.", // Trinity Force
  "sfd-118-221": "When I conquer, channel 1 rune exhausted.", // Boneshiver
  "sfd-124-221": "When I conquer, discard 1, then draw 1.", // Doran's Ring
  "sfd-133-221": "[Ganking] (I can move from battlefield to battlefield.)", // Boots of Swiftness
  "sfd-134-221": "When I conquer, play a Gold gear token exhausted.", // Cull
  "sfd-150-221": "When I conquer or hold, you may play a unit from your trash. (You still pay its costs.)", // Last Rites
  "sfd-153-221": "When I move, play a 1 [Might] Recruit unit token here.", // Eye of the Herald
  "sfd-172-221": "[Deathknell] — Draw 1. (When I die, get the effect.)", // Sacred Shears
  "sfd-190-221": "When I attack or defend, deal 2 to all enemy units here.", // Forgefire Cape
  "sfd-191-221": "Your spells and abilities deal 3 Bonus Damage (while this is attached).", // Rabadon's Deathcrown
  "sfd-192-221": "Your units here have [Ganking]. (We can move from battlefield to battlefield.)", // Shurelya's Requiem
  "unl-019-219": "At the end of your turn, if I didn't conquer this turn, unattach this and deal 4 to me.", // Blighted Battleaxe
  "unl-039-219": "[Level 3][>] I have an additional +1 [Might]. (While you have 3+ XP, get the effect.)", // Soul Sword
  "unl-096-219": "[Hunt] (When I conquer or hold, gain 1 XP.)", // Hunter's Machete
  "unl-188-219": "When I conquer, if you assigned 3 or more excess damage, draw 1.", // Hextech Gauntlets
  "ven-011-166": "When I move to a battlefield, give me +2 [Might] this turn.", // Pendulum Blade
  "ven-027-166": "I have +2 [Might] while I'm at a battlefield with exactly one other unit you control.", // Hand Hammer
  "ven-073-166": "I can't be moved by enemy spells and abilities.", // Jagged Cutlass
  "ven-137-166": "(I am a copy of the chosen unit.)", // Shady Spectacles (reminder only)
};

/**
 * Effect texts the parser cannot structure yet (no engine primitive for the
 * sentence). They are still carried in rulesText/effectText; the card just has
 * no conferred ability for them. Everything NOT listed here must yield at least
 * one `effectText: true` ability.
 */
const UNSTRUCTURED_EFFECT_TEXT: Record<string, string> = {
  "sfd-030-221": "hold↔conquer effect aliasing has no ability shape",
  "sfd-042-221": "'attached to me this turn' condition has no shape (an unknown static condition would apply the +2 permanently)",
  "sfd-051-221": "hand-authored as a `replacement` bound to the holder (attachedToSource) rather than a flagged ability",
  "sfd-073-221": "'I am a <Tag>' (tag grant) has no ability shape",
  "sfd-150-221": "'play a unit from your trash' paying its costs parses to raw text only",
  "sfd-191-221": "controller-wide 'Your spells and abilities deal N Bonus Damage' has no shape (only the '… to units here' aura does)",
  "ven-073-166": "'can't be moved by enemy spells and abilities' immunity has no shape",
  "ven-137-166": "reminder text only — the copy is the hand-flagged copyChosenUnitToHolder marker",
};

describe("Equipment effect text (rule 136 / 150.2) is imported", () => {
  const all = getAllCards();
  const byId = new Map(all.map((c) => [c.id, c]));

  test("every audited Equipment carries its effect text: in `effectText` and at the end of `rulesText`, after its own [Equip] text", () => {
    const problems: string[] = [];
    for (const [id, effectText] of Object.entries(EQUIPMENT_EFFECT_TEXT)) {
      const card = byId.get(id);
      if (!card) {
        problems.push(`${id}: missing from getAllCards()`);
        continue;
      }
      if (card.effectText !== effectText) {problems.push(`${id}: effectText = ${JSON.stringify(card.effectText)}`);}
      const rulesText = card.rulesText ?? "";
      if (!rulesText.endsWith(effectText)) {problems.push(`${id}: rulesText does not end with the effect text`);}
      if (!/\[Equip\]|^Equip /m.test(rulesText.slice(0, rulesText.length - effectText.length))) {
        problems.push(`${id}: [Equip] rules text does not precede the effect text`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("the set JSON rows agree (rulesText ends with effectText) for every row that has one", () => {
    const problems = setJsonCards()
      .filter(({ card }) => typeof card.effectText === "string")
      .filter(({ card }) => !(card.rulesText ?? "").endsWith(`\n${card.effectText}`) && card.rulesText !== card.effectText)
      .map(({ file, card }) => `${file}:${card.id}`);
    expect(problems).toEqual([]);
    // …and the audited rows are among them.
    const withEffect = new Set(setJsonCards().filter(({ card }) => card.effectText).map(({ card }) => card.id));
    expect(Object.keys(EQUIPMENT_EFFECT_TEXT).filter((id) => !withEffect.has(id))).toEqual([]);
  });

  test("no card outside the audit list claims an effectText (the list is complete)", () => {
    const extra = all.filter((c) => c.effectText !== undefined && !(c.id in EQUIPMENT_EFFECT_TEXT)).map((c) => c.id);
    expect(extra).toEqual([]);
  });

  test("each structured effect text yields ≥1 conferred (`effectText: true`) ability besides [Equip]", () => {
    const problems: string[] = [];
    for (const id of Object.keys(EQUIPMENT_EFFECT_TEXT)) {
      const abilities = (byId.get(id)?.abilities ?? []) as { type: string; keyword?: string; effectText?: boolean }[];
      const hasEquip = abilities.some((a) => a.type === "keyword" && a.keyword === "Equip");
      const conferred = abilities.filter((a) => a.effectText === true);
      if (!hasEquip) {problems.push(`${id}: lost its [Equip] keyword ability`);}
      if (id in UNSTRUCTURED_EFFECT_TEXT) {
        if (conferred.length > 0) {problems.push(`${id}: now parses — drop it from UNSTRUCTURED_EFFECT_TEXT`);}
      } else if (conferred.length === 0) {
        problems.push(`${id}: no effectText ability for ${JSON.stringify(EQUIPMENT_EFFECT_TEXT[id])}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("keyword bars become holder grants; 'When I …' sentences become holder triggers", () => {
    expect(byId.get("sfd-009-221")?.abilities).toContainEqual({
      effect: { keyword: "Assault", target: "self", type: "grant-keyword", value: 2 },
      effectText: true,
      type: "static",
    } as never);
    expect(byId.get("sfd-064-221")?.abilities).toContainEqual({
      effect: { keyword: "Shield", target: "self", type: "grant-keyword", value: 2 },
      effectText: true,
      type: "static",
    } as never);
    expect(byId.get("sfd-115-221")?.abilities).toContainEqual({
      effect: { amount: 1, type: "score" },
      effectText: true,
      trigger: { event: "hold", on: "self" },
      type: "triggered",
    } as never);
    expect(byId.get("sfd-016-221")?.abilities).toContainEqual({
      effect: { amount: 2, target: { controller: "enemy", location: "here", type: "unit" }, type: "damage" },
      effectText: true,
      trigger: { event: "attack-or-defend", on: "self" },
      type: "triggered",
    } as never);
  });

  // The gallery download is not checked in; when it is present (a dev checkout),
  // re-derive the audit list from it so a new Equipment printing cannot slip by.
  const DOWNLOAD = join(import.meta.dir, "..", "..", "..", "..", "downloads", "riftbound-cards.json");
  test.skipIf(!existsSync(DOWNLOAD))("audit list == every gear in downloads/riftbound-cards.json with a non-empty `effect`", () => {
    type Raw = { id: string; cardType?: { type?: { id: string }[] }; rarity?: { value?: { id: string } }; effect?: { richText?: { body?: string } } };
    const raw = JSON.parse(readFileSync(DOWNLOAD, "utf8")) as { props: { pageProps: { page: { blades: { cards?: { items: Raw[] } }[] } } } };
    const items = raw.props.pageProps.page.blades.flatMap((b) => b.cards?.items ?? []);
    const fromDownload: Record<string, string> = {};
    for (const c of items) {
      if (c.cardType?.type?.[0]?.id !== "gear" || c.rarity?.value?.id === "showcase") {continue;}
      const text = richTextToPlain(c.effect?.richText?.body);
      if (text && byId.has(c.id)) {fromDownload[c.id] = text;}
    }
    expect(fromDownload).toEqual(EQUIPMENT_EFFECT_TEXT);
  });
});

describe("Card Data", () => {
  test("sets metadata is populated", () => {
    expect(Object.keys(SETS).length).toBeGreaterThanOrEqual(3);
    expect(SETS.OGN).toBeDefined();
    expect(SETS.OGN.name).toBe("Origins");
    expect(SETS.UNL).toBeDefined();
    expect(SETS.SFD).toBeDefined();
  });

  test("card sets are exported", () => {
    expect(cards.ogn).toBeDefined();
    expect(cards.unl).toBeDefined();
    expect(cards.sfd).toBeDefined();
  });

  test("getAllCards returns all cards", () => {
    const allCards = getAllCards();
    expect(allCards.length).toBeGreaterThan(700);
  });

  test("getCardRegistry indexes by ID", () => {
    const registry = getCardRegistry();
    expect(registry.size).toBeGreaterThan(700);

    // Spot-check a known card
    const abandon = registry.get("unl-131-219");
    expect(abandon).toBeDefined();
    expect(abandon!.name).toBe("Abandon");
    expect(abandon!.cardType).toBe("spell");
  });

  test("unit cards have might", () => {
    const allCards = getAllCards();
    const units = allCards.filter((c) => c.cardType === "unit");
    expect(units.length).toBeGreaterThan(300);

    for (const unit of units) {
      if (unit.cardType === "unit") {
        expect(typeof unit.might).toBe("number");
      }
    }
  });

  test("spell cards have timing", () => {
    const allCards = getAllCards();
    const spells = allCards.filter((c) => c.cardType === "spell");
    expect(spells.length).toBeGreaterThan(100);

    for (const spell of spells) {
      if (spell.cardType === "spell") {
        expect(["action", "reaction"]).toContain(spell.timing);
      }
    }
  });

  test("rune cards have domain", () => {
    const allCards = getAllCards();
    const runes = allCards.filter((c) => c.cardType === "rune");
    expect(runes.length).toBe(6);

    for (const rune of runes) {
      if (rune.cardType === "rune") {
        expect(rune.domain).toBeDefined();
        expect(rune.isBasic).toBe(true);
      }
    }
  });

  test("legend cards have domain", () => {
    const allCards = getAllCards();
    const legends = allCards.filter((c) => c.cardType === "legend");
    expect(legends.length).toBeGreaterThan(30);

    for (const legend of legends) {
      if (legend.cardType === "legend") {
        expect(legend.domain).toBeDefined();
      }
    }
  });

  test("equipment cards are detected from gear", () => {
    const allCards = getAllCards();
    const equipment = allCards.filter((c) => c.cardType === "equipment");
    expect(equipment.length).toBeGreaterThan(0);

    for (const equip of equipment) {
      if (equip.cardType === "equipment") {
        expect(equip.rulesText).toContain("[Equip]");
      }
    }
  });

  test("cards have rulesText", () => {
    const allCards = getAllCards();
    const withText = allCards.filter((c) => c.rulesText && c.rulesText.length > 0);
    // Most cards should have rules text (runes may not)
    expect(withText.length).toBeGreaterThan(700);
  });

  test("no duplicate card IDs", () => {
    const allCards = getAllCards();
    const ids = allCards.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("cards are enriched with parsed abilities", () => {
    const allCards = getAllCards();
    const withAbilities = allCards.filter((c) => c.abilities && c.abilities.length > 0);
    // At least 70% of cards with text should have abilities
    const withText = allCards.filter((c) => c.rulesText && c.rulesText.length > 0);
    const rate = (withAbilities.length / withText.length) * 100;
    console.log(
      `Cards with abilities: ${withAbilities.length}/${withText.length} (${rate.toFixed(1)}%)`,
    );
    expect(rate).toBeGreaterThan(70);
  });

  test("enrichment stats show parse rate", () => {
    const raw = getRawCards();
    const { stats } = enrichCardsWithStats(raw);
    console.log(`Enrichment: ${stats.enriched}/${stats.withText} (${stats.rate.toFixed(1)}%)`);
    expect(stats.enriched).toBeGreaterThan(0);
    expect(stats.rate).toBeGreaterThan(70);
  });

  test("Ahri, Alluring has a triggered ability", () => {
    const registry = getCardRegistry();
    const ahri = registry.get("ogn-066-298");
    expect(ahri).toBeDefined();
    expect(ahri!.abilities).toBeDefined();
    expect(ahri!.abilities!.length).toBeGreaterThan(0);
    expect(ahri!.abilities![0].type).toBe("triggered");
  });

  test("Tank keyword parsed correctly", () => {
    const allCards = getAllCards();
    const tankCards = allCards.filter((c) =>
      c.abilities?.some((a) => a.type === "keyword" && "keyword" in a && a.keyword === "Tank"),
    );
    expect(tankCards.length).toBeGreaterThan(0);
  });
});
