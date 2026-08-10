/**
 * Ruling 41251a7db1c8d7f0 — Baited Hook (OGN-242 → ogn-242-298) Gear "[1][order], [Exhaust]: Kill a friendly unit. Look at the
 *   top 5 cards of your Main Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and
 *   play it, ignoring its cost. Then recycle the rest."
 *   × Cruel Patron (OGN-208 → ogn-208-298) — the analogous, CR-documented case (sacrifice your only unit there → can't be
 *     played there).
 *
 * Q: If Baited Hook kills my ONLY unit at a battlefield I control, can I play the Hooked unit to that same battlefield?
 * A (riftjudge): No — you no longer control that battlefield. RULING-CONFLICT: the current CR (190.4.c / 323.6: control
 *    lapses only in an OPEN-State Cleanup) and the official Unleashed clarification (ruling 9a32c2cc829f221a, which uses
 *    Baited Hook AND Cruel Patron as its examples) say YES; the 2025 Cruel Patron CR example this ruling cites was removed.
 *    The facets below are written to the CR model.
 * Rules: 190.4.c / 323.6 / 309.1 (Closed while the ability resolves / the play is pending), 355.2.a.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const SKULKER = "ogn-175-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn. P1 controls bf1 where Bait (3) stands — alone unless `companion`. P1: Hook in base + exactly [1][order].
 * Deck top→: Four (4-Might unit), then Skulkers.
 */
function board(companion: boolean) {
  const s = scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "bf1", { might: 3, name: "Bait" }, "bait")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(P1, [{ cardType: "unit", energyCost: 4, might: 4, name: "Four" }, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER], ["four", "r1", "r2", "r3", "r4", "below"]);
  if (companion) {
    s.unit(P1, "bf1", { might: 1, name: "Companion" }, "comp");
  }
  return s.script(P1, [(d) => (d.kind === "pick" && d.options.some((o) => o.key === "bait") && !d.options.some((o) => o.key === "four") ? "bait" : undefined)]);
}

/** Activate Hook killing Bait, resolve to the look-at-5, take Four. Returns whatever is asked next (destination) or null. */
async function hookBaitTakeFour(game: Game): Promise<Decision | null> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "bait" });
  } else {
    await game.p1.activate("hook");
  }
  await game.settle(); // priorities (+ scripted "bait" if the kill target is asked on resolution)
  expect(game.zoneOf("bait")).toBe("trash");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect((d as Pick).options.map((o) => o.card ?? o.key)).toContain("four"); // 4 ≤ 3+1
  await game.p1.pick("four");
  return game.decision();
}

// RULING-CONFLICT: riftjudge 41251a7db1c8d7f0 (and d1e31cb5c7f480a0 / aa969395f8d0b7e9 / 382c535e1d2ee445) says the
// Hooked unit cannot be played to the battlefield the killed Bait held alone. CR 190.4.c / 323.6 (control only lapses
// in an OPEN-State Cleanup) and the OFFICIAL Unleashed clarification (ruling 9a32c2cc829f221a: "When Baited Hook's
// activated ability resolves, the outstanding cleanup initiates, but I can't lose control of the battlefield because
// the played unit is on the chain pending"; same for Cruel Patron / Arcane Shift / Glasc Mixologist; also
// 73bea4deea8e8273 / 2abf29f1844c262f) say the opposite: the ability is resolving / the play is pending, the turn is
// Closed, P1 still controls bf1 and MAY play the unit there. Engine follows CR — battlefield control timing model,
// operations/battlefield-control.ts. Control lapses only once everything has resolved and bf1 is still empty.
describe("Ruling 41251a7db1c8d7f0 (rewritten to CR 323.6 / official 9a32c2cc829f221a) — Hooking away your only unit at a battlefield does NOT forfeit it as the play destination mid-resolution", () => {
  test("Bait was P1's ONLY unit at bf1: while Hook resolves the state is Closed, so bf1 is STILL P1's and IS offered for Four alongside base; choosing base leaves bf1 empty and it lapses to uncontrolled at the next Open Cleanup", async () => {
    const game = await board(false).build();
    const d = await hookBaitTakeFour(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(dests).toEqual(["base", "battlefield-bf1"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // rule 309.1 / 323.6 — Closed: control kept
    await game.p1.pick("base");
    await game.settle();
    expect(game.state("four")).toMatchObject({ controller: P1, zone: "base" });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull(); // rule 323.6 — lapsed once Open and empty
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // Four was free
    expect(game.p1.deck()[0]).toBe("below"); // the other four looked-at cards were recycled
    expect(game.violations()).toEqual([]);
  });

  test("choosing bf1 is legal: Four lands on bf1 and P1 keeps the battlefield — control never lapsed (no conquer, no point)", async () => {
    const game = await board(false).build();
    const d = await hookBaitTakeFour(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const r = await game.p1.try((p) => p.pick("battlefield-bf1"));
    expect(r.ok).toBe(true);
    await game.settle();
    expect(game.state("four")).toMatchObject({ controller: P1, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with a Companion still holding bf1, P1 keeps control and bf1 IS a legal destination — Four can be played there", async () => {
    const game = await board(true).build();
    const d = await hookBaitTakeFour(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(dests).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.state("four")).toMatchObject({ controller: P1, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
