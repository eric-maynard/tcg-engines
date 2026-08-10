/**
 * Ruling f654a76ae2f30845 — Showstopper (OGN-270 → ogn-270-298) · Spell · Body/Order · [1][rainbow]
 *     "Buff a friendly unit in your base, then move it to a battlefield."
 *   × Sett, Brawler (OGN-164 → ogn-164-298) · 4 Might · "When I'm played and when I conquer, buff me.
 *     Spend my buff: Give me +4 [Might] this turn."
 *
 * Q: Can you spend the buff Showstopper gives Sett, Brawler BEFORE it moves him to a battlefield?
 * A: No. The buff and the move are both part of Showstopper's resolution; nobody can act in the middle of a resolving
 *    spell, so there is no moment where Sett is buffed in base and you may activate "Spend my buff".
 * Rules: 359.3 (a spell's instructions resolve in order without interruption), 332 (no priority mid-resolution),
 *        151.2 (activated abilities need an Open State).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHOWSTOPPER = "ogn-270-298";
const SETT_BRAWLER = "ogn-164-298";

/** P1's turn with exactly [1] + 1 rainbow. Sett, Brawler (unbuffed, ready) in P1's base; bf1 is open; P2 keeps a unit at bf2. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", SETT_BRAWLER, "sett")
    .hand(P1, SHOWSTOPPER, "show");
}

const settActivations = (game: { p1: { legal(): readonly { key: string }[] } }) => game.p1.legal().filter((o) => o.key.startsWith("activateAbility:sett"));

describe("Ruling f654a76ae2f30845 — no window to spend Showstopper's buff on Sett before Showstopper moves him", () => {
  test("premise: unbuffed Sett in base has nothing to spend — 'Spend my buff' is not offered before the spell", async () => {
    const game = await board().build();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, location: "base", might: 4 });
    expect(settActivations(game)).toEqual([]);
  });

  test("from cast to arrival there is NEVER a decision point where Sett is buffed while still in base (let alone one offering his ability); he arrives at bf1 already buffed (5)", async () => {
    const game = await board().build();
    await game.p1.cast("show", { targets: "sett" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    let buffedInBaseWindow = 0;
    let abilityOfferedInBase = 0;
    for (let i = 0; i < 10; i++) {
      const s = game.state("sett");
      if (s.isBuffed && s.location === "base") {
        buffedInBaseWindow += 1;
        if (settActivations(game).length > 0) {
          abilityOfferedInBase += 1;
        }
      }
      if (s.location === "bf1") {
        break;
      }
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => o.key.includes("bf1"))?.key as string); // "to a battlefield"
      } else if (d?.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(buffedInBaseWindow).toBe(0);
    expect(abilityOfferedInBase).toBe(0);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, location: "bf1", might: 5 });
    expect(game.zoneOf("show")).toBe("trash");
  });

  test("after Showstopper has fully resolved Sett is at the battlefield with his buff — only THEN (Open State again) is 'Spend my buff' available, and it gives +4 there", async () => {
    const game = await board().build();
    await game.p1.cast("show", { targets: "sett", answers: ["bf1"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf1");
      await game.settle();
    }
    await game.settle(); // the non-combat showdown at the open bf1: both pass Focus → Sett conquers
    expect(game.state("sett")).toMatchObject({ isBuffed: true, location: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(settActivations(game).length).toBeGreaterThan(0);
    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, location: "bf1", might: 8 }); // 4 − buff + 4
    expect(game.violations()).toEqual([]);
  });
});
