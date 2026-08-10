/**
 * Ruling 7a008f69fb60da30 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Kog'Maw, Caustic (OGN-190 → ogn-190-298) · 1 Might · "[Deathknell] — Deal 4 to all units at my battlefield."
 *
 * Q: What did the rules update change about Deathknell and combat cleanup?
 * A: Deathknell now works as written: a Deathknell unit can die to COMBAT damage, its trigger goes on the chain
 *    and can be responded to — e.g. a hidden Zhonya's Hourglass can be flipped in response to it. Kog'Maw's 4
 *    still lands AFTER the combat heal, and "my battlefield" is found even though Kog'Maw is already in the trash.
 * Rules: 808 (Deathknell), 466.1–466.2 (combat cleanup: heal, then finalize death triggers; they resolve before
 *        the result), 811 (play from Hidden as a Reaction), 372 (replacement effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const KOGMAW = "ogn-190-298";

/**
 * P1's turn. P2 controls bf1 with Kog'Maw (1), a vanilla 4-Might Bruiser and a Zhonya's Hourglass hidden there.
 * P1 attacks with a 4-Might Attacker: it assigns 1 to Kog'Maw + 3 to the Bruiser and takes 5 back (dies).
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P2, "bf1", { might: 4, name: "Bruiser" }, "bruiser")
    .facedown(P2, "bf1", ZHONYAS, "zh")
    .unit(P1, "base", { might: 4, name: "Attacker" }, "atk");
}

async function combatKillsKog(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("atk", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 4 });
  await game.p1.distribute({ bruiser: 3, kog: 1 });
  return game;
}

describe("Ruling 7a008f69fb60da30 — Deathknell off combat damage; Zhonya's flipped in response; damage after the heal", () => {
  test("Kog'Maw DIES TO COMBAT DAMAGE and its Deathknell is a chain item (the hidden Hourglass was not involved — it is still facedown)", async () => {
    const game = await combatKillsKog();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.state("zh")).toMatchObject({ isHidden: true, zone: "facedown-bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P2, triggered: true })]);
  });

  test("the combat heal already happened when the Deathknell is pending: the Bruiser's 3 combat damage is gone (0)", async () => {
    const game = await combatKillsKog();
    expect(game.state("bruiser").damage).toBe(0);
  });

  test("P2 gets priority on the Deathknell item and may FLIP the hidden Zhonya's in response; it enters P2's base face up while the trigger still waits", async () => {
    const game = await combatKillsKog();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "zh")).toBe(true);
    await game.p2.reveal("zh");
    expect(game.state("zh")).toMatchObject({ isHidden: false, zone: "base" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog"]);
  });

  test("the Deathknell then resolves — 'my battlefield' = bf1 although Kog'Maw is in the trash: 4 to the healed 4-Might Bruiser would kill it, so the just-flipped Hourglass dies instead and the Bruiser is healed, exhausted and recalled", async () => {
    const game = await combatKillsKog();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.reveal("zh");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    // Everybody left bf1 (attacker dead, Kog'Maw dead, Bruiser recalled): nobody holds it.
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without the flip the Deathknell's 4 (after the heal: 0 → 4) kills the 4-Might Bruiser outright, proving the damage is dealt and 'my battlefield' resolves", async () => {
    const game = await combatKillsKog();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.p2.units()).toEqual([]); // nobody was recalled
  });
});
