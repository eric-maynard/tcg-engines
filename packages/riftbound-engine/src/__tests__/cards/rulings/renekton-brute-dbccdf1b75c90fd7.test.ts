/**
 * Ruling dbccdf1b75c90fd7 — Renekton, Brute (VEN-177 → ven-177-166) · Champion Unit · Body · [5] · 4 Might
 *     "[1]: Give me +1 [Might] this turn. When my Might becomes 10 or more, empower me. [Empowered] I have [Ganking] and
 *      [Deflect]."
 *
 * Q: Can I pay 1 energy to give Renekton +1 Might on the enemy's turn?
 * A: No. "[1]: Give me +1 [Might] this turn" is a plain activated ability (no [Reaction]/[Action]) — usable only on your
 *    own turn, Main Phase, Open State. Only his TRIGGERED ability ("When my Might becomes 10 or more, empower me") can
 *    fire on the enemy turn — but you can't pay the [1] off-turn to get there.
 * Rules: 145.2 / 381 (activated ability timing), 383 (triggered abilities fire whenever their condition is met).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RENEKTON = "ven-177-166";

/** P1's [0] Reaction pump (inline): +1 Might this turn — a legal way to touch his Might on P2's turn. */
const PUMP = {
  abilities: [{ effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Pump",
  timing: "reaction",
} as const;
/** Something for P2 to do on its turn so P1 receives priority. */
const P2_SPELL = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Ping",
  timing: "action",
} as const;

describe("Ruling dbccdf1b75c90fd7 — Renekton's [1]: +1 Might is own-turn only; only his empower TRIGGER can happen off-turn", () => {
  test("own turn, Open State: paying [1] activates it — Renekton 4 → 5 this turn", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", RENEKTON, "renekton").build();
    expect(game.p1.can("activate", "renekton")).toBe(true);
    await game.p1.activate("renekton");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("renekton")).toMatchObject({ might: 5, mightModifier: 1 });
  });

  test("enemy turn: with [1] floating P1 is never offered the ability — not in P2's open Main Phase, not with priority on P2's chain, not with Focus in P2's showdown", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", RENEKTON, "renekton")
      .unit(P2, "base", { might: 2, name: "Poker" }, "poker")
      .hand(P2, P2_SPELL, "ping")
      .build();
    // P2's open main phase: P1 has no decision at all, and the option is not in P1's menu.
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("activate", "renekton")).toBe(false);
    // P2 opens a chain → P1 gets priority (Closed State): still not activatable (no [Reaction]).
    await game.p2.cast("ping", { targets: "renekton" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "renekton")).toBe(false);
    const r = await game.p1.try((p) => p.activate("renekton"));
    expect(r.ok).toBe(false);
    await game.settle();
    // P2 attacks bf1 → showdown; when P1 holds Focus (Showdown Open State) it is still not offered (no [Action]).
    await game.p2.move("poker", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "renekton")).toBe(false);
    expect(game.p1.energy()).toBe(1); // never spent
    expect(game.state("renekton").mightModifier).toBe(0);
  });

  test("the TRIGGER does work off-turn: on P2's turn Renekton sits at 9 (4 +5); P1's Reaction pump makes it 10 → 'When my Might becomes 10 or more' fires and empowers him (Ganking + Deflect)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .unit(P1, "base", RENEKTON, "renekton", { mightModifier: 5 })
      .unit(P2, "base", { might: 2, name: "Poker" }, "poker")
      .hand(P2, P2_SPELL, "ping")
      .hand(P1, PUMP, "pump")
      .build();
    expect(game.state("renekton")).toMatchObject({ isEmpowered: false, might: 9 });
    expect(game.state("renekton").keywords).not.toContain("Ganking");
    await game.p2.cast("ping", { targets: "poker" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "renekton")).toBe(false); // still no paying [1] here…
    await game.p1.cast("pump", { targets: "renekton" }); // …but a Reaction can raise his Might
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("renekton")).toMatchObject({ isEmpowered: true, might: 10 });
    expect(game.state("renekton").keywords).toEqual(expect.arrayContaining(["Ganking", "Deflect"]));
    expect(game.violations()).toEqual([]);
  });
});
