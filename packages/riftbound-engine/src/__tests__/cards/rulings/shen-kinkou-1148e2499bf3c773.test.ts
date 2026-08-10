/**
 * Ruling 1148e2499bf3c773 — Shen, Kinkou (OGN-241 → ogn-241-298) "[Reaction] [Shield 2] [Tank]" (3-Might unit
 *   playable at Reaction speed, including to a battlefield you control)
 *   × Kha'Zix, Mutating Horror (UNL-143 → unl-143-219) "[Ambush] When I attack or defend, if an enemy unit is
 *     alone here, give me +2 [Might] this turn and gain 2 XP."
 *
 * Q: Opponent has one unit at the battlefield; I attack with one unit; they react with Shen. Can I answer
 *    with Kha'Zix (Ambush), and does Kha'Zix get the +2?
 * A: You can play Kha'Zix, but he does NOT get +2 / XP: Shen was appended first and is finalized first, so
 *    when Kha'Zix enters and gains Attacker there are already TWO enemy units — the "alone" condition is
 *    false and the ability never triggers. (Contrast: if Kha'Zix enters first against the lone unit, his
 *    trigger is already on the chain and a later Shen does not revoke it.)
 * Rules: 337.1.b (pending items finalize in append order), 359.2 (a permanent enters as it is finalized),
 *        383.4.e.2.b / 383.2.a.1 (intervening "if" checked when the designation is gained), 740.2.a (alone),
 *        822 (Ambush), 464.2.c.3.a (late arrivals gain Attacker/Defender at the next cleanup).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHEN = "ogn-241-298";
const KHAZIX = "unl-143-219";

/**
 * P1's turn 3. P2 holds bf1 with ONE unit, Defender (2). P1's Attacker (5) is in base. P1 holds Kha'Zix with
 * exactly [4][chaos]; P2 holds Shen with exactly [3][order].
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .resources(P2, { energy: 3, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P1, "base", { might: 5, name: "Attacker" }, "atk")
    .hand(P1, KHAZIX, "kz")
    .hand(P2, SHEN, "shen");
}

describe("Ruling 1148e2499bf3c773 — Shen lands before an answering Kha'Zix, so 'an enemy unit is alone here' is already false", () => {
  test("P1 attacks with one unit; P1 passes Focus; P2 reacts with Shen to ITS battlefield — Shen is finalized onto bf1 at once as a second Defender", async () => {
    const game = await board().build();
    await game.p1.move("atk", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.p2.can("play", "shen")).toBe(true);
    await game.p2.play("shen", { to: "bf1" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("shen")).toMatchObject({ combatRole: "defender", location: "bf1" });
    expect(game.p2.units("bf1").sort()).toEqual(["def", "shen"]);
  });

  test("ruling 1148e2499bf3c773 — P1 CAN then play Kha'Zix into bf1 via Ambush (he becomes an Attacker), but with Defender + Shen there NO Kha'Zix trigger is put on the chain: he stays 4 Might and P1 gains no XP", async () => {
    const game = await board().build();
    await game.p1.move("atk", "bf1");
    await game.p1.passFocus();
    await game.p2.play("shen", { to: "bf1" });
    if (game.actingSeat() === P2) {
      await game.p2.pass();
    }
    expect(game.p1.can("play", "kz")).toBe(true);
    await game.p1.play("kz", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.state("kz")).toMatchObject({ combatRole: "attacker", location: "bf1", might: 4 });
    // Two enemy units here → the intervening "if" is false → the ability never triggers.
    expect(game.chain().some((c) => c.cardId === "kz")).toBe(false);
    expect(game.p1.xp()).toBe(0);
    await game.settle(); // combat: 5 + 4 = 9 into Shen (Tank, 5 as defender) then Defender (2); 7 back kills the Attacker
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("kz")).toBe("battlefield-bf1");
    expect(game.state("kz")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.zoneOf("shen")).toBe("trash");
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast (the FAQ line the ruling distinguishes) — Kha'Zix enters FIRST against the lone Defender: his trigger goes on the chain; P2 answering with Shen does not revoke it → Kha'Zix is 6 this turn and P1 gains 2 XP", async () => {
    const game = await board().build();
    await game.p1.move("atk", "bf1");
    await game.p1.play("kz", { to: "bf1" });
    expect(game.state("kz")).toMatchObject({ combatRole: "attacker", location: "bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kz", controller: P1, triggered: true })]);
    expect(game.state("kz").might).toBe(4); // not yet resolved
    await game.p1.passPriority();
    expect(game.p2.can("play", "shen")).toBe(true);
    await game.p2.play("shen", { to: "bf1" });
    expect(game.p2.units("bf1").sort()).toEqual(["def", "shen"]);
    // The trigger is still there despite the second enemy unit.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kz", triggered: true })]);
    await game.settle(); // trigger resolves (+2 / 2 XP), then the showdown passes out and combat resolves
    expect(game.p1.xp()).toBe(2);
    expect(game.state("kz")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.zoneOf("kz")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
