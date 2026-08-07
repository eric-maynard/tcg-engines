/**
 * Noxian Demolitionist — ven-080-166 · Unit · Body · 2 energy · 1 Might
 *
 *   When I conquer, you may kill a gear with Energy cost no more than my Might.
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. The ceiling is MY MIGHT, read when the ability resolves: printed 1 Might → only 0/1-cost gear
 *     (Orb of Regret [1], Seals [0]); a 2-cost Scrapheap is NOT a legal choice. Buffed (+1 → 2 Might)
 *     or pumped this turn, the same Scrapheap becomes legal. Boundary: cost == Might is legal ("no more").
 *  2. "a gear" — ANY controller: your own gear is a legal (if unwise) choice; enemy gear dies to its
 *     OWNER's trash and its owner gets any "when killed" payoff (Scrapheap → P2 draws).
 *  3. "you may" (optional, 357): declining or having no legal gear leaves the board untouched; the
 *     conquer itself still scores. No prompt may be left dangling.
 *  4. Conquer Effect (383.4.c.2): only when THIS unit is present at the battlefield that was conquered —
 *     an ally conquering elsewhere, or the Demolitionist dying in the combat that conquers, gives nothing.
 *     Taking an EMPTY enemy battlefield is a conquer too (469.1) — no combat needed.
 *  5. Holding is not conquering (469.2): sitting on the battlefield through your Beginning Phase scores
 *     but never offers the kill.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-080-166";
const ORB = "ogn-090-298"; // Orb of Regret — gear, 1 energy
const SEAL = "ogn-040-298"; // Seal of Rage — gear, 0 energy
const SCRAPHEAP = "ogn-182-298"; // gear, 2 energy: "When this is played, discarded, or killed, draw 1."

/** P1's Demolitionist in base, P2 holds an EMPTY bf1; P2 owns Orb [1] + Scrapheap [2], P1 owns a Seal [0]. */
function board(meta?: { buffed?: boolean; mightModifier?: number }) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "demo", meta)
    .gear(P2, ORB, "orb")
    .gear(P2, SCRAPHEAP, "heap")
    .gear(P1, SEAL, "mySeal");
}

/** Walk into bf1, conquer, accept the "you may". Leaves the game at the gear pick (or past it). */
async function conquerAndAccept(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) {
  await game.p1.move("demo", "bf1");
  await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "demo" } });
  await game.p1.yes();
  await game.settle();
}

const pickCards = (game: { decision: () => unknown }) => {
  const d = game.decision() as { kind?: string; options?: { card?: string }[] } | null;
  return d?.kind === "pick" ? new Set((d.options ?? []).map((o) => o.card)) : undefined;
};

