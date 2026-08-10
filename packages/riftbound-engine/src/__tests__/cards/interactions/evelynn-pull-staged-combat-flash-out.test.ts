/**
 * Interaction: Evelynn, Entrancing (unl-141-219) · Champion Unit · Chaos · 2 · 2 Might
 *     "[Hidden] [Backline] When you play me from face down on your turn, you may move an enemy
 *      unit at a different location to my battlefield."
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · "[Reaction] Move up to 2 friendly units to base."
 *   × Find Your Center (ogn-047-298) · Spell · Calm · 3 · "[Action] … Draw 1 and channel 1 rune
 *     exhausted."
 *
 * Rules: 338.1.a.5 (the chain's creator may add another item while holding Priority), 811.1.d.1
 * (a Hidden permanent is played TO its battlefield), 190.3.a / 450 (the ARRIVING unit's controller
 * applies Contested), 319.5 / 319.8 (a Cleanup follows a chain item leaving the chain / a Move
 * completing), 309.1 (a chain = Closed State), 323.6 (step 4 — losing an empty battlefield —
 * needs an Open State), 323.8 / 323.8.a (Showdown Staged; stays staged only while the applying
 * player has units there), 323.9 / 323.10 (Combat Staged; ceases when opposing units are no longer
 * both present before it opened), 323.11 / 323.11.a (Contested is removed from a battlefield with
 * no units of the applying player and no ongoing Showdown/Combat), 323.13 (Combat BEGINS only in a
 * Neutral Open State), 464.2.c.1 (Attacker = whoever applied Contested), 323.2 (designations).
 *
 * Question: P1's turn, Neutral Open. P1 controls bfA (vanilla X + Evelynn facedown, hidden last
 * turn). P2 controls bfB with a lone unit U and holds Flash. P1 plays Find Your Center and, keeping
 * Priority, flips Evelynn at bfA; her trigger pulls U bfB → bfA and resolves while Find Your Center
 * is still on the chain.
 *   (a) after that Move: bfA Contested BY P2, Showdown + Combat staged but NOT begun (Closed State);
 *       P2 keeps the empty bfB for now (step 4 needs an Open State).
 *   (b) P2 Flashes U back to base before Find Your Center resolves: the staged Showdown/Combat
 *       lapse and Contested is removed from bfA (323.8.a / 323.10 / 323.11); when the chain empties
 *       there is no combat at all, bfB goes uncontrolled, bfA still P1's and uncontested.
 *   (c) NO Flash: combat begins only once Find Your Center leaves the chain; on P1's turn P2 is the
 *       Attacker (U attacker), P1 the Defender (X and Evelynn defenders); P2 holds Focus; bfB lost.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EVELYNN = "unl-141-219";
const FLASH = "ogs-011-024";
const FIND_YOUR_CENTER = "ogn-047-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 3, name: "Vanilla X" }, "X")
    .facedown(P1, "bfA", EVELYNN, "eve")
    .unit(P2, "bfB", { might: 2, name: "Vanilla U" }, "U")
    .hand(P1, FIND_YOUR_CENTER, "fyc")
    .hand(P2, FLASH, "flash");
}

const bf = (game: Game, id: string) => game.gameState.battlefields[id];
const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};
const priority = (game: Game) => game.gameState.interaction?.chain?.activePlayer;

/** P1: Find Your Center → (keeping priority) flip Evelynn, opt in (U is the only enemy unit elsewhere) → both pass → her trigger resolves. */
async function pullResolvedFycPending(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("fyc");
  await game.p1.reveal("eve");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  await game.p1.passPriority();
  await game.p2.passPriority(); // Evelynn's trigger (newest item) resolves; Find Your Center stays
  return game;
}

