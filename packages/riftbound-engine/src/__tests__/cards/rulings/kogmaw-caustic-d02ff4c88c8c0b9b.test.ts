/**
 * Ruling d02ff4c88c8c0b9b — Kog'Maw, Caustic (OGN-190 → ogn-190-298) · 1 Might · "[Deathknell] — Deal 4 to all units at my battlefield."
 *   × Retreat (OGN-104 → ogn-104-298) · Reaction · Mind · 1 · "Return a friendly unit to its owner's hand. Its owner channels
 *     1 rune exhausted."
 *
 * Q: Can you react to Kog'Maw's Deathknell after combat with a spell like Retreat?
 * A: Yes — the Deathknell uses the chain, so Reactions are legal in response. But you cannot Retreat any unit that was
 *    killed in that combat (Kog'Maw included): they are already in the trash and are not units on the board.
 * Rules: 808 (Deathknell is a triggered ability → chain item), 466.1/466.2 (combat deaths' triggers finalize after cleanup),
 *        Retreat targets "a friendly unit" (on the board only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";
const RETREAT = "ogn-104-298";

/**
 * P1's turn with exactly [1] and Retreat. P2 holds bf1 with Kog'Maw (1) + Bruiser (5). P1 attacks with Atk (4) + Scout (3):
 * 7 in kills both defenders; the 6 back is assigned by P2 as 4 to Atk (dies) + 2 to Scout (survives, then healed).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P2, "bf1", { might: 5, name: "Bruiser" }, "bruiser")
    .unit(P1, "base", { might: 4, name: "Atk" }, "atk")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P1, RETREAT, "retreat");
}

/** Run the combat up to the point where Kog'Maw's Deathknell is on the chain and P1 holds priority. */
async function combatThenDeathknell(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["atk", "scout"], "bf1");
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "distribute") {
      await (d.seat === P1 ? game.p1.distribute({ bruiser: d.total - 1, kog: 1 }) : game.p2.distribute({ atk: 4, scout: d.total - 4 }));
    } else if (d?.kind === "action" && d.context === "showdown") {
      await game.seat(d.seat).passFocus();
    } else {
      break;
    }
  }
  // Combat is over: Kog'Maw, Bruiser and Atk died; Scout survived and was healed; the Deathknell is a chain item.
  expect(game.zoneOf("kog")).toBe("trash");
  expect(game.zoneOf("bruiser")).toBe("trash");
  expect(game.zoneOf("atk")).toBe("trash");
  expect(game.state("scout")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P2, triggered: true })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling d02ff4c88c8c0b9b — Kog'Maw's post-combat Deathknell is on the chain and can be answered with Retreat", () => {
  test("P1 gets priority with the Deathknell pending and Retreat (a Reaction) is legal — but its only legal target is the SURVIVING Scout: the combat-killed Atk (and Kog'Maw) are in the trash and not offered", async () => {
    const game = await combatThenDeathknell();
    expect(game.p1.can("cast", "retreat")).toBe(true);
    const offered = (game.p1.option("cast", "retreat")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["scout"]);
    expect(offered).not.toContain("atk");
    expect(offered).not.toContain("kog");
    const r = await game.p1.try((p) => p.cast("retreat", { targets: "atk" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("atk")).toBe("trash");
  });

  test("Retreat in response resolves first: Scout → P1's hand, P1 channels 1 rune exhausted; then the Deathknell resolves with nobody left at bf1 to hit", async () => {
    const game = await combatThenDeathknell();
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("retreat", { targets: "scout" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog", "retreat"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Retreat
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog"]);
    await game.settle(); // Deathknell: 4 to all units at bf1 — none
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toContain("scout");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no reaction: the Deathknell's 4 kills the (healed, 3-Might) Scout at Kog'Maw's battlefield", async () => {
    const game = await combatThenDeathknell();
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("retreat")).toBe("hand");
  });
});
