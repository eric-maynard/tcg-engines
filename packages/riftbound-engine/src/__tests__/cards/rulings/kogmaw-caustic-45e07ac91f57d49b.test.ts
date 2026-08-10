/**
 * Ruling 45e07ac91f57d49b — Kog'Maw, Caustic (OGN-190 → ogn-190-298) · Champion Unit · Chaos · [3][chaos] · 1 Might
 *   "[Deathknell] — Deal 4 to all units at my battlefield."
 *
 * Q: When Kog'Maw dies in combat, does the (surviving) unit heal before the Deathknell trigger?
 * A: Yes. Combat damage is dealt; the Combat Cleanup identifies the dead (Kog'Maw's Deathknell becomes pending) and
 *    heals all units; only then do players get to respond to the Deathknell and it resolves. So a 5-Might unit that
 *    took Kog'Maw's 1 in combat is healed first and survives the 4 (1 + 4 never add up).
 * Rules: 465.2 (combat damage), 466.1.a.1 (cleanup heals all units), 466.2 (chain items from the cleanup resolve
 *        after it), 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";

/** P1's turn. P2's Kog'Maw (1) alone holds bf1; P1's 5-Might Bruiser attacks from base. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser");
}

/** Attack, both pass Focus → combat damage is dealt and the Combat Cleanup runs; stops with the Deathknell pending. */
async function combatKillsKog(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("bruiser", "bf1");
  expect(game.chain()).toEqual([]); // no attack/defend triggers here
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

describe("Ruling 45e07ac91f57d49b — the combat heal happens BEFORE Kog'Maw's Deathknell resolves", () => {
  test("1–2. combat damage: the Bruiser's 5 kills Kog'Maw (1); Kog'Maw's Deathknell is now a triggered item on the chain", async () => {
    const game = await combatKillsKog();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P2, triggered: true })]);
  });

  test("3. healing: while that Deathknell is still pending, the Bruiser has ALREADY been healed of Kog'Maw's 1 combat damage (damage 0)", async () => {
    const game = await combatKillsKog();
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog"]);
    expect(game.state("bruiser")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("4. players may respond (a priority round on the item), then it resolves: 4 damage on the freshly healed 5-Might Bruiser — it SURVIVES (1 + 4 never combine) and conquers bf1", async () => {
    const game = await combatKillsKog();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    const seats = new Set<string>();
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      seats.add(game.actingSeat() as string);
      await game.acting().passPriority();
    }
    expect([...seats].sort()).toEqual([P1, P2]); // both got a window
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("bruiser")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a 4-Might attacker is likewise healed first but 4 ≥ 4 — the Deathknell alone kills it and nobody holds bf1", async () => {
    const game = await board().unit(P1, "base", { might: 4, name: "Scrapper" }, "scrapper").build();
    await game.p1.move("scrapper", "bf1");
    await game.settle();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("scrapper")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
  });
});
