/**
 * Ruling efdad0188d235049 — Kayn, Unleashed (OGN-189 → ogn-189-298) · 6 Might · 6 + [chaos]
 *   "[Ganking] (I can move from battlefield to battlefield.)
 *    If I have moved twice this turn, I don't take damage."
 *
 * Q: What happens when an attacker attacks a STUNNED unit that has more Might than the attacker?
 * A: The stunned defender deals no combat damage, so the attacker lives; but the attacker cannot deal
 *    enough to kill it either, so a defender remains and the attacker is recalled to base. The
 *    defender does not move — it was not killed — and keeps the battlefield.
 * Rules: 423.1.b (a stunned unit contributes no Might to combat damage), 423.1.c (still needs damage ≥
 *        its full Might to die), 466.4 (any defender remaining ⇒ the attackers are recalled).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KAYN = "ogn-189-298";

/** P2 holds bf1 with an 8-Might Colossus that is already stunned; Kayn (6) attacks from base. */
function board(opts: { stunned: boolean }) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", KAYN, "kayn")
    .unit(P2, "bf1", { might: 8, name: "Colossus" }, "colossus", opts.stunned ? { stunned: true } : undefined);
}

describe("Ruling efdad0188d235049 — attacking a stunned, bigger defender: attacker survives, bounces home, defender stays", () => {
  test("the attacker survives untouched — the stunned defender contributes no combat damage", async () => {
    const game = await board({ stunned: true }).build();
    await game.p1.move("kayn", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("kayn")).not.toBe("trash");
    expect(game.state("kayn").damage).toBe(0);
  });

  test("the attacker cannot kill the 8-Might defender with 6, so the defender stays put and keeps the battlefield", async () => {
    const game = await board({ stunned: true }).build();
    await game.p1.move("kayn", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
    expect(game.locationOf("colossus")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P2, contested: false });
    expect(game.p1.points()).toBe(0);
  });

  test("the attacker returns to base (a defender remained ⇒ recall, not a conquer)", async () => {
    const game = await board({ stunned: true }).build();
    await game.p1.move("kayn", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.locationOf("kayn")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: without the stun the same attack simply kills the attacker — the stun is what saves it", async () => {
    const game = await board({ stunned: false }).build();
    await game.p1.move("kayn", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("kayn")).toBe("trash"); // 8 damage into 6 Might
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
  });
});
