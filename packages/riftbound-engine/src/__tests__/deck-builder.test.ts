/**
 * Deck Builder Tests
 *
 * Tests the full deck building workflow: legend → champion → cards → runes → battlefields.
 */

import { describe, expect, test } from "bun:test";
import { createCardId } from "@tcg/riftbound-types/cards";
import type {
  BattlefieldCard,
  Card,
  GearCard,
  LegendCard,
  RuneCard,
  SpellCard,
  UnitCard,
} from "@tcg/riftbound-types/cards";
import { DeckBuilder } from "../deckbuilder";
import { filterCards, matchesDomainIdentity } from "../deckbuilder/card-filters";
import type { FilterableCard } from "../deckbuilder/card-filters";

// ============================================================================
// Test card factories
// ============================================================================

function legend(name: string, domains: string[], tag?: string): LegendCard {
  return {
    cardType: "legend",
    championTag: tag ?? name.split(",")[0],
    domain: domains.length === 1 ? domains[0] : domains,
    id: createCardId(`legend-${name.toLowerCase()}`),
    name,
  } as LegendCard;
}

function unit(name: string, domain: string, cost = 3, opts?: Partial<UnitCard>): UnitCard {
  return {
    cardType: "unit",
    domain,
    energyCost: cost,
    id: createCardId(`unit-${name.toLowerCase().replace(/\s/g, "-")}`),
    might: cost,
    name,
    ...opts,
  } as UnitCard;
}

function spell(name: string, domain: string, cost = 2): SpellCard {
  return {
    cardType: "spell",
    domain,
    energyCost: cost,
    id: createCardId(`spell-${name.toLowerCase().replace(/\s/g, "-")}`),
    name,
    timing: "action",
  } as SpellCard;
}

function gear(name: string, domain: string, cost = 2): GearCard {
  return {
    cardType: "gear",
    domain,
    energyCost: cost,
    id: createCardId(`gear-${name.toLowerCase().replace(/\s/g, "-")}`),
    name,
  } as GearCard;
}

function rune(domain: string): RuneCard {
  return {
    cardType: "rune",
    domain,
    id: createCardId(`rune-${domain}`),
    isBasic: true,
    name: `${domain.charAt(0).toUpperCase() + domain.slice(1)} Rune`,
  } as RuneCard;
}

function battlefield(name: string): BattlefieldCard {
  return {
    cardType: "battlefield",
    id: createCardId(`bf-${name.toLowerCase().replace(/\s/g, "-")}`),
    name,
  } as BattlefieldCard;
}

// ============================================================================
// Test card pool
// ============================================================================

function createTestPool(): Card[] {
  return [
    // Legends
    legend("Loose Cannon", ["fury", "chaos"], "Jinx"),
    legend("Blind Monk", ["calm", "body"], "Lee Sin"),

    // Champions (Jinx)
    unit("Jinx, Rebel", "fury", 5, { isChampion: true, tags: ["Jinx"] }),
    unit("Jinx, Demolitionist", "fury", 3, { isChampion: true, tags: ["Jinx"] }),

    // Champions (Lee Sin)
    unit("Lee Sin, Martial", "calm", 4, { isChampion: true, tags: ["Lee Sin"] }),

    // Fury units
    unit("Fury Soldier", "fury", 2),
    unit("Fury Knight", "fury", 4),
    unit("Fury Dragon", "fury", 7),

    // Calm units
    unit("Calm Healer", "calm", 2),
    unit("Calm Sage", "calm", 3),

    // Chaos units
    unit("Chaos Trickster", "chaos", 3),
    unit("Chaos Demon", "chaos", 6),

    // Multi-domain
    unit("Fury-Chaos Berserker", ["fury", "chaos"] as unknown as string, 5),

    // Domain-neutral
    unit("Neutral Guard", undefined as unknown as string, 3),

    // Spells
    spell("Fire Bolt", "fury", 2),
    spell("Chaos Rift", "chaos", 4),
    spell("Calm Breeze", "calm", 1),

    // Gear
    gear("Fury Blade", "fury", 3),
    gear("Calm Shield", "calm", 2),

    // Runes
    rune("fury"),
    rune("chaos"),
    rune("calm"),
    rune("body"),
    rune("mind"),
    rune("order"),

    // Battlefields
    battlefield("Ancient Arena"),
    battlefield("Mystical Nexus"),
    battlefield("Dark Fortress"),
    battlefield("Sacred Grove"),
  ] as Card[];
}

// ============================================================================
// Tests
// ============================================================================

