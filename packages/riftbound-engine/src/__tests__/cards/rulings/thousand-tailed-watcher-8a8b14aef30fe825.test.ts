/**
 * Ruling 8a8b14aef30fe825 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) × Ruined Rex (UNL-067 → unl-067-219)
 *
 *   Thousand-Tailed Watcher — Unit · Mind · 7 · 7 Might ("When you play me, give enemy units -3 [Might] this turn…")
 *   Ruined Rex — Unit · Mind · 6 · 6 Might — "[Deathknell] Deal 4 to an enemy unit."
 *
 * Q: Watcher (7) attacks my Rex (6). Rex deals 6 to Watcher and dies. Does Rex's Deathknell (4) then kill the
 *    Watcher carrying 6 combat damage, or is there a combat cleanup first?
 * A: The Watcher survives. Rex's Deathknell goes on the chain as Rex dies, but combat cleanup — including healing
 *    all surviving units — completes before that pending trigger resolves. The 4 damage lands on a freshly healed
 *    7-Might Watcher.
 * Rules: 808.1.d.2–3 (Deathknell pending across the kill step), 461.1.a.1 / 323 (combat cleanup heals), 437.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const RUINED_REX = "unl-067-219";

/** P2's turn. P1's Rex (6) holds bf1; P2's Watcher (7) is ready in base. No other units: Watcher is the only enemy for the Deathknell. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RUINED_REX, "rex")
    .unit(P2, "base", WATCHER, "watcher");
}

/** Attack and pass Focus both ways so combat damage is dealt; stop at the first chain priority window (the Deathknell). */
async function attackToDeathknell(game: Game): Promise<void> {
  await game.p2.move("watcher", "bf1");
  expect(game.state("watcher").combatRole).toBe("attacker");
  await game.p2.passFocus();
  await game.p1.passFocus();
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("watcher");
    } else if (d?.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
}

describe("Ruling 8a8b14aef30fe825 — combat cleanup heals the Watcher before Rex's Deathknell resolves", () => {
  test("combat damage: Rex takes 7 and dies, its Deathknell is put on the chain targeting the Watcher — and by the time anyone has priority the surviving Watcher is already HEALED (0 damage)", async () => {
    const game = await board().build();
    await attackToDeathknell(game);
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P1, triggered: true })]);
    expect(game.chain()[0]?.targets).toEqual(["watcher"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    // The heal step already ran: Watcher carries none of the 6 combat damage.
    expect(game.zoneOf("watcher")).toBe("battlefield-bf1");
    expect(game.state("watcher").damage).toBe(0);
  });

  test("the Deathknell then deals 4 to a full-health 7-Might Watcher: it survives at bf1 with 4 damage; P2 keeps the conquer", async () => {
    const game = await board().build();
    await attackToDeathknell(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("watcher")).toBe("battlefield-bf1");
    expect(game.state("watcher")).toMatchObject({ damage: 4, might: 7 });
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("that leftover 4 is ordinary damage: it clears at end of turn", async () => {
    const game = await board().build();
    await attackToDeathknell(game);
    await game.settle();
    expect(game.state("watcher").damage).toBe(4);
    await game.advanceTurn();
    expect(game.state("watcher").damage).toBe(0);
  });
});
