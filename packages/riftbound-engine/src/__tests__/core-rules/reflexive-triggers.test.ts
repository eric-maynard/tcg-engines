/**
 * Core rules — Reflexive Triggers ("Then do this: …", rules 387 / 388).
 *
 *   387       a Reflexive Trigger is a triggered ability that creates one or more Chain Items when
 *             its condition is met ("Do this:"); with no condition it is always added (387.2)
 *   387.1.a   "Do this N times" — the trigger is added to the chain N times
 *   388.1     a NEW ability is created and added to the chain as a Pending Item — so it is finalized
 *             (402: targets chosen, a leading "you may" answered) before anyone gets Priority (337.4),
 *             and every opponent may respond before it resolves
 *   425.1.a   a countered spell never resolves — so its reflexive trigger is never created
 *   359.3.e.14 "… of them" in the reflexive text is linked to what the main instruction produced
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

// The `abilities` below are exactly what the parser emits for each rules text
// (see riftbound-cards parser/__tests__/effects/reflexive.test.ts).

/** Spell: "Draw 1. Then do this: Deal 2 to an enemy unit." */
const SPARK = {
  abilities: [
    {
      effect: {
        effects: [
          { amount: 1, type: "draw" },
          { effect: { amount: 2, target: { controller: "enemy", type: "unit" }, type: "damage" }, type: "reflexive" },
        ],
        type: "sequence",
      },
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Afterspark (inline: Draw 1. Then do this: Deal 2 to an enemy unit.)",
  rulesText: "Draw 1. Then do this: Deal 2 to an enemy unit.",
};

/** Spell: "Draw 1. Then do this twice: Deal 1 to an enemy unit." */
const DOUBLE_SPARK = {
  abilities: [
    {
      effect: {
        effects: [
          { amount: 1, type: "draw" },
          { effect: { amount: 1, target: { controller: "enemy", type: "unit" }, type: "damage" }, times: 2, type: "reflexive" },
        ],
        type: "sequence",
      },
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Twinspark (inline: Draw 1. Then do this twice: Deal 1 to an enemy unit.)",
  rulesText: "Draw 1. Then do this twice: Deal 1 to an enemy unit.",
};

/** Spell: "Draw 1. Then you may do this: Draw 2." */
const GREED = {
  abilities: [
    {
      effect: {
        effects: [{ amount: 1, type: "draw" }, { effect: { amount: 2, type: "draw" }, optional: true, type: "reflexive" }],
        type: "sequence",
      },
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Greed (inline: Draw 1. Then you may do this: Draw 2.)",
  rulesText: "Draw 1. Then you may do this: Draw 2.",
};

/** Spell: "Play a 3 [Might] Recruit unit token. Then do this: Ready it." */
const MUSTER = {
  abilities: [
    {
      effect: {
        effects: [
          { token: { might: 3, name: "Recruit", type: "unit" }, type: "create-token" },
          { effect: { target: { type: "pending-value" }, type: "ready" }, type: "reflexive" },
        ],
        pendingValue: { source: 0 },
        type: "sequence",
      },
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Muster (inline: Play a 3 [Might] Recruit unit token. Then do this: Ready it.)",
  rulesText: "Play a 3 [Might] Recruit unit token. Then do this: Ready it.",
};

/** [Reaction] "Counter a spell." */
const NULLIFY = {
  abilities: [{ effect: { type: "counter" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  keywords: ["Reaction"],
  name: "Nullify (inline Reaction: Counter a spell.)",
  timing: "reaction",
};

function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Ox" }, "ox")
    .unit(P2, "base", { might: 4, name: "Yak" }, "yak")
    .deck(P1, [{ might: 1, name: "Filler A" }, { might: 1, name: "Filler B" }, { might: 1, name: "Filler C" }, { might: 1, name: "Filler D" }], ["fa", "fb", "fc", "fd"]);
}

async function resolveTop(game: Game): Promise<void> {
  const n = game.chain().length;
  for (let i = 0; i < 6 && game.chain().length >= n && game.decision()?.kind === "action"; i++) {
    await game.acting().pass();
  }
}

describe("387 / 388.1 — the reflexive instruction is a separate triggered chain item created when the spell resolves; opponents get Priority before it resolves", () => {
  test("Afterspark: the draw happens on resolution; 'deal 2' is now a pending→finalized trigger sourced from the spell (P1 picks Ox as it is finalized, 402), the spell is already in the trash, nothing is damaged until both pass again", async () => {
    const game = await board().hand(P1, SPARK, "spark").build();
    const hand0 = game.p1.hand().length - 1;

    await game.p1.cast("spark");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spark", triggered: false, type: "spell" })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Afterspark resolves: Draw 1 … then the reflexive trigger is CREATED

    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.zoneOf("spark")).toBe("trash");
    // 402 / 337.4 — finalized before anyone gets Priority: its controller chooses the enemy unit now.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect((game.decision() as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["ox", "yak"]);
    await game.p1.pick("ox");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "spark", controller: P1, targets: ["ox"], triggered: true, type: "ability" }),
    ]);
    expect(game.state("ox").damage).toBe(0); // not yet
    // 388 — it uses the Chain: P1 (newest item's controller) then P2 hold Priority before it resolves.
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast")).toBe(false); // (nothing in hand — but the window exists)
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("ox").damage).toBe(2);
    expect(game.state("yak").damage).toBe(0);
  });

  test("P2 may respond IN that window: with a Reaction counter in hand P2 has Priority with the reflexive item on the chain and can act before the damage lands", async () => {
    const game = await board().hand(P1, SPARK, "spark").hand(P2, NULLIFY, "null").build();
    await game.p1.cast("spark");
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ox");
    }
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.chain()).toHaveLength(1);
    expect(game.state("ox").damage).toBe(0);
    expect(game.p2.legal().length).toBeGreaterThan(1); // more than just "pass"
  });
});

describe("425.1.a — countering the spell prevents the reflexive trigger from ever being created", () => {
  test("Nullify counters Afterspark on the chain: no draw, no trigger, no damage; both spells in the trash and the chain is empty", async () => {
    const game = await board().hand(P1, SPARK, "spark").hand(P2, NULLIFY, "null").build();
    const hand0 = game.p1.hand().length - 1;
    await game.p1.cast("spark");
    await game.p1.passPriority();
    await game.p2.cast("null", { targets: "spark" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Nullify resolves → Afterspark countered
    await game.settle();
    expect(game.zoneOf("spark")).toBe("trash");
    expect(game.zoneOf("null")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.state("ox").damage + game.state("yak").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("387.1.a / 388.2 — 'do this twice' creates TWO chain items, in order, each finalized with its own target", () => {
  test("Twinspark: after resolution two triggered items sourced from the spell sit on the chain; Ox and Yak can each be picked once; they resolve one at a time (1 damage each)", async () => {
    const game = await board().hand(P1, DOUBLE_SPARK, "twin").build();
    await game.p1.cast("twin");
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Two finalization picks, oldest pending item first.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    await game.p1.pick("ox");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    await game.p1.pick("yak");
    const items = game.chain();
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.cardId === "twin" && i.triggered && i.controller === P1)).toBe(true);
    expect(items.map((i) => i.targets)).toEqual([["ox"], ["yak"]]);
    await resolveTop(game); // top item (Yak) resolves first — LIFO
    expect(game.state("yak").damage).toBe(1);
    expect(game.state("ox").damage).toBe(0);
    expect(game.chain()).toHaveLength(1);
    await resolveTop(game);
    expect(game.state("ox").damage).toBe(1);
    expect(game.chain()).toEqual([]);
  });
});

describe("'Then you MAY do this' — the opt-in is asked as the item is finalized (402.1); declining removes it", () => {
  test("Greed: yes → a triggered 'Draw 2' item resolves after a pass round (1 + 2 cards); no → nothing is added and only the first card was drawn", async () => {
    const yes = await board().hand(P1, GREED, "greed").build();
    const h0 = yes.p1.hand().length - 1;
    await yes.p1.cast("greed");
    await yes.p1.passPriority();
    await yes.p2.passPriority();
    expect(yes.p1.hand()).toHaveLength(h0 + 1);
    expect(yes.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await yes.p1.yes();
    expect(yes.chain()).toEqual([expect.objectContaining({ cardId: "greed", triggered: true })]);
    await yes.p1.passPriority();
    await yes.p2.passPriority();
    expect(yes.p1.hand()).toHaveLength(h0 + 3);

    const no = await board().hand(P1, GREED, "greed").build();
    const n0 = no.p1.hand().length - 1;
    await no.p1.cast("greed");
    await no.p1.passPriority();
    await no.p2.passPriority();
    expect(no.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await no.p1.no();
    expect(no.chain()).toEqual([]);
    await no.settle();
    expect(no.p1.hand()).toHaveLength(n0 + 1);
  });
});

describe("359.3.e.14 — 'Ready IT' names the token the main instruction played, resolved by the later chain item", () => {
  test("Muster: the Recruit enters exhausted (143.4) and stays exhausted while the reflexive 'Ready it' waits on the chain; after both pass it is ready — a Recruit that was already on the board is untouched", async () => {
    const game = await board()
      .unit(P1, "base", { might: 3, name: "Recruit", tags: ["Recruit"] }, "veteran", { exhausted: true })
      .hand(P1, MUSTER, "muster")
      .build();
    await game.p1.cast("muster");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const fresh = game.findAll({ name: "Recruit", owner: P1 }).filter((id) => id !== "veteran");
    expect(fresh).toHaveLength(1);
    const token = fresh[0] as string;
    expect(game.state(token)).toMatchObject({ isExhausted: true, isToken: true, zone: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "muster", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state(token).isReady).toBe(true);
    expect(game.state("veteran").isExhausted).toBe(true);
  });
});
