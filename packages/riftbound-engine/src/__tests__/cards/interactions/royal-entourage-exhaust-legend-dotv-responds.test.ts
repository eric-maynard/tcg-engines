/**
 * Interaction: Royal Entourage (sfd-039-221, Unit · Calm · 3 + [calm] · 4 Might)
 *     "When you play me, ready or exhaust a legend."
 *   × Daughter of the Void (ogn-247-298, Legend · Kai'Sa)
 *     "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells."
 *
 * Question: P2's legend is Daughter of the Void (READY). P1 plays Royal Entourage and its play trigger
 * chooses P2's legend with 'exhaust'.
 *   (a) Before the trigger resolves, can P2 activate Daughter of the Void in response (exhausting it as
 *       the cost)? What happens when Entourage's trigger then resolves against an already-exhausted
 *       legend — fizzle, error, or silent no-op? Does P2 keep the added [rainbow]?
 *   (b) P2's legend was ALREADY exhausted when Entourage was played — still a legal choice?
 *   (c) P1 picks 'ready' on its OWN legend that is already ready.
 *   (d) After (a), can P2 activate Daughter of the Void again later this turn?
 *
 * Rules: 406.4 (opponents get a Reaction window before a chain item resolves), 414.4 (an [Exhaust] COST
 * needs a ready object), 414.1.b-c (exhausting an exhausted object: nothing additional happens),
 * 415.1.b-c (readying a ready object: nothing happens), 402.2 (choices are made at finalization),
 * 167 (unspent power persists until the pool empties), 415.3.a (Awaken readies it again).
 *
 * Expected: (a) yes — the Add resolves at once, legend exhausted, P2 +1 rainbow; the trigger then resolves
 * as a silent no-op (legend stays exhausted once, no error, chain empties, rainbow kept). (b) yes — "a
 * legend" has no ready requirement; resolution is a no-op. (c) legal no-op. (d) no — the [Exhaust] cost is
 * unpayable until P2's next Awaken.
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ROYAL_ENTOURAGE = "sfd-039-221";
const DAUGHTER = "ogn-247-298";
const LOOSE_CANNON = "ogn-251-298"; // P1's legend: triggered ability only, nothing to activate

const SPARK = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Spark",
  timing: "action",
} as const;

function board(opts: { dovExhausted?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .legend(P1, LOOSE_CANNON, "mine")
    .card("dov", { def: DAUGHTER, meta: opts.dovExhausted ? { exhausted: true } : undefined, owner: P2, zone: "legendZone" })
    .hand(P1, ROYAL_ENTOURAGE, "re")
    .hand(P1, SPARK, "spark");
}

/** Play Entourage, finalize the trigger as `mode` (0 ready / 1 exhaust) on `legend`, and hand priority to P2. */
async function playAndTarget(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, mode: 0 | 1, legend: string) {
  await game.p1.play("re");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "re", controller: P1, triggered: true })]);
  await game.p1.chooseMode(mode);
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick(legend);
  }
}

describe("Royal Entourage 'exhaust a legend' × Daughter of the Void responding", () => {
  test("(a) the trigger is a chain item; after P1 passes, P2 holds priority and Daughter of the Void IS offered (406.4, 414.4: it is ready)", async () => {
    const game = await board().build();
    await playAndTarget(game, 1, "dov");
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.state("dov").isReady).toBe(true);
    expect(game.p2.can("activate", "dov")).toBe(true);
  });

  test("(a) P2 activates in response: the Add resolves immediately — legend exhausted, +1 rainbow, Entourage's trigger still the only chain item, P2 keeps priority", async () => {
    const game = await board().build();
    await playAndTarget(game, 1, "dov");
    await game.p1.passPriority();
    await game.p2.activate("dov");
    expect(game.state("dov").isExhausted).toBe(true);
    expect(game.p2.power("rainbow")).toBe(1);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "re", triggered: true });
    expect(game.actingSeat()).toBe(P2);
  });

  test("(a) Entourage's trigger then resolves against the already-exhausted legend as a silent no-op: no error, chain empties, legend exhausted, P2 keeps the rainbow (414.1.b-c)", async () => {
    const game = await board().build();
    await playAndTarget(game, 1, "dov");
    await game.p1.passPriority();
    await game.p2.activate("dov");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.chain()).toHaveLength(0);
    expect(game.state("dov").isExhausted).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.zoneOf("re")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) after (a), P2 cannot activate Daughter of the Void again this turn — even when handed priority on a later chain (cost unpayable, 414.4)", async () => {
    const game = await board().build();
    await playAndTarget(game, 1, "dov");
    await game.p1.passPriority();
    await game.p2.activate("dov");
    await game.settle();
    // A later chain this turn: P1 casts Spark and passes; P2 has priority but no legal activation.
    await game.p1.cast("spark");
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("activate", "dov")).toBe(false);
    expect((await game.p2.try((p) => p.activate("dov", 0))).ok).toBe(false);
    await game.settle();
    // The rainbow, unspent, empties with the pool at end of turn (167); P2's Awaken readies the legend (415.3.a).
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.power("rainbow")).toBe(0);
    expect(game.state("dov").isReady).toBe(true);
    expect(game.p2.can("activate", "dov")).toBe(true);
  });

  test("(b) legend ALREADY exhausted when Entourage is played: it is still offered for 'exhaust a legend' (no ready requirement on an effect's target)", async () => {
    const game = await board({ dovExhausted: true }).build();
    expect(game.state("dov").isExhausted).toBe(true);
    await game.p1.play("re");
    await game.p1.chooseMode(1);
    const target = game.decision() as PickDecision;
    expect(target.kind).toBe("pick");
    expect(target.seat).toBe(P1);
    expect(target.options.map((o) => o.card).sort()).toEqual(["dov", "mine"]);
  });

  test("(b) …and choosing it resolves as a no-op: legend stays exhausted, no error, chain empties (414.1.c)", async () => {
    const game = await board({ dovExhausted: true }).build();
    await playAndTarget(game, 1, "dov");
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.state("dov").isExhausted).toBe(true);
    expect(game.state("mine").isExhausted).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) contrast: an exhausted Daughter of the Void cannot pay its own [Exhaust] COST — not offered to P2 in the response window (414.4)", async () => {
    const game = await board({ dovExhausted: true }).build();
    await playAndTarget(game, 1, "dov");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("activate", "dov")).toBe(false);
  });

  test("(c) 'ready' on P1's OWN already-ready legend: legal choice, nothing happens, no other object changes state (415.1.b-c)", async () => {
    const game = await board().build();
    await game.p1.play("re");
    await game.p1.chooseMode(0);
    const target = game.decision() as PickDecision;
    expect(target.options.map((o) => o.card).sort()).toEqual(["dov", "mine"]);
    await game.p1.pick("mine");
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.state("mine").isReady).toBe(true);
    expect(game.state("dov").isReady).toBe(true);
    expect(game.p2.power()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
