/**
 * Ruling b0323607ee473c3b — Baited Hook (OGN-242 → ogn-242-298) Gear
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish
 *    a unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its
 *    cost. Then recycle the rest."
 *
 * Q: If Baited Hook kills my ONLY unit at a battlefield I control, do I still control it for the purpose
 *    of placing the Hooked unit there?
 * A (riftjudge): No — control is lost immediately, and "the cleanup step does not handle battlefield
 *    control changes".
 *
 * RULING-CONFLICT: riftjudge b0323607ee473c3b (a restatement of 41251a7db1c8d7f0 / d1e31cb5c7f480a0 /
 * aa969395f8d0b7e9 / 382c535e1d2ee445) says control lapses the instant the last unit leaves. CR 190.4.c /
 * 323.6 say control lapses ONLY in an Open-State Cleanup — Cleanup step 4 is exactly where control is
 * settled — and the OFFICIAL Unleashed clarification 9a32c2cc829f221a uses this very card: "When Baited
 * Hook's activated ability resolves, the outstanding cleanup initiates, but I can't lose control of the
 * battlefield because the played unit is on the chain pending". Engine follows the CR — one model, in
 * `operations/battlefield-control.ts`. This file pins BOTH halves the benchmark reported: the controller
 * read while the ability is resolving, and the destination list computed off it.
 * Rules: 190.4.c / 323.6 / 309.1 (Closed while the ability resolves and the play is pending), 355.2.a.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const SKULKER = "ogn-175-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/** P1's turn. P1 controls bf1 where Bait (3) stands ALONE. Deck top→: Four (4 Might), then Skulkers. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "bf1", { might: 3, name: "Bait" }, "bait")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [{ cardType: "unit", energyCost: 4, might: 4, name: "Four" }, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER],
      ["four", "r1", "r2", "r3", "r4", "below"],
    )
    .script(P1, [
      (d) =>
        d.kind === "pick" && d.options.some((o) => o.key === "bait") && !d.options.some((o) => o.key === "four")
          ? "bait"
          : undefined,
    ]);
}

/** Activate Hook killing Bait, resolve to the look-at-5, take Four. Returns the destination decision. */
async function hookBaitTakeFour(game: Game): Promise<Decision | null> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "bait" });
  } else {
    await game.p1.activate("hook");
  }
  await game.settle();
  expect(game.zoneOf("bait")).toBe("trash");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("four");
  return game.decision();
}

describe("Ruling b0323607ee473c3b (rewritten to CR 190.4.c / 323.6 + official 9a32c2cc829f221a) — killing your last unit mid-resolution does not forfeit the battlefield", () => {
  test("half 1 — while the Hook is still resolving the state is Closed: bf1's controller is still P1 (control is settled in Cleanup step 4, not on the spot)", async () => {
    const game = await board().build();
    await hookBaitTakeFour(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("half 2 — the destination list is computed off that same controller, so battlefield-bf1 is offered alongside base and playing there is legal", async () => {
    const game = await board().build();
    const d = await hookBaitTakeFour(game);
    const dests = d?.kind === "pick" ? (d as Pick).options.map((o) => o.key).sort() : [];
    expect(dests).toEqual(["base", "battlefield-bf1"]);
    const r = await game.p1.try((p) => p.pick("battlefield-bf1"));
    expect(r.ok).toBe(true);
    await game.settle();
    expect(game.state("four")).toMatchObject({ controller: P1, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0); // control never lapsed ⇒ no re-conquer, no point
    expect(game.violations()).toEqual([]);
  });

  test("the lapse the ruling wants still happens — just one step later: send Four to base instead and bf1 goes uncontrolled at the first Open Cleanup", async () => {
    const game = await board().build();
    await hookBaitTakeFour(game);
    await game.p1.pick("base");
    await game.settle();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});