describe("Card Filters: Domain Identity", () => {
  test("single-domain card matches identity", () => {
    const card: FilterableCard = { cardType: "unit", domain: "fury", id: "1", name: "X" };
    expect(matchesDomainIdentity(card, ["fury", "chaos"])).toBe(true);
  });

  test("single-domain card outside identity rejected", () => {
    const card: FilterableCard = { cardType: "unit", domain: "calm", id: "1", name: "X" };
    expect(matchesDomainIdentity(card, ["fury", "chaos"])).toBe(false);
  });

  test("multi-domain card: all domains must be in identity", () => {
    const card: FilterableCard = {
      cardType: "unit",
      domain: ["fury", "chaos"],
      id: "1",
      name: "X",
    };
    expect(matchesDomainIdentity(card, ["fury", "chaos"])).toBe(true);
    expect(matchesDomainIdentity(card, ["fury", "calm"])).toBe(false);
  });

  test("no-domain card always matches", () => {
    const card: FilterableCard = { cardType: "unit", id: "1", name: "X" };
    expect(matchesDomainIdentity(card, ["fury"])).toBe(true);
  });

  test("colorless always matches", () => {
    const card: FilterableCard = {
      cardType: "battlefield",
      domain: "colorless",
      id: "1",
      name: "X",
    };
    expect(matchesDomainIdentity(card, ["fury"])).toBe(true);
  });
});

describe("Card Filters: Criteria", () => {
  const pool = createTestPool() as FilterableCard[];

  test("filter by card type", () => {
    const units = filterCards(pool, { cardType: "unit" });
    expect(units.every((c) => c.cardType === "unit")).toBe(true);
    expect(units.length).toBeGreaterThan(5);
  });

  test("filter by energy cost", () => {
    const cheap = filterCards(pool, { cardType: "unit", maxEnergy: 3 });
    expect(cheap.every((c) => (c.energyCost ?? 0) <= 3)).toBe(true);
  });

  test("filter by name search", () => {
    const results = filterCards(pool, { nameSearch: "jinx" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((c) => c.name.toLowerCase().includes("jinx"))).toBe(true);
  });

  test("filter by set", () => {
    const withSet = pool.map((c) => ({ ...c, setId: "OGN" }));
    const results = filterCards(withSet, { set: "OGN" });
    expect(results.length).toBe(withSet.length);
  });

  test("multiple filters combine (AND)", () => {
    const results = filterCards(pool, {
      cardType: "unit",
      domainIdentity: ["fury", "chaos"],
    });
    expect(results.every((c) => c.cardType === "unit")).toBe(true);
  });
});

describe("DeckBuilder: Legend Selection", () => {
  test("lists available legends", () => {
    const builder = new DeckBuilder(createTestPool());
    const legends = builder.getAvailableLegends();
    expect(legends.length).toBe(2);
  });

  test("setting a legend sets domain identity", () => {
    const builder = new DeckBuilder(createTestPool());
    const legends = builder.getAvailableLegends();
    builder.setLegend(legends[0]);
    expect(builder.getDomainIdentity().length).toBeGreaterThan(0);
  });

  test("changing legend resets the deck", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    const legends = builder.getAvailableLegends();

    builder.setLegend(legends[0]);
    builder.addToMainDeck(pool.find((c) => c.name === "Fury Soldier")!);
    expect(builder.getState().mainDeck.length).toBe(1);

    builder.setLegend(legends[1]); // Different legend
    expect(builder.getState().mainDeck.length).toBe(0); // Reset
  });
});

describe("DeckBuilder: Champion Selection", () => {
  test("lists legal champions for selected legend", () => {
    const builder = new DeckBuilder(createTestPool());
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));
    const champs = builder.getLegalChampions();
    expect(champs.length).toBe(2); // Jinx, Rebel + Jinx, Demolitionist
    expect(champs.every((c) => c.tags?.includes("Jinx"))).toBe(true);
  });

  test("setting champion succeeds with matching tag", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));

    const jinx = pool.find((c) => c.name === "Jinx, Rebel") as UnitCard;
    const result = builder.setChampion(jinx);
    expect(result.success).toBe(true);
  });

  test("setting champion fails without legend", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    const jinx = pool.find((c) => c.name === "Jinx, Rebel") as UnitCard;
    const result = builder.setChampion(jinx);
    expect(result.success).toBe(false);
  });

  test("setting wrong champion fails", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));

    const leeSin = pool.find((c) => c.name === "Lee Sin, Martial") as UnitCard;
    const result = builder.setChampion(leeSin);
    expect(result.success).toBe(false);
  });
});

