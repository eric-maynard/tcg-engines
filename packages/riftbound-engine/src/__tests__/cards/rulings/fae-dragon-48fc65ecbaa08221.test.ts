/**
 * Ruling 48fc65ecbaa08221 — Fae Dragon (SFD-101 → sfd-101-221) · 7 Might · [7][body]
 *     "When you play me, buff up to four friendly units. … When you spend a buff, play a Gold gear token exhausted."
 *   × Lee Sin, Ascetic (OGN-078 → ogn-078-298) "I can have any number of buffs."
 *   × The Boss (OGN-269 → ogn-269-298) — spends buffs one at a time (mentioned)
 *   × Call to Glory (OGN-207 → ogn-207-298) · Reaction "you may spend a buff as an additional cost … Give a unit +3 [Might] this turn."
 *
 * Q: How do Fae Dragon's buffs interact with already-buffed units / the same unit twice / buffs removed by reactions?
 * A: You choose up to four DIFFERENT units as targets when the ability is finalized. An already-buffed target is legal but
 *    gains no extra buff — except Lee Sin, Ascetic, who can stack buffs. If a reaction (Call to Glory) spends a target's
 *    buff before the ability resolves, that unit is unbuffed at resolution and DOES receive the buff.
 * Rules: 355 (targets chosen at finalization; distinct objects), 702 (buff: +1 Might, max one unless stated), 355.11
 *        (legality/State rechecked at resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FAE_DRAGON = "sfd-101-221";
const LEE_SIN = "ogn-078-298";
const CALL_TO_GLORY = "ogn-207-298";

/**
 * P1's turn with exactly [7][body]. P1's base: A, C, D (2 Might, unbuffed), B (2 Might, BUFFED → 3), Lee Sin (5, BUFFED → 6
 * when `leeBuffed`). Hand: Fae Dragon, Call to Glory (castable only for free by spending a buff — no energy left).
 */
function board(leeBuffed: boolean) {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "A" }, "a")
    .unit(P1, "base", { might: 2, name: "B" }, "b", { buffed: true })
    .unit(P1, "base", LEE_SIN, "lee", leeBuffed ? { buffed: true } : undefined)
    .unit(P1, "base", { might: 2, name: "C" }, "c")
    .unit(P1, "base", { might: 2, name: "D" }, "d")
    .hand(P1, FAE_DRAGON, "fae")
    .hand(P1, CALL_TO_GLORY, "ctg");
}

type Pick = Extract<Decision, { kind: "pick" }>;

/** Play Fae Dragon; return the target prompt of its play trigger. */
async function playDragon(game: Game): Promise<Pick> {
  await game.p1.play("fae");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d as Pick;
}

async function resolveAll(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      return;
    }
  }
}

describe("Ruling 48fc65ecbaa08221 — Fae Dragon: up to four DIFFERENT targets, buffed targets legal but capped at one buff (Lee Sin excepted), reactions can un-buff a target in time", () => {
  test("targets are chosen as the trigger is finalized: an 'up to 4' pick over distinct friendly units (already-buffed B and Lee Sin included); the chain item then carries exactly those four", async () => {
    const game = await board(true).build();
    const d = await playDragon(game);
    expect(d).toMatchObject({ max: 4, min: 0 });
    const offered = d.options.map((o) => o.card ?? o.key);
    expect(offered).toEqual(expect.arrayContaining(["a", "b", "lee", "c", "d"]));
    expect(new Set(offered).size).toBe(offered.length); // each unit once — no "same unit twice"
    await game.p1.answer(["a", "b", "lee", "c"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", targets: ["a", "b", "lee", "c"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("resolution: unbuffed A and C gain a buff (2 → 3); already-buffed B stays at ONE buff (still 3); Lee Sin, Ascetic stacks a second buff (6 → 7); untargeted D unchanged", async () => {
    const game = await board(true).build();
    expect(game.state("b")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 6 });
    await playDragon(game);
    await game.p1.answer(["a", "b", "lee", "c"]);
    await resolveAll(game);
    expect(game.state("a")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("c")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("b")).toMatchObject({ isBuffed: true, might: 3 }); // no second buff
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 7 }); // the exception
    expect(game.state("d")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.violations()).toEqual([]);
  });

  test("reaction window: P1 answers the trigger with Call to Glory, spending B's buff as its cost (B 3 → 2, D +3); when Fae Dragon's ability then resolves B is unbuffed and DOES get the buff back (→ 3) — and the spend made a Gold token", async () => {
    const game = await board(false).build(); // B is the only buffed unit, so the spent buff is B's
    await playDragon(game);
    await game.p1.answer(["a", "b", "lee", "c"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "ctg")).toBe(true); // free via "spend a buff"
    await game.p1.cast("ctg", { payOptional: true, targets: "d" });
    expect(game.state("b")).toMatchObject({ isBuffed: false, might: 2 }); // cost paid on play
    expect(game.chain().map((c) => c.cardId)).toEqual(["fae", "fae", "ctg"]); // trigger, Gold-token trigger, Call to Glory
    await resolveAll(game);
    expect(game.state("d")).toMatchObject({ isBuffed: false, might: 5, mightModifier: 3 });
    expect(game.state("b")).toMatchObject({ isBuffed: true, might: 3 }); // re-buffed by Fae Dragon at resolution
    expect(game.state("a").isBuffed).toBe(true);
    expect(game.state("c").isBuffed).toBe(true);
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 6 });
    expect(game.p1.gear().some((g) => game.state(g).name === "Gold")).toBe(true);
    // (The generic `costPaid` invariant flags Call to Glory's ignored [3] as unpaid — that is the card's text, so
    // violations are deliberately not asserted here.)
  });
});
