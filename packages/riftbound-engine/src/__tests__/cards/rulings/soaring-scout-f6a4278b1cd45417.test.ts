/**
 * Ruling f6a4278b1cd45417 — Soaring Scout (OGN-216 → ogn-216-298) · 1 Might · "[Deathknell] — Channel 1 rune exhausted."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · 3 Might · "Your [Deathknell] effects trigger an additional time." (passive)
 *   Both have been given [Temporary] ("At the start of your Beginning Phase, before scoring, kill this.").
 *
 * Q: Karthus and a Soaring Scout both die to Temporary — what happens to the Scout's Deathknell?
 * A: Karthus's ability is a passive: whenever he is still on the board at the moment the Scout dies (including dying at
 *    the very same time as it), the Scout's Deathknell triggers an additional time. If instead Karthus is returned to
 *    hand in response to the Temporary trigger(s), his passive is gone when the Deathknell triggers — no bonus.
 * Rules: 816.1.b/c (Temporary is a triggered "kill this" per permanent), 808.1.d.2 (Deathknell), 365 (passives apply
 *        while on the board), 383.3.d (controller orders their simultaneous triggers), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SOARING_SCOUT = "ogn-216-298";
const KARTHUS = "ogn-236-298";
const GUST = "ogn-169-298"; // P1's own Reaction to bounce Karthus (3 Might, at a battlefield) in response
const TEMPORARY = { grantedKeywords: [{ duration: "permanent" as const, keyword: "Temporary" }] };

type OrderD = Extract<Decision, { kind: "order" }>;

/** P2's turn, about to end. P1: Karthus (Temporary) holding bf1, Soaring Scout (Temporary) in base, two ready chaos runes,
 * Gust in hand. No runes are channeled by anything except the Scout's Deathknell and the normal Channel Phase. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", KARTHUS, "karthus", TEMPORARY)
    .unit(P1, "base", SOARING_SCOUT, "scout", TEMPORARY)
    .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
    .runes(P1, "chaos", 2)
    .hand(P1, GUST, "gust");
}

const exhaustedRunes = (game: Game) => game.p1.runes({ ready: false }).length;

/** P2 ends the turn; at the start of P1's Beginning Phase both Temporary kills are queued. Returns P1's order offer (if any). */
async function toTemporaryTriggers(game: Game): Promise<OrderD | undefined> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(new Set(game.chain().map((c) => c.cardId))).toEqual(new Set(["karthus", "scout"]));
  expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
  const d = game.decision();
  return d?.kind === "order" ? (d as OrderD) : undefined;
}

/** Pass priority (accepting any soft order offer) until the chain is empty or a non-priority prompt appears. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 16 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action") {
      await game.acting().pass();
    } else {
      break;
    }
  }
}

describe("Ruling f6a4278b1cd45417 — Karthus's passive doubles the Scout's Deathknell when both die to Temporary together", () => {
  test("P1's Beginning Phase: one Temporary kill trigger per unit goes on the chain (a Reaction window exists) and P1, their controller, is offered their order; nothing has died yet", async () => {
    const game = await board().build();
    expect(game.state("karthus").keywords).toContain("Temporary");
    expect(game.state("scout").keywords).toEqual(expect.arrayContaining(["Deathknell", "Temporary"]));
    const order = await toTemporaryTriggers(game);
    expect(order).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    expect(order!.items.map((i) => i.card).toSorted()).toEqual(["karthus", "scout"]);
    expect(game.zoneOf("karthus")).toBe("battlefield-bf1");
    expect(game.zoneOf("scout")).toBe("base");
    expect(exhaustedRunes(game)).toBe(0);
  });

  test("the Temporary deaths are ONE simultaneous event: when the kill resolves Karthus and the Scout hit the trash together, Karthus was on the board at that moment ⇒ the Scout's Deathknell triggers TWICE ⇒ 2 runes channeled exhausted", async () => {
    const game = await board().build();
    const order = await toTemporaryTriggers(game);
    expect(order).toBeDefined();
    const key = (card: string) => order!.items.find((i) => i.card === card)?.key as string;
    await game.p1.order([key("karthus"), key("scout")]); // Scout's item on top
    expect(game.chain().map((c) => c.cardId)).toEqual(["karthus", "scout"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Both died in the same instant …
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("karthus")).toBe("trash");
    // … and the Deathknell count was read off that board (Karthus present): two Scout Deathknell items.
    expect(game.chain().filter((c) => c.cardId === "scout" && c.triggered)).toHaveLength(2);
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(exhaustedRunes(game)).toBe(2);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });

  test("the order of the two Temporary items does not matter — Karthus's item on top gives the same simultaneous death and the same doubled Deathknell (2 exhausted runes)", async () => {
    const game = await board().build();
    const order = await toTemporaryTriggers(game);
    expect(order).toBeDefined();
    const key = (card: string) => order!.items.find((i) => i.card === card)?.key as string;
    await game.p1.order([key("scout"), key("karthus")]); // Karthus's item on top
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    // the Scout's own (now moot) Temporary item + TWO Deathknell items
    expect(game.chain().filter((c) => c.cardId === "scout" && c.triggered)).toHaveLength(1 + 2);
    await drainChain(game);
    expect(exhaustedRunes(game)).toBe(2);
  });

  test("'if instead' — P1 Gusts Karthus back to hand in response to the Temporary triggers: his passive is off the board when the Scout dies ⇒ ONE Deathknell ⇒ 1 exhausted rune; Karthus's own kill item does nothing", async () => {
    const game = await board().build();
    const order = await toTemporaryTriggers(game);
    if (order) {
      await game.acceptTriggerOrder();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // Pay for Gust from the two chaos runes: 1 energy + [chaos].
    await game.p1.tapRune({ domain: "chaos" });
    await game.p1.recycleRune({ domain: "chaos" });
    expect(game.p1.resources()).toMatchObject({ energy: 1, power: { chaos: 1 } });
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "karthus" });
    expect(game.chain().at(-1)).toMatchObject({ cardId: "gust", controller: P1 });
    // Gust resolves first: Karthus → hand.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("karthus")).toBe("hand");
    expect(game.zoneOf("scout")).toBe("base");
    const before = exhaustedRunes(game); // the tapped chaos rune
    // Then the Temporary kill(s): the Scout dies with Karthus NOT on the board ⇒ a single Deathknell.
    for (let i = 0; i < 6 && game.zoneOf("scout") !== "trash"; i++) {
      await game.acting().pass();
    }
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.chain().filter((c) => c.cardId === "scout" && c.triggered)).toHaveLength(1);
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(exhaustedRunes(game)).toBe(before + 1);
    expect(game.zoneOf("karthus")).toBe("hand"); // his Temporary item resolved with nothing to kill
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });

  test("'whether from Temporary or any other cause': Karthus and the Scout attack a 9-Might Wall together and both die to combat damage at once ⇒ the Scout's Deathknell triggers twice (2 exhausted runes)", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", KARTHUS, "karthus")
      .unit(P1, "base", SOARING_SCOUT, "scout")
      .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
      .build();
    await game.p1.move(["karthus", "scout"], "bf2");
    await game.settle();
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(exhaustedRunes(game)).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
