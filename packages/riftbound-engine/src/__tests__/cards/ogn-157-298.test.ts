/**
 * Udyr, Wildman — ogn-157-298 · Champion Unit · Body · 6 energy + [body] · 6 Might · Udyr
 *
 *   Spend my buff: Choose one you've not chosen this turn —
 *     • Deal 2 to a unit at a battlefield.
 *     • Stun a unit at a battlefield.
 *     • Ready me.
 *     • Give me [Ganking] this turn.
 *
 * "Spend my buff" is the activation cost (rule 702.2.b: spending a buff removes the buff
 * counter). Each mode may be picked at most once per turn.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-157-298";
const STAND_UNITED = "ogn-053-298"; // [Action] 3 energy: Buff a friendly unit.

function board(buffed = true) {
  return scenario()
    .resources(P1, { energy: 6 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4 }, "foe")
    .unit(P2, "base", { might: 4 }, "home")
    .unit(P1, "base", CARD, "udyr", { buffed, exhausted: true })
    .hand(P1, STAND_UNITED, "su");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

/** Activate Udyr and return the mode prompt. */
async function openModes(game: Built): Promise<PickDecision> {
  await game.p1.activate("udyr");
  await game.settle();
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d;
}

/** Activate Udyr, pick the mode whose label contains `label`, then answer an optional target. */
async function useMode(game: Built, label: string, target?: string) {
  const d = await openModes(game);
  const opt = d.options.find((o) => o.label.includes(label));
  expect(opt).toBeDefined();
  await game.p1.pick(opt!.key);
  await game.settle();
  if (target && game.decision()?.kind === "pick") {
    await game.p1.pick(target);
    await game.settle();
  }
}

describe("Udyr, Wildman (ogn-157-298)", () => {
  test("costs 6 energy + 1 body; enters the base as a 6-Might unit; unaffordable without the body power", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { body: 1 } }).hand(P1, CARD, "udyr").build();
    await game.p1.play("udyr");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("udyr")).toBe("base");
    expect(game.state("udyr").might).toBe(6);
    const noBody = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "udyr").build();
    expect(noBody.p1.can("play", "udyr")).toBe(false);
  });

  test("the ability offers the four printed modes and costs no energy/power", async () => {
    const game = await board().build();
    const d = await openModes(game);
    expect(d.options.map((o) => o.label)).toEqual(["Deal 2", "Stun", "Ready me", "Ganking"]);
    expect(game.p1.energy()).toBe(6);
  });

  test("cost 'Spend my buff' — activating removes Udyr's buff (7 → 6 Might), and an unbuffed Udyr cannot activate (rule 702.2.b)", async () => {
    const game = await board().build();
    expect(game.state("udyr")).toMatchObject({ isBuffed: true, might: 7 });
    await game.p1.activate("udyr");
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, might: 6 });
    const unbuffed = await board(false).build();
    expect(unbuffed.p1.can("activate", "udyr")).toBe(false);
  });

  test("mode: Deal 2 to a unit at a battlefield (units in a base are not offered)", async () => {
    const game = await board().build();
    const d = await openModes(game);
    await game.p1.pick(d.options.find((o) => o.label.includes("Deal 2"))!.key);
    await game.settle();
    const t = game.decision();
    if (t?.kind === "pick") {
      expect(t.options.map((o) => o.key)).toEqual(["foe"]);
      await game.p1.pick("foe");
      await game.settle();
    }
    expect(game.state("foe").damage).toBe(2);
    expect(game.state("home").damage).toBe(0);
  });

  test("mode: Stun a unit at a battlefield", async () => {
    const game = await board().build();
    await useMode(game, "Stun", "foe");
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.state("home").isStunned).toBe(false);
  });

  test("mode 'Ready me' readies an exhausted Udyr", async () => {
    // Expected: Udyr (exhausted) becomes ready after the mode resolves. Actual: he stays exhausted.
    const game = await board().build();
    expect(game.state("udyr").isExhausted).toBe(true);
    await useMode(game, "Ready");
    expect(game.state("udyr").isReady).toBe(true);
  });

  test("mode: Give me [Ganking] this turn — gone next turn", async () => {
    const game = await board().build();
    await useMode(game, "Ganking");
    expect(game.state("udyr").grantedKeywords).toEqual([{ duration: "turn", keyword: "Ganking", value: undefined }]);
    await game.advanceTurn();
    expect(game.state("udyr").keywords).not.toContain("Ganking");
  });

  test("'not chosen this turn' — after picking Ganking, a re-buffed Udyr is offered only the other three modes", async () => {
    // Expected: second activation this turn lists Deal 2 / Stun / Ready me but not Ganking.
    // Actual: all four modes are offered again.
    const game = await board().build();
    await useMode(game, "Ganking");
    await game.p1.cast("su", { targets: "udyr" });
    await game.settle();
    expect(game.state("udyr").isBuffed).toBe(true);
    const d = await openModes(game);
    const labels = d.options.map((o) => o.label);
    expect(labels.some((l) => l.includes("Ready"))).toBe(true);
    expect(labels.some((l) => l.includes("Ganking"))).toBe(false);
    expect(labels).toHaveLength(3);
  });

  test("all four modes in one turn — the fourth activation auto-locks the sole remaining mode (chain items never share effect nodes with the card registry)", async () => {
    // rule 355.8 / 402.2 — with one mode left there is nothing to ask, so it is
    // locked in place. Regression: the lock used to write onto the ability
    // effect owned by the shared card registry, which immer had deep-frozen
    // while resolving the FIRST activation → "not extensible" + a dead chain.
    const game = await scenario()
      .resources(P1, { energy: 9 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4 }, "foe")
      .unit(P1, "base", CARD, "udyr", { buffed: true, exhausted: true })
      .hand(P1, STAND_UNITED, "su1")
      .hand(P1, STAND_UNITED, "su2")
      .hand(P1, STAND_UNITED, "su3")
      .build();

    const rebuff = async (alias: string) => {
      await game.p1.cast(alias, { targets: "udyr" });
      await game.settle();
      expect(game.state("udyr").isBuffed).toBe(true);
    };

    await useMode(game, "Ganking");
    await rebuff("su1");
    await useMode(game, "Ready");
    await rebuff("su2");
    await useMode(game, "Stun", "foe");
    await rebuff("su3");

    // Only "Deal 2" is left: no menu, it resolves against the sole legal target.
    await game.p1.activate("udyr");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("foe");
      await game.settle();
    }
    expect(game.state("foe").damage).toBe(2);
    expect(game.state("foe").isStunned).toBe(true);
  });

  // DESIGN (DESIGN.md §Paying costs): "Spend my buff:" is the whole activation cost — enumerated with an
  // EMPTY pool and charging no energy/power.
  test("DESIGN (buff-spend activation enumerated with an empty pool): a buffed Udyr with 0 energy / 0 power is offered the activation; using it charges nothing but the buff", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4 }, "foe")
      .unit(P1, "base", CARD, "udyr", { buffed: true, exhausted: true })
      .build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("activate", "udyr")).toBe(true);
    await game.p1.activate("udyr");
    expect(game.state("udyr").isBuffed).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // the mode menu, paid for by the buff alone
  });
});
