/**
 * Call to Battle — unl-101-219 · Spell · Body · 3 energy (no power) · standard timing
 *
 *   Move a unit you control to a battlefield you control. Then, choose an opponent. They move a
 *   unit they control to the same battlefield.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. Two linked choices at play time (355.4 / 355.5): a unit YOU CONTROL (base or another
 *     battlefield, ready or exhausted) and a destination that is a battlefield YOU CONTROL other than
 *     where the unit already is (355.4.a). A unit whose only controlled battlefield is its own spot
 *     is not a legal choice; controlling no battlefield → the spell is unplayable (355.8).
 *  2. It is a spell move, not the Standard Move: nothing is exhausted, an exhausted unit moves fine,
 *     battlefield→battlefield needs no Ganking, and "When I move" triggers (Stellacorn Herder) fire.
 *  3. "Then … They move a unit they control to the same battlefield" — the OPPONENT picks which of
 *     their units comes (mandatory if they have one); it arrives at a battlefield P1 controls, so the
 *     battlefield becomes contested and a combat is staged on P1's turn with P2's unit attacking.
 *     With no enemy unit anywhere the second sentence is simply skipped (359.3.e.6).
 *  4. No [Action]/[Reaction]: own turn, Neutral Open only — not in a showdown, not on the enemy turn,
 *     not in response on a chain.
 *  5. Cost: exactly 3 energy, no power of any kind; 2 energy + lots of power is not enough.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-101-219";
const HERDER = "sfd-048-221"; // Unit · 3 Might · When I move, draw 1.

/** P1 to act with 3 energy; controls bf1 + bf2; Scout (exhausted) in base, Guard at bf1; P2 has Brute in base and holds bf3 with Sentry. */
function board(p1: { energy?: number; power?: Record<string, number> } = { energy: 3 }) {
  return scenario()
    .resources(P1, p1)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout", { exhausted: true })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
    .unit(P2, "bf3", { might: 1, name: "Sentry" }, "sentry")
    .hand(P1, CARD, "ctb");
}

