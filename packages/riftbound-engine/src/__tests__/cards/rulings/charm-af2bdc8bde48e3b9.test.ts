/**
 * Ruling af2bdc8bde48e3b9 — Charm (OGN-043 → ogn-043-298) · Calm · [1][calm] "Move an enemy unit."
 *   × Mask of Foresight (OGN-060 → ogn-060-298) · Gear · [2] "When a friendly unit attacks or defends alone,
 *     give it +1 [Might] this turn."
 *
 * Q: Does moving a unit to an EMPTY battlefield count as attacking — does it set off attack-triggered effects
 *    like the Mask's +1?
 * A: No. Moving onto an unoccupied battlefield is not attacking, so nothing "attacks" and the Mask stays silent.
 *    (It does make you the one who applied Contested, so if the opponent later brings a unit in you are the
 *    attacker.) The flip side: if you already hold a battlefield and CHARM an enemy unit onto it, that enemy is
 *    the arriving/attacking side and your unit there is defending — the Mask does fire, as a defender bonus.
 * Rules: 464.2.c (the arriving unit's controller is the Attacker; a unit alone at an empty battlefield attacks
 *        nobody), 450 (first to apply Contested), 740.2.a ("alone" = no other friendly unit there).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const MASK_OF_FORESIGHT = "ogn-060-298";

/**
 * P1's turn 3. P1 has the Mask of Foresight in play, holds bf1 with a lone Warden (3) and keeps a Scout (2) in
 * base; bf2 is open. P2 keeps a Raider (4) in base. P1 has Charm and exactly [1][calm].
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, CHARM, "charm");
}

/** Resolve just the open chain (both seats pass priority). */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  expect(game.chain()).toEqual([]);
}

/** Pass focus/priority for whoever is asked until the position is open again. */
async function passUntilOpen(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && (d.context === "showdown" || d.context === "chain")) {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
}

describe("Ruling af2bdc8bde48e3b9 — walking onto an EMPTY battlefield is not an attack (no Mask trigger); a Charmed-in enemy makes YOU the defender", () => {
  test("P1's Scout moves alone onto the empty bf2: no attack trigger goes on the chain and its Might stays 2", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf2");
    expect(game.chain().filter((c) => c.cardId === "mask")).toEqual([]);
    expect(game.state("scout").might).toBe(2);
    await passUntilOpen(game);
    expect(game.state("scout").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("…even though the move did make bf2 contested BY P1 — that is what would make P1 the attacker if a defender showed up later", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.state("scout").combatRole).not.toBe("attacker");
  });

  test("control: a move onto an OCCUPIED battlefield really is an attack — the Mask's +1 lands on the lone attacker", async () => {
    const game = await board().unit(P2, "bf2", { might: 1, name: "Squatter" }, "squatter").build();
    await game.p1.move("scout", "bf2");
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.chain().filter((c) => c.cardId === "mask" && c.triggered)).toHaveLength(1);
    await resolveChain(game);
    expect(game.state("scout").might).toBe(3); // 2 + 1 from the Mask
  });

  test("ruling nuance: P1 Charms the enemy Raider onto the battlefield P1 already holds — P1's Warden is the DEFENDER, and the Mask fires for it", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { answers: ["bf1"], targets: "raider" });
    await resolveChain(game);
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.state("warden").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker"); // the arriving unit's controller attacks
    expect(game.state("warden").might).toBe(4); // 3 + 1 from the Mask, defending alone
    await passUntilOpen(game);
    expect(game.violations()).toEqual([]);
  });
});
