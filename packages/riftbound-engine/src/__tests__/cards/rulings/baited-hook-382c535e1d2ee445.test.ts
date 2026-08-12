/**
 * Ruling 382c535e1d2ee445 — Baited Hook (OGN-242 → ogn-242-298) · Gear
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit
 *    from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *
 * Q: If I kill my ONLY unit (a 1-Might Poro) at a battlefield to pay for Baited Hook, may I still play the new
 *    unit to that battlefield?
 * A (riftjudge): No — you lose control of the battlefield the instant the Poro is killed; retaining control while
 *    units leave only applies during combat.
 * RULING-CONFLICT: CR 190.4.c / 323.6 (control lapses only at an OPEN-State Cleanup) and the official Unleashed
 *    clarification (ruling 9a32c2cc829f221a, which names Baited Hook itself) say YES — the ability is still
 *    resolving, so the state is Closed and the battlefield is still yours. The facets below assert the ENGINE / CR model.
 * Rules: 190.4.c / 323.6 / 309.1 (Closed while the ability resolves), 355.2.a (play destinations).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const SKULKER = "ogn-175-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/** P1's turn. A lone 1-Might Poro holds P1's bf1; Hook + [1][order] ready. Deck top: a 2-Might Wader, then filler. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "bf1", { might: 1, name: "Poro" }, "poro")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [{ cardType: "unit", energyCost: 3, might: 2, name: "Wader" }, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER],
      ["wader", "r1", "r2", "r3", "r4", "below"],
    )
    .script(P1, [(d) => (d.kind === "pick" && d.options.some((o) => o.key === "poro") && !d.options.some((o) => o.key === "wader") ? "poro" : undefined)]);
}

/** Activate the Hook killing the Poro, then take the 2-Might Wader from the five. Returns the destination decision. */
async function hookPoroTakeWader(game: Game): Promise<Decision | null> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "poro" });
  } else {
    await game.p1.activate("hook");
  }
  await game.settle();
  expect(game.zoneOf("poro")).toBe("trash");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect((d as Pick).options.map((o) => o.card ?? o.key)).toContain("wader"); // 2 ≤ 1 + 1
  await game.p1.pick("wader");
  return game.decision();
}

// RULING-CONFLICT: riftjudge 382c535e1d2ee445 says killing the lone Poro forfeits bf1 at once, so the Wader cannot
// be played there; CR 190.4.c / 323.6 + the official clarification 9a32c2cc829f221a say control only lapses at an
// OPEN-State Cleanup and the Hook is still resolving — engine follows CR.
describe("Ruling 382c535e1d2ee445 (rewritten to CR 323.6 / official 9a32c2cc829f221a) — the sacrificed Poro's battlefield is still a legal destination mid-resolution", () => {
  test("the Poro was P1's only unit there, yet bf1 is offered next to base and is still recorded as P1's", async () => {
    const game = await board().build();
    const d = await hookPoroTakeWader(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(dests).toEqual(["base", "battlefield-bf1"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("playing the Wader to bf1 keeps the battlefield — control never lapsed, so there is no conquer and no point", async () => {
    const game = await board().build();
    await hookPoroTakeWader(game);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.state("wader")).toMatchObject({ controller: P1, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // the Wader was free
    expect(game.violations()).toEqual([]);
  });

  test("sending it to base instead leaves bf1 empty, and only THEN (the first Open-State Cleanup) does control lapse", async () => {
    const game = await board().build();
    await hookPoroTakeWader(game);
    await game.p1.pick("base");
    await game.settle();
    expect(game.state("wader")).toMatchObject({ controller: P1, zone: "base" });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.deck()[0]).toBe("below"); // the other four looked-at cards were recycled
    expect(game.violations()).toEqual([]);
  });

  test("the Might cap is read off the KILLED unit: a 1-Might Poro only unlocks units of Might 2 or less", async () => {
    const game = await board().build();
    const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
    if (field) {
      await game.p1.activate("hook", 0, { targets: "poro" });
    } else {
      await game.p1.activate("hook");
    }
    await game.settle();
    const d = game.decision() as Pick;
    const offered = d.options.map((o) => o.card ?? o.key);
    expect(offered).toContain("wader"); // 2 Might
    expect(offered).not.toContain("r1"); // Shipyard Skulker is 3 Might
  });
});
