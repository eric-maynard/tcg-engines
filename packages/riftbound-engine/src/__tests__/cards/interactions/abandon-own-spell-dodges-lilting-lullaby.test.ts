/**
 * Interaction: Abandon (unl-131-219) × Lilting Lullaby (unl-190-219) × Void Seeker (ogn-024-298)
 *
 *   Void Seeker — Spell · Fury · 3 + [fury] · [Action]   "Deal 4 to a unit at a battlefield. Draw 1."
 *   Lilting Lullaby — Spell · Calm/Mind · 2 + [C][C] · [Reaction]
 *     "Counter a spell. Its controller can't play spells this turn."
 *   Abandon — Spell · Chaos · 2 · [Reaction]
 *     "Counter a spell. Return it to its owner's hand instead of putting it in their trash. [Predict]."
 *
 * Question: P1's turn. P1 Void Seekers P2's unit X; P2 responds with Lullaby on the Void Seeker; P1
 * responds with Abandon on P1's OWN Void Seeker.
 *  (a) Is targeting your own spell with Abandon legal?
 *  (b) Resolve the chain: where is Void Seeker, does P1 Predict, is anything refunded?
 *  (c) What does Lullaby do — is P1 barred from spells this turn?
 *  (d) May P1 replay the Void Seeker from hand this turn, and does it work normally?
 *  (e) Contrast: P1 does NOT Abandon.
 *
 * Expected (rules): (a) yes — "a spell" has no enemy qualifier; only Abandon itself is excluded
 * (355.9.c). (b) LIFO: Abandon counters Void Seeker, whose "instead" replacement sends it to its
 * owner's HAND (425.1.a.1 replaced), then P1 Predicts; no refund (425.1.c); X unhurt, no draw.
 * (c) Lullaby resolves with its target gone from the chain: "Counter a spell" is not performed and the
 * LINKED "its controller can't play spells" is ignored too (359.3.e.14.a) — P2's resources stay spent,
 * P1 is NOT locked. (d) Yes: the returned card is a new object (124); P1 pays full cost again and it
 * resolves — 4 to X, draw 1. (e) Without Abandon: Void Seeker countered to trash, no refund, and P1
 * can't play spells for the rest of the turn (units still fine).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const LULLABY = "unl-190-219";
const ABANDON = "unl-131-219";
/** A cheap [Action] spell so "can P1 still play spells?" is observable independently of Void Seeker. */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Spark",
  timing: "action",
} as const;
const GRUNT = { cardType: "unit", energyCost: 1, might: 1, name: "Grunt" } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets" || f.arg === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn. P2 holds bf1 with X (5 Might — survives one Void Seeker). P1: 8 energy + 2 fury (two full
 * Void Seeker casts + Abandon), hand = Void Seeker, Abandon, Spark, Grunt; known top card. P2: exactly
 * Lullaby's 2 + calm + mind.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 2 } })
    .resources(P2, { energy: 2, power: { calm: 1, mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Target X" }, "X")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P1, ABANDON, "abandon")
    .hand(P1, SPARK, "spark")
    .hand(P1, GRUNT, "grunt")
    .deck(P1, ["ogn-175-298"], ["p1top"])
    .hand(P2, LULLABY, "lull");
}

/** Void Seeker at X → P2 Lullaby on it → (both now have priority passed to P1). */
async function seekerThenLullaby(game: Game): Promise<void> {
  await game.p1.cast("vs", { targets: "X" });
  expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 1 } });
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("lull", { targets: "vs" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "lull"]);
}

/** …P1 Abandons its own Void Seeker; everyone passes; P1 declines the Predict recycle; chain empties. */
async function abandonOwnSeekerAndResolve(game: Game): Promise<void> {
  await game.p1.cast("abandon", { targets: "vs" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "lull", "abandon"]);
  const s = await game.settle();
  // Abandon resolved first (LIFO) → its [Predict] asks P1 about the top card.
  expect(s.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ seat: P1 });
  expect(game.decision()?.kind).not.toBe("action");
  await game.p1.decline();
  await game.settle();
  expect(game.chain()).toEqual([]);
}

