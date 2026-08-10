/**
 * Ruling 41251a7db1c8d7f0 — Baited Hook (OGN-242 → ogn-242-298) Gear "[1][order], [Exhaust]: Kill a friendly unit. Look at the
 *   top 5 cards of your Main Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and
 *   play it, ignoring its cost. Then recycle the rest."
 *   × Cruel Patron (OGN-208 → ogn-208-298) — the analogous, CR-documented case (sacrifice your only unit there → can't be
 *     played there).
 *
 * Q: If Baited Hook kills my ONLY unit at a battlefield I control, can I play the Hooked unit to that same battlefield?
 * A: No. By the time you play the unit you no longer control that battlefield (your only unit there is dead), so it is not
 *    a legal destination — just like Cruel Patron.
 * Rules: 188 / 323.6 (control of a battlefield requires your units there), 341.2 (units are played to your base or a
 *        battlefield you control), CR example on Cruel Patron.
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

describe("Ruling 41251a7db1c8d7f0 — Hooking away your only unit at a battlefield forfeits it as the play destination", () => {
  test("Bait was P1's ONLY unit at bf1: after the kill, bf1 is not offered for Four — it can only land in base — and P1 no longer controls bf1", async () => {
    const game = await board(false).build();
    const d = await hookBaitTakeFour(game);
    if (d?.kind === "pick" && d.source?.pendingChoiceType === "choose-destination") {
      expect(d.seat).toBe(P1);
      const dests = d.options.map((o) => o.key);
      expect(dests).not.toContain("battlefield-bf1");
      expect(dests).toContain("base");
      await game.p1.pick("base");
    }
    await game.settle();
    expect(game.state("four")).toMatchObject({ controller: P1, zone: "base" });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // Four was free
    expect(game.p1.deck()[0]).toBe("below"); // the other four looked-at cards were recycled
    expect(game.violations()).toEqual([]);
  });

  test("a forced attempt to put Four onto bf1 anyway is rejected; Four ends in base", async () => {
    const game = await board(false).build();
    const d = await hookBaitTakeFour(game);
    if (d?.kind === "pick" && d.source?.pendingChoiceType === "choose-destination") {
      const r = await game.p1.try((p) => p.pick("battlefield-bf1"));
      expect(r.ok).toBe(false);
      if (game.decision()?.kind === "pick") {
        await game.p1.pick("base");
      }
    }
    await game.settle();
    expect(game.zoneOf("four")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
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
