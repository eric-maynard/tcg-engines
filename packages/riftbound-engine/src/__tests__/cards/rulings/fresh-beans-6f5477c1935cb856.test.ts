/**
 * Ruling 6f5477c1935cb856 — Fresh Beans (UNL-011 → unl-011-219) · Gear · Fury · 2
 *     "When you play a unit during a showdown, you may exhaust this to draw 1."
 *   × Rengar, Pouncing (sfd-025-221) · 3 + [fury] · "[Reaction] [Assault 2] I can be played to a battlefield you're attacking."
 *
 * Q: I move a unit to an OPEN battlefield (starting a non-combat showdown) and then play Rengar at Reaction speed to a
 *    DIFFERENT battlefield. Can I exhaust Fresh Beans to draw?
 * A: Yes. Moving onto an open battlefield starts a (non-combat) showdown; a unit played while that showdown is active —
 *    wherever it is played — satisfies "play a unit during a showdown", so Fresh Beans triggers and may be exhausted to draw 1.
 * Rules: 344.1 (non-combat showdown on an open battlefield), 345–347 (Focus / Reaction plays during a showdown),
 *        813 (Reaction unit: "including to a battlefield you control"), 383.3.b (the exhaust is paid when opting in).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FRESH_BEANS = "unl-011-219";
const RENGAR_POUNCING = "sfd-025-221";

/**
 * P1's turn: Fresh Beans (ready) in base, Scout (2) ready in base, Rengar in hand with exactly 3 + [fury];
 * bf1 is OPEN (nobody, empty); bf2 is P1's (Holder 1); P2 holds bf3. Known deck top d1.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bf3", { might: 4, name: "Their Guy" }, "theirs")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .gear(P1, FRESH_BEANS, "beans")
    .hand(P1, RENGAR_POUNCING, "rengar")
    .deck(P1, ["ogn-175-298"], ["d1"]);
}

/** Scout walks onto the open bf1 → non-combat showdown with P1 holding Focus. */
async function openShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: null });
  expect(game.state("scout").combatRole ?? null).toBeNull(); // non-combat: no attacker/defender
  return game;
}

describe("Ruling 6f5477c1935cb856 — a Reaction unit played elsewhere during a NON-COMBAT showdown still feeds Fresh Beans", () => {
  test("the Standard Move onto the open bf1 starts a non-combat showdown, and inside it Rengar (Reaction) is playable — to base or to P1's OTHER battlefield bf2 (not to the not-yet-controlled bf1)", async () => {
    const game = await openShowdown();
    expect(game.p1.can("play", "rengar")).toBe(true);
    const dests = [...(game.p1.option("play", "rengar")?.fields.find((f) => f.arg === "to")?.options ?? [])].map(String).sort();
    expect(dests).toEqual(["base", "battlefield-bf2"]);
    expect(dests).not.toContain("battlefield-bf1");
  });

  test("playing Rengar to bf2 during that showdown triggers Fresh Beans: P1 is asked 'exhaust this to draw 1?' (its controller, at finalization)", async () => {
    const game = await openShowdown();
    await game.p1.play("rengar", { to: "bf2" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.locationOf("rengar")).toBe("bf2");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "beans" }, timing: "FIN" });
    expect(game.state("beans").isReady).toBe(true); // nothing paid before the answer
  });

  test("yes → Fresh Beans is exhausted and, when the trigger resolves, P1 draws d1; the non-combat showdown then finishes with Scout conquering bf1", async () => {
    const game = await openShowdown();
    await game.p1.play("rengar", { to: "bf2" });
    await game.p1.yes();
    expect(game.state("beans").isExhausted).toBe(true); // cost paid on opting in (383.3.b)
    expect(game.chain().some((c) => c.cardId === "beans" && c.triggered && c.controller === P1)).toBe(true);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("rengar")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("'you may' — declining leaves Fresh Beans ready and draws nothing", async () => {
    const game = await openShowdown();
    await game.p1.play("rengar", { to: "bf2" });
    await game.p1.no();
    await game.settle();
    expect(game.state("beans").isReady).toBe(true);
    expect(game.p1.hand()).toEqual([]);
  });

  test("contrast — the same Rengar played in P1's plain main phase (no showdown running) does not trigger Fresh Beans", async () => {
    const game = await board().build();
    await game.p1.play("rengar", { to: "base" });
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("base");
    expect(game.state("beans").isReady).toBe(true);
    expect(game.p1.hand()).toEqual([]);
  });
});