describe("Abandon on your OWN spell dodges Lilting Lullaby's silence", () => {
  test("(a) Abandon may target P1's own Void Seeker — 'a spell' offers every spell on the chain except Abandon itself (355.9.c)", async () => {
    const game = await board().build();
    await seekerThenLullaby(game);
    expect(game.p1.can("cast", "abandon")).toBe(true);
    const offered = targetsOffered(game, "p1", "abandon");
    expect(offered).toContain("vs");
    expect(offered).toContain("lull");
    expect(offered).not.toContain("abandon");
    await game.p1.cast("abandon", { targets: "vs" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.chain().at(-1)).toMatchObject({ cardId: "abandon", controller: P1, targets: ["vs"] });
  });

  test("(b) LIFO: Abandon counters Void Seeker and the 'instead' sends it to its owner's HAND (not trash); P1 Predicts; nothing is refunded; X takes no damage and P1 draws nothing", async () => {
    const game = await board().build();
    await seekerThenLullaby(game);
    const deckBefore = game.p1.deck().length;
    await abandonOwnSeekerAndResolve(game);
    expect(game.zoneOf("vs")).toBe("hand");
    expect(game.p1.hand()).toContain("vs");
    expect(game.zoneOf("abandon")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } }); // 8 − 3 − 2; fury 2 − 1; no refund (425.1.c)
    expect(game.state("X").damage).toBe(0);
    expect(new Set(game.p1.hand())).toEqual(new Set(["vs", "spark", "grunt"])); // no "Draw 1"
    expect(game.p1.deck()).toHaveLength(deckBefore); // Predict declined: top card stays
    expect(game.p1.deck()[0]).toBe("p1top");
  });

  test("(c) Lullaby then resolves with its target gone: nothing is countered AND the linked silence is ignored (359.3.e.14.a) — Lullaby in P2's trash, P2's 2+[C][C] still spent, P1 may still play spells", async () => {
    const game = await board().build();
    await seekerThenLullaby(game);
    await abandonOwnSeekerAndResolve(game);
    expect(game.zoneOf("lull")).toBe("trash");
    expect(game.p2.trash()).toContain("lull");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.p1.can("cast", "spark")).toBe(true);
    expect(game.p1.can("cast", "vs")).toBe(true);
    expect(game.p1.can("play", "grunt")).toBe(true);
  });

  test("(d) P1 replays the returned Void Seeker this same turn paying its FULL cost again; it resolves normally: 4 damage to X and P1 draws 1", async () => {
    const game = await board().build();
    await seekerThenLullaby(game);
    await abandonOwnSeekerAndResolve(game);
    expect(targetsOffered(game, "p1", "vs")).toContain("X");
    await game.p1.cast("vs", { targets: "X" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // another 3 + [fury]
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("X").damage).toBe(4);
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toHaveLength(3); // spark, grunt + the drawn p1top
    expect(game.p1.hand()).toContain("p1top");
    expect(game.violations()).toEqual([]);
  });

  test("(e) contrast — P1 does NOT Abandon: Lullaby counters Void Seeker to the trash with no refund, X unhurt, no draw, and P1 can't play spells for the rest of the turn (a unit is still fine)", async () => {
    const game = await board().build();
    await seekerThenLullaby(game);
    await game.p1.passPriority(); // both passed in succession → Lullaby resolves, then the countered Seeker leaves
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("lull")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 1 } }); // nothing back
    expect(game.state("X").damage).toBe(0);
    expect(new Set(game.p1.hand())).toEqual(new Set(["abandon", "spark", "grunt"]));
    expect(game.p1.can("cast", "spark")).toBe(false);
    expect(game.p1.can("cast", "abandon")).toBe(false);
    expect(game.p1.can("play", "grunt")).toBe(true);
    await game.p1.play("grunt");
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("base");
  });

  test("(e) …and that silence is 'this turn' only: on P1's next turn Spark is castable again", async () => {
    const game = await board().build();
    await seekerThenLullaby(game);
    await game.p1.passPriority();
    await game.settle();
    expect(game.p1.can("cast", "spark")).toBe(false);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 1 });
    expect(game.p1.can("cast", "spark")).toBe(true);
  });
});
