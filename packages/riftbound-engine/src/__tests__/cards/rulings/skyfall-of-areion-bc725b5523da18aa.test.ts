/**
 * Ruling bc725b5523da18aa — Skyfall of Areion (SFD-030 → sfd-030-221) · Equipment · +2 Might
 *     "[Equip] [1][fury] … My hold effects are also conquer effects, and vice versa."
 *   × Ahri, Alluring (OGN-066 → ogn-066-298) · Champion Unit · 4 Might · "When I hold, you score 1 point."
 *
 * Q: Does Skyfall of Areion REPLACE conquer/hold effects, or does it add triggers to both situations?
 * A: It adds. The wearer's hold effects fire on holds AND on conquers, and its conquer effects fire on conquers
 *    AND on holds — nothing is swapped away. So Ahri's "when I hold, score 1" still scores on a hold and now
 *    also scores on a conquer.
 * Rules: 136.2.d / 718 (an Equipment's Effect Text is appended to the wearer), 464.2 (Conquer vs Hold),
 *        383 (each fulfilled trigger adds its own chain item).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SKYFALL = "sfd-030-221";
const AHRI_ALLURING = "ogn-066-298";

/** P1's turn 3, P1 on 1 point. P2 holds bf1 with a 1-Might Guard; Ahri (optionally wearing Skyfall) waits in P1's base. */
function conquerBoard(withSkyfall: boolean) {
  const b = scenario()
    .turn(3)
    .points(P1, 1)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Guard" }, "guard");
  return withSkyfall
    ? b
        .unit(P1, "base", AHRI_ALLURING, "ahri", { equippedWith: ["sky"] })
        .card("sky", { def: SKYFALL, meta: { attachedTo: "ahri" }, owner: P1, zone: "base" })
    : b.unit(P1, "base", AHRI_ALLURING, "ahri");
}

/** Ahri (already on P1's bf1) at the end of P2's turn, so P1's turn begins with a HOLD. */
function holdBoard(withSkyfall: boolean) {
  const b = scenario().turn(3).active(P2).points(P1, 1).battlefield("bf1", { controller: P1 });
  return withSkyfall
    ? b
        .unit(P1, "bf1", AHRI_ALLURING, "ahri", { equippedWith: ["sky"] })
        .card("sky", { def: SKYFALL, meta: { attachedTo: "ahri" }, owner: P1, zone: "bf1" })
    : b.unit(P1, "bf1", AHRI_ALLURING, "ahri");
}

/** Fight/settle through every showdown, chain and trigger-order prompt until the position is open again. */
async function runOut(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (d?.kind === "order") {
      await game.acceptTriggerOrder();
      continue;
    }
    if (d?.kind === "action" && (d.context === "showdown" || d.context === "chain")) {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
}

describe("Ruling bc725b5523da18aa — Skyfall of Areion ADDS triggers on both sides; it replaces nothing", () => {
  test("baseline: Ahri conquering bf1 without Skyfall scores only the conquest point (1 → 2) — her hold effect stays silent", async () => {
    const game = await conquerBoard(false).build();
    await game.p1.move("ahri", "bf1");
    await runOut(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("ruling: with Skyfall attached the same conquest ALSO fires her hold effect — 1 → 3", async () => {
    const game = await conquerBoard(true).build();
    await game.p1.move("ahri", "bf1");
    await runOut(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("…and nothing was replaced: on an ordinary HOLD her hold effect still scores exactly as it always did", async () => {
    const plain = await holdBoard(false).build();
    await plain.p2.endTurn();
    await plain.settle();
    const withoutSkyfall = plain.p1.points();

    const game = await holdBoard(true).build();
    await game.p2.endTurn();
    await game.settle();
    expect(withoutSkyfall).toBe(3); // 1 + the hold point + Ahri's "when I hold, score 1"
    expect(game.p1.points()).toBe(withoutSkyfall); // Skyfall added nothing here: Ahri has no conquer effect to mirror
  });

  test("the equipment is still just an equipment: it rides on Ahri and gives her its +2 [Might]", async () => {
    const game = await conquerBoard(true).build();
    expect(game.state("ahri").might).toBe(6); // 4 printed + 2 from Skyfall
    expect(game.state("ahri").attachments).toContain("sky");
  });
});