describe("Noxian Demolitionist (ven-080-166)", () => {
  test("registry payload: 2-cost Body unit, 1 Might; ONE optional conquer trigger that kills a gear filtered by energy cost ≤ my Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 2, might: 1 });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { target: { type: "gear" }, type: "kill" },
      optional: true,
      trigger: { event: "conquer", on: "self" },
      type: "triggered",
    });
  });

  test("parsed kill target carries a 'Energy cost no more than my Might' filter (printed text is a cost-vs-Might comparison)", async () => {
    // Expected: the gear target descriptor encodes a cost ceiling tied to the source's Might
    // (some filter / comparison mentioning cost + might). Actual: bare `{ type: "gear" }`.
    const def = (await loadDefaultCardPool()).get(CARD);
    const trig = JSON.stringify((def?.abilities ?? [])[0]);
    expect(trig).toMatch(/cost/i);
    expect(trig).toMatch(/might/i);
  });

  test("cost: 2 energy, no power; lands in base exhausted; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "demo").build();
    await game.p1.play("demo");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("demo")).toBe("base");
    expect(game.state("demo")).toMatchObject({ isExhausted: true, might: 1 });
    const poor = await scenario().resources(P1, { energy: 1, power: { body: 2 } }).hand(P1, CARD, "demo").build();
    expect(poor.p1.can("play", "demo")).toBe(false);
  });

  test("conquering an empty enemy battlefield scores 1 and asks 'you may'; accepting and picking the 1-cost enemy Orb kills it into P2's trash", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    const offered = pickCards(game);
    if (offered) {
      expect(offered.has("orb")).toBe(true);
      await game.p1.pick("orb");
      await game.settle();
    }
    expect(game.zoneOf("orb")).toBe("trash");
    expect(game.p2.trash()).toContain("orb");
    expect(game.zoneOf("heap")).toBe("base");
    expect(game.zoneOf("mySeal")).toBe("base");
    expect(game.locationOf("demo")).toBe("bf1");
    expect(game.decision()?.kind).toBe("action");
    expect(game.violations()).toEqual([]);
  });

  test("'you may': declining kills nothing, the point stays, and play returns to P1's open main phase", async () => {
    const game = await board().build();
    await game.p1.move("demo", "bf1");
    await game.settle();
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.no();
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("orb")).toBe("base");
    expect(game.zoneOf("heap")).toBe("base");
    expect(game.zoneOf("mySeal")).toBe("base");
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
  });

  test("'a gear' includes your OWN: the friendly 0-cost Seal is offered alongside the enemy Orb, and picking it kills it into P1's trash", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    const offered = pickCards(game);
    expect(offered).toBeDefined();
    expect(offered?.has("mySeal")).toBe(true);
    expect(offered?.has("orb")).toBe(true);
    await game.p1.pick("mySeal");
    await game.settle();
    expect(game.p1.trash()).toContain("mySeal");
    expect(game.zoneOf("orb")).toBe("base");
  });

  test("at 1 Might the 2-cost Scrapheap must NOT be a legal choice — only Orb [1] and Seal [0] are offered", async () => {
    // Expected: pick options == {orb, mySeal}. Actual: every gear on the board is offered (no cost ceiling).
    const game = await board().build();
    expect(game.state("demo").might).toBe(1);
    await conquerAndAccept(game);
    expect(pickCards(game)).toEqual(new Set(["orb", "mySeal"]));
  });

  test("at 1 Might with ONLY a 2-cost gear on the board there is nothing legal to kill — Scrapheap survives and P2 draws nothing", async () => {
    // Expected: after accepting (or the prompt being skipped for lack of targets) heap stays in base.
    // Actual: heap is the lone auto-picked target and is killed; P2 draws off it.
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "demo").gear(P2, SCRAPHEAP, "heap").build();
    const p2Hand = game.p2.hand().length;
    await game.p1.move("demo", "bf1");
    await game.settle({ policy: "first" });
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("heap")).toBe("base");
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  test("boundary — BUFFED to 2 Might, the 2-cost Scrapheap IS legal (cost == Might): killing it sends it to P2's trash and P2 draws 1 off its own trigger", async () => {
    const game = await board({ buffed: true }).build();
    expect(game.state("demo").might).toBe(2);
    const p2Hand = game.p2.hand().length;
    await conquerAndAccept(game);
    expect(pickCards(game)?.has("heap")).toBe(true);
    await game.p1.pick("heap");
    await game.settle();
    expect(game.p2.trash()).toContain("heap");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.points()).toBe(1);
  });

  test("conquering through COMBAT: 1-Might Demolitionist + a 4-Might ally into a 3-Might defender — defender dies, bf1 is conquered, the trigger is offered", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Picket" }, "picket")
      .unit(P1, "base", CARD, "demo")
      .unit(P1, "base", { might: 4, name: "Bruiser" }, "bruiser")
      .gear(P2, ORB, "orb")
      .script(P2, [{ allocation: { bruiser: 3 }, kind: "distribute" }])
      .build();
    await game.p1.move(["demo", "bruiser"], "bf1");
    await game.settle(); // P2 (scripted) puts all 3 on the Bruiser — the Demolitionist lives
    expect(game.zoneOf("picket")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("demo")).toBe("bf1");
    expect(game.locationOf("bruiser")).toBe("bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "demo" } });
    await game.p1.yes();
    await game.settle({ policy: "first" });
    expect(game.zoneOf("orb")).toBe("trash");
    expect(game.p1.points()).toBe(1);
  });

  test("383.4.c.2 — an ALLY conquering while the Demolitionist sits in base triggers nothing: no prompt, Orb untouched", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "demo")
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .gear(P2, ORB, "orb")
      .build();
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    expect(game.zoneOf("orb")).toBe("base");
  });

  test("the Demolitionist DYING in the combat that conquers (ally survives) was not present at the conquer — no kill is offered", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Picket" }, "picket")
      .unit(P1, "base", CARD, "demo")
      .unit(P1, "base", { might: 4, name: "Bruiser" }, "bruiser")
      .gear(P2, ORB, "orb")
      .script(P2, [{ allocation: { demo: 1 }, kind: "distribute" }])
      .build();
    await game.p1.move(["demo", "bruiser"], "bf1");
    await game.settle({ policy: "first" }); // P2 (scripted) puts its 1 damage on the 1-Might Demolitionist
    expect(game.zoneOf("picket")).toBe("trash");
    expect(game.zoneOf("demo")).toBe("trash");
    expect(game.locationOf("bruiser")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("orb")).toBe("base"); // even a permissive policy found nothing to accept
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
  });

  test("HOLDING is not conquering (469.2): the Demolitionist parked on its own battlefield through P1's next Beginning Phase scores a hold point but never prompts", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "demo")
      .gear(P2, ORB, "orb")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1); // hold
    expect(game.zoneOf("orb")).toBe("base");
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
  });
});