describe("DeckBuilder: Main Deck", () => {
  function setupBuilder() {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));
    return { builder, pool };
  }

  test("available cards are filtered by domain identity", () => {
    const { builder } = setupBuilder();
    const available = builder.getAvailableMainDeckCards();
    // Should include fury, chaos, fury-chaos, and neutral cards
    // Should NOT include calm-only or body-only cards
    const hasCalm = available.some((c) => {
      const d = c.domain;
      return typeof d === "string" && d === "calm";
    });
    expect(hasCalm).toBe(false);
  });

  test("can add legal cards", () => {
    const { builder, pool } = setupBuilder();
    const furySoldier = pool.find((c) => c.name === "Fury Soldier")!;
    const result = builder.addToMainDeck(furySoldier);
    expect(result.success).toBe(true);
    expect(builder.getState().mainDeck.length).toBe(1);
  });

  test("rejects cards outside domain identity", () => {
    const { builder } = setupBuilder();
    const calmCard = unit("Calm Healer", "calm", 2);
    const result = builder.addToMainDeck(calmCard);
    expect(result.success).toBe(false);
  });

  test("enforces 3-copy limit", () => {
    const { builder, pool } = setupBuilder();
    const card = pool.find((c) => c.name === "Fury Soldier")!;
    builder.addToMainDeck(card);
    builder.addToMainDeck(card);
    builder.addToMainDeck(card);
    const result = builder.addToMainDeck(card); // 4th copy
    expect(result.success).toBe(false);
  });

  test("can remove cards", () => {
    const { builder, pool } = setupBuilder();
    builder.addToMainDeck(pool.find((c) => c.name === "Fury Soldier")!);
    expect(builder.getState().mainDeck.length).toBe(1);
    builder.removeFromMainDeck(0);
    expect(builder.getState().mainDeck.length).toBe(0);
  });

  test("extra filter criteria stack with domain identity", () => {
    const { builder } = setupBuilder();
    const spells = builder.getAvailableMainDeckCards({ cardType: "spell" });
    expect(spells.every((c) => c.cardType === "spell")).toBe(true);
  });
});

describe("DeckBuilder: Rune Deck", () => {
  test("available runes match domain identity", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));
    const runes = builder.getAvailableRunes();
    expect(runes.length).toBe(2); // Fury + chaos
  });

  test("auto-fill creates 12 runes", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));
    builder.autoFillRuneDeck();
    expect(builder.getState().runeDeck.length).toBe(12);
  });

  test("rejects runes at capacity", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));
    builder.autoFillRuneDeck();
    const result = builder.addToRuneDeck(rune("fury"));
    expect(result.success).toBe(false);
  });
});

describe("DeckBuilder: Battlefields", () => {
  test("available battlefields include colorless", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));
    const bfs = builder.getAvailableBattlefields();
    expect(bfs.length).toBeGreaterThan(0);
  });

  test("can add up to 3 battlefields", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));
    const bfs = builder.getAvailableBattlefields();
    builder.addBattlefield(bfs[0]);
    builder.addBattlefield(bfs[1]);
    builder.addBattlefield(bfs[2]);
    const result = builder.addBattlefield(bfs[3] ?? bfs[0]);
    expect(result.success).toBe(false);
  });

  test("rejects duplicate battlefields", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));
    const bfs = builder.getAvailableBattlefields();
    builder.addBattlefield(bfs[0]);
    const result = builder.addBattlefield(bfs[0]);
    expect(result.success).toBe(false);
  });
});

describe("DeckBuilder: Stats & Validation", () => {
  test("stats reflect current deck state", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));

    const jinx = pool.find((c) => c.name === "Jinx, Rebel") as UnitCard;
    builder.setChampion(jinx);

    const furySoldier = pool.find((c) => c.name === "Fury Soldier")!;
    builder.addToMainDeck(furySoldier);
    builder.addToMainDeck(furySoldier);

    const stats = builder.getStats();
    expect(stats.mainDeckCount).toBe(3); // Champion + 2 soldiers
    expect(stats.domainIdentity).toEqual(["fury", "chaos"]);
    expect(stats.manaCurve[2]).toBe(2); // 2 soldiers at cost 2
  });

  test("export returns card IDs", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));
    builder.setChampion(pool.find((c) => c.name === "Jinx, Rebel") as UnitCard);

    const exported = builder.export();
    expect(exported).not.toBeNull();
    expect(exported!.legendId).toContain("legend");
    expect(exported!.championId).toContain("unit");
  });

  test("clear resets everything", () => {
    const pool = createTestPool();
    const builder = new DeckBuilder(pool);
    builder.setLegend(legend("Loose Cannon", ["fury", "chaos"], "Jinx"));
    builder.clear();
    expect(builder.getState().legend).toBeNull();
    expect(builder.getState().mainDeck.length).toBe(0);
  });
});