describe("Call to Battle (unl-101-219)", () => {
  test("cost: exactly 3 energy and no power; the spell resolves to the trash", async () => {
    const game = await board({ energy: 3, power: { body: 1 } }).build();
    await game.p1.cast("ctb", { targets: "guard" }); // Guard's only other controlled battlefield is bf2 → no destination prompt
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ctb", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("ctb")).toBe("trash");
    expect(game.locationOf("guard")).toBe("bf2");
    const short = await board({ energy: 2, power: { body: 3, rainbow: 3 } }).build();
    expect(short.p1.can("cast", "ctb")).toBe(false);
  });

  test("choices: only units P1 controls are offered (Scout, Guard) — never the enemy Brute/Sentry", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "ctb")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([["scout"], ["guard"]]));
    expect(offered).toHaveLength(2);
    for (const bad of ["brute", "sentry"]) {
      expect((await game.p1.try((p) => p.cast("ctb", { targets: bad }))).ok).toBe(false);
    }
    expect(game.zoneOf("ctb")).toBe("hand");
  });

  test("destination: a battlefield P1 CONTROLS — from base with two controlled battlefields P1 picks bf1 or bf2 (never the enemy bf3 or base); the exhausted Scout moves and stays merely exhausted", async () => {
    const game = await board().build();
    await game.p1.cast("ctb", { targets: "scout" });
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(d.options.map((o) => o.key).sort()).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("scout")).toBe("bf2");
    expect(game.state("scout").isExhausted).toBe(true); // it was exhausted before; a spell move neither needs nor changes readiness
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("not the Standard Move: a READY unit moved this way is still ready afterwards, and battlefield→battlefield needs no Ganking", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .hand(P1, CARD, "ctb")
      .build();
    expect(game.p1.can("gank", "guard")).toBe(false); // no Ganking: the Standard Move could not do this
    await game.p1.cast("ctb", { targets: "guard" });
    await game.settle();
    expect(game.locationOf("guard")).toBe("bf2");
    expect(game.state("guard").isReady).toBe(true);
  });

  test("355.4.a — a unit already at P1's ONLY controlled battlefield has no legal destination: it is not offered, and with no other unit the spell is unplayable; controlling no battlefield at all → unplayable", async () => {
    const parked = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf3", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .hand(P1, CARD, "ctb")
      .build();
    expect(parked.p1.can("cast", "ctb")).toBe(false);
    const withScout = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, CARD, "ctb")
      .build();
    expect(withScout.p1.option("cast", "ctb")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["scout"]]);
    const homeless = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, CARD, "ctb")
      .build();
    expect(homeless.p1.can("cast", "ctb")).toBe(false);
  });

  test("'When I move' triggers fire off the spell move: Stellacorn Herder called to bf1 draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", HERDER, "herder")
      .hand(P1, CARD, "ctb")
      .build();
    const hand0 = game.p1.hand().length; // includes ctb
    await game.p1.cast("ctb", { targets: "herder" });
    await game.settle();
    expect(game.locationOf("herder")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // ctb left the hand, Herder drew one
  });

  test("timing: no [Action]/[Reaction] — not castable on the opponent's turn, during a showdown, or with a chain open", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "ctb")).toBe(false);

    const showdown = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf3", { controller: P2 })
      .unit(P2, "bf3", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .unit(P1, "base", { might: 2, name: "Runner" }, "runner")
      .hand(P1, CARD, "ctb")
      .build();
    await showdown.p1.move("runner", "bf3");
    expect((showdown.decision() as ActionDecision).context).toBe("showdown");
    expect(showdown.p1.can("cast", "ctb")).toBe(false);

    const chainOpen = await board({ energy: 6 }).hand(P1, CARD, "ctb2").build();
    await chainOpen.p1.cast("ctb", { targets: "guard" });
    expect((chainOpen.decision() as ActionDecision).context).toBe("chain");
    expect(chainOpen.p1.can("cast", "ctb2")).toBe(false);
  });

  test("with no enemy unit anywhere the second sentence is skipped: Guard arrives at bf2, nothing is contested, P1 keeps the turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .hand(P1, CARD, "ctb")
      .build();
    await game.p1.cast("ctb", { targets: "guard" });
    await game.settle();
    expect(game.locationOf("guard")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.contested).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // BUG — expected: "Then, choose an opponent. They move a unit they control to the same battlefield."
  // With a single opponent holding a single unit (Brute in base) the outcome is forced: Brute ends
  // up at bf2 next to Guard, bf2 becomes contested and a combat is staged with P2 attacking on P1's
  // turn. Actual: the parsed ability carries only the first (friendly) move; the opponent is never
  // asked and Brute stays home.
  test("the chosen opponent must move one of their units to the same battlefield (forced single unit → Brute joins Guard at bf2, combat staged)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
      .hand(P1, CARD, "ctb")
      .build();
    await game.p1.cast("ctb", { targets: "guard" });
    await game.settle({ policy: "first" }); // take any forced/first picks for both seats
    expect(game.locationOf("guard")).toBe("bf2");
    expect(game.locationOf("brute")).toBe("bf2");
  });

  // BUG — expected: with two enemy units (Brute in base, Sentry at bf3) the OPPONENT — not the caster —
  // chooses which one answers the call: after Scout lands at bf2, P2 should face a pick naming
  // exactly their own units. Actual: no such prompt; the spell is already in the trash and it is
  // P1's open Main Phase again.
  test("the opponent (P2) is the one prompted to pick which of THEIR units moves to the same battlefield", async () => {
    const game = await board().build();
    await game.p1.cast("ctb", { targets: "scout" });
    await game.settle();
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(d?.kind).toBe("pick");
    const cards = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(cards).toEqual(["brute", "sentry"]);
    await game.p2.pick("sentry");
    await game.settle();
    expect(game.locationOf("sentry")).toBe("bf2");
    expect(game.locationOf("brute")).toBe("base");
  });

  test("registry payload: standard-timing spell, 3 energy, no power; the parsed ability is a friendly-unit move to a CONTROLLED battlefield (the 'Then, choose an opponent…' sentence is missing — see BUG tests)", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "body", energyCost: 3, name: "Call to Battle", timing: "standard" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.rulesText).toBe(
      "Move a unit you control to a battlefield you control. Then, choose an opponent. They move a unit they control to the same battlefield.",
    );
    const abilities = (def?.abilities ?? []) as { type: string; timing?: string; effect?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { target: { controller: "friendly", type: "unit" }, to: { battlefield: "controlled" }, type: "move" },
      type: "spell",
    });
  });

  // BUG — expected: the printed text has TWO instructions; a faithful payload carries the opponent's
  // forced move as a follow-up (e.g. a `then`/sequence step targeting an enemy-controlled unit chosen
  // by that opponent, destination = the first move's battlefield). Actual: only the first move exists.
  test("parsed abilities should encode the second instruction ('They move a unit they control to the same battlefield')", async () => {
    const pool = await loadDefaultCardPool();
    const ability = (pool.get(CARD)?.abilities ?? [])[0] as { effect?: { type?: string; then?: unknown; effects?: unknown[] } };
    const hasFollowUp = ability.effect?.then !== undefined || (ability.effect?.type === "sequence" && (ability.effect.effects?.length ?? 0) >= 2);
    expect(hasFollowUp).toBe(true);
  });
});
