/**
 * Ruling e2baa6c9db2e4378 — Defy (OGN-045 → ogn-045-298)
 *   "[Reaction] Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Shen, Kinkou (ogn-241-298) — a [Reaction] UNIT (3 + [order], 3 Might, [Shield 2], [Tank]).
 *
 * Q: Can Shen be countered by Defy when he is summoned as a reaction?
 * A: No. Defy counters a SPELL; Shen is a unit, and units (and gear) cannot be countered at all.
 *    Shen also never lingers on the chain — he arrives on the board as his play finalizes, so there
 *    is no window in which anything could target him "on the chain".
 * Rules: 425.1 (counter targets a chain item that is a spell), 355.8 (no legal target ⇒ can't play),
 *        337 / 350 (units finalize onto the board, they are not chain items).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const SHEN = "ogn-241-298";
const STUPEFY = "ogn-095-298"; // Reaction spell, 1 Energy — a legal Defy target, for the control

/** P1 attacks bf1 (P2's, one defender there) so a showdown is open and Reaction plays are legal. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .resources(P2, { energy: 4, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P2, "bf1", { might: 2, name: "Warden" }, "warden")
    .hand(P1, DEFY, "defy")
    .hand(P2, SHEN, "shen")
    .hand(P2, STUPEFY, "stupefy");
}

describe("Ruling e2baa6c9db2e4378 — Defy cannot counter Shen: a unit is not a spell and never sits on the chain", () => {
  test("Shen played as a Reaction into the showdown arrives on the board at once — the chain stays EMPTY, so nothing is there to counter", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.play("shen", { to: "bf1" });
    expect(game.chain()).toEqual([]); // he does not linger on the chain
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.state("shen").controller).toBe(P2);
  });

  test("with only Shen 'in flight' P1 has NO legal Defy: countering needs a spell on the chain (355.8)", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.play("shen", { to: "bf1" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "defy")).toBe(false);
    const attempt = await game.p1.try((p) => p.cast("defy", { targets: "shen" }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.zoneOf("shen")).toBe("battlefield-bf1"); // untouched
  });

  test("control: Defy IS legal against an actual cheap spell — proving the refusal above is about Shen being a unit, not about Defy being unplayable here", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("stupefy", { targets: "raider" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy"]);
    await game.p2.passPriority();
    expect(game.p1.can("cast", "defy")).toBe(true);
    await game.p1.cast("defy", { targets: "stupefy" });
    await game.settle();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("raider").might).toBe(4); // Stupefy never resolved
    expect(game.violations()).toEqual([]);
  });
});