describe("Evelynn flipped mid-chain pulls U into a STAGED combat; Flash pulls U back out", () => {
  // ── the play ────────────────────────────────────────────────────────────────────────────────

  test("with Find Your Center on the chain P1 still holds Priority and may flip Evelynn (Reaction via Hidden) — she is played TO bfA and her trigger sits above the spell (338.1.a.5, 811.1.d.1)", async () => {
    const game = await board().build();
    await game.p1.cast("fyc");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "eve")).toBe(true);
    await game.p1.reveal("eve");
    expect(game.zoneOf("eve")).toBe("battlefield-bfA");
    expect(game.p1.energy()).toBe(0); // 3 for the spell, 0 for the hidden play
    await game.p1.yes();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "fyc", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "eve", controller: P1, targets: ["U"], triggered: true }),
    ]);
    expect(game.locationOf("U")).toBe("bfB"); // nothing moved yet
  });

  // ── (a) the Cleanup after the pull, chain still Closed ─────────────────────────────────────

  test("(a) the trigger resolves while Find Your Center is still pending: U is at bfA and Contested is applied BY P2, the arriving unit's controller (190.3.a, 450)", async () => {
    const game = await pullResolvedFycPending();
    expect(game.locationOf("U")).toBe("bfA");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fyc", controller: P1 })]);
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  });

  test("(a) Closed State: the Combat is only STAGED — no showdown opens, no unit has a designation, and Priority returns to P1 as controller of the remaining item (309.1, 323.13, 323.2, 340.4)", async () => {
    const game = await pullResolvedFycPending();
    expect(showdown(game)).toBeUndefined();
    expect(game.state("U").combatRole).toBeNull();
    expect(game.state("X").combatRole).toBeNull();
    expect(game.state("eve").combatRole).toBeNull();
    expect(priority(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) P2 does NOT yet lose the now-empty bfB — step 4 of the Cleanup needs an Open State (323.6, 309.1)", async () => {
    const game = await pullResolvedFycPending();
    expect(game.p2.units("bfB")).toEqual([]);
    expect(bf(game, "bfB")?.controller).toBe(P2);
  });

  // ── (b) Flash out before Find Your Center resolves ─────────────────────────────────────────

  test("(b) after P1 passes, P2 may Flash (Reaction) U — now a friendly unit at bfA — back to base while Find Your Center is still on the chain", async () => {
    const game = await pullResolvedFycPending();
    await game.p1.passPriority();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: "U" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "fyc", controller: P1 }),
      expect.objectContaining({ cardId: "flash", controller: P2, targets: ["U"] }),
    ]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.locationOf("U")).toBe("base");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fyc" })]);
    expect(showdown(game)).toBeUndefined();
    expect(bf(game, "bfB")?.controller).toBe(P2); // still Closed: bfB not lost yet
  });

  // Expected (319.8 → 323.11): the Cleanup right after Flash's Move removes Contested from bfA at
  // once — no unit of the applying player (P2) remains and no Showdown/Combat is ongoing; step 8
  // has no Open-State condition. Actual: the engine leaves bfA `contested: true, contestedBy: P2`
  // until the chain empties (it is only cleared once Find Your Center resolves).
  test("(b) Contested is removed from bfA in the Cleanup right after Flash resolves, even though Find Your Center is still on the chain (319.8, 323.8.a, 323.10, 323.11)", async () => {
    const game = await pullResolvedFycPending();
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "U" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves; fyc still pending
    expect(game.chain()).toHaveLength(1);
    expect(bf(game, "bfA")?.contested).toBe(false);
  });

  test("(b) once Find Your Center resolves and the chain empties: NO combat/showdown ever begins, bfA is P1's and uncontested (nothing re-applied, 323.11.a), P2 LOSES the empty bfB (323.6), U safe in base", async () => {
    const game = await pullResolvedFycPending();
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "U" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash
    expect(priority(game)).toBe(P1); // 340.4: controller of the newest remaining item
    const hand0 = game.p1.hand().length;
    const runes0 = game.p1.runes().length;
    await game.p1.passPriority();
    await game.p2.passPriority(); // Find Your Center: draw 1, channel 1 exhausted
    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.runes()).toHaveLength(runes0 + 1);
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toBeUndefined();
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(bf(game, "bfB")?.controller).toBeNull();
    expect(game.locationOf("U")).toBe("base");
    expect(game.state("U")).toMatchObject({ combatRole: null, damage: 0 });
    expect(game.state("X").combatRole).toBeNull();
    expect(game.state("eve")).toMatchObject({ combatRole: null, zone: "battlefield-bfA" });
    expect(game.p1.points() + game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) contrast: P2 does not Flash ────────────────────────────────────────────────────────

  test("(c) NO Flash: nothing begins until Find Your Center leaves the chain; then, Neutral Open, the staged Combat begins at bfA and P2 loses bfB in the same Cleanup (323.6, 323.13)", async () => {
    const game = await pullResolvedFycPending();
    await game.p1.passPriority();
    expect(showdown(game)).toBeUndefined(); // still Closed
    await game.p2.passPriority(); // Find Your Center resolves → chain empty → Cleanup
    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfA", isCombatShowdown: true });
    expect(bf(game, "bfB")?.controller).toBeNull();
  });

  test("(c) on P1's turn P2 is the ATTACKER (its unit applied Contested) and holds Focus; P1 defends: U attacker, X and Evelynn defenders; Evelynn keeps Backline (464.2.c.1, 323.2)", async () => {
    const game = await pullResolvedFycPending();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.turnPlayer()).toBe(P1);
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("U").combatRole).toBe("attacker");
    expect(game.state("X").combatRole).toBe("defender");
    expect(game.state("eve").combatRole).toBe("defender");
    expect(game.state("eve").keywords).toContain("Backline");
  });

  test("(c) the combat plays out: U (2) into X 3 + Evelynn 2 — U dies, P1 keeps bfA, nobody scores", async () => {
    const game = await pullResolvedFycPending();
    await game.settle();
    expect(game.zoneOf("U")).toBe("trash");
    expect(game.zoneOf("X")).toBe("battlefield-bfA");
    expect(game.zoneOf("eve")).toBe("battlefield-bfA");
    expect(game.state("X").damage).toBe(0);
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(bf(game, "bfB")?.controller).toBeNull();
    expect(game.p1.points() + game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
