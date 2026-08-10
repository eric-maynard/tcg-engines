/**
 * Ruling 48c19903e627830d — Cleave (OGN-004 → ogn-004-298) · Action · [1] · "Give a unit [Assault 3] this turn."
 *   × Deathgrip (SFD-163 → sfd-163-221) · Reaction · [2] · "Kill a friendly unit. If you do, give +[Might] equal to
 *     its Might to another friendly unit this turn. Draw 1."
 *   × Piltover Enforcer (UNL-187 → unl-187-219, Vi legend) · "When you conquer, if you assigned 3 or more excess
 *     damage, you may exhaust me to ready a unit."
 *
 * Q: I Cleave my attacker and conquer — can I Deathgrip it to pass on the Assault-boosted Might before combat ends?
 * A: Only if a conquer trigger creates a chain. The conquer point is scored immediately; if a trigger (e.g.
 *    Piltover Enforcer with 3+ excess) goes on the chain you get a Reaction window while the unit is still an
 *    Attacker, and Deathgrip transfers the full Might including Assault's +3. With no trigger there is no chain:
 *    combat ends at once, the Attacker designation is gone, and Deathgrip is too late.
 * Rules: 801 (Assault: +N while attacker), 441 / 465–466 (conquer scored on establishing control; combat end
 *        clears designations), 336–338 (Reactions need a chain / priority window).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const DEATHGRIP = "sfd-163-221";
const PILTOVER_ENFORCER = "unl-187-219";

/**
 * P1's turn, [3] energy (Cleave 1 + Deathgrip 2). P2 holds bf1 with a 2-Might Def. P1: Atk (2) and Buddy (1) in
 * base. Cleaved Atk attacks for 2+3 = 5 → Def dies with exactly 3 excess damage.
 */
function board(withLegend: boolean) {
  const b = scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Def" }, "def")
    .unit(P1, "base", { might: 2, name: "Atk" }, "atk")
    .unit(P1, "base", { might: 1, name: "Buddy" }, "buddy")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, DEATHGRIP, "grip");
  return withLegend ? b.legend(P1, PILTOVER_ENFORCER, "vi") : b;
}

/** Atk attacks bf1, P1 Cleaves it, Cleave resolves, both pass Focus → combat damage is dealt. */
async function cleaveAndFight(game: Game): Promise<void> {
  await game.p1.move("atk", "bf1");
  expect(game.state("atk").combatRole).toBe("attacker");
  await game.p1.cast("cleave", { targets: "atk" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.state("atk").might).toBe(5); // 2 + Assault 3 while attacking
  await game.p2.passFocus();
  await game.p1.passFocus();
}

describe("Ruling 48c19903e627830d — Deathgrip after a Cleave conquer needs a conquer trigger to open a chain", () => {
  test("no conquer trigger: combat resolves, P1 conquers (+1) and the game goes straight to P1's open main phase — no chain, Atk is no longer an Attacker (back to 2 Might)", async () => {
    const game = await board(false).build();
    await cleaveAndFight(game);
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no Reaction window existed
    expect(game.state("atk").combatRole).toBeNull();
    expect(game.state("atk").might).toBe(2);
    // Deathgrip now only ever sees a 2-Might Atk.
    await game.p1.cast("grip", { targets: "atk", answers: ["buddy"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("buddy");
      await game.settle();
    }
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.state("buddy").might).toBe(3); // 1 + 2, not 1 + 5
  });

  test("with Piltover Enforcer (3 excess assigned): the point is scored immediately, the conquer trigger goes on the chain, and P1 gets a Reaction window in which Atk is STILL a 5-Might Attacker and Deathgrip is playable", async () => {
    const game = await board(true).build();
    await cleaveAndFight(game);
    expect(game.zoneOf("def")).toBe("trash");
    // Conquer already scored before anything is put on the chain.
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // The legend's "you may exhaust me to ready a unit" is P1's opt-in + target as it goes on the chain.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: true })]);
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("buddy");
    // Priority on the pending trigger: combat has not ended — Atk keeps its Attacker designation and Assault.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("atk").combatRole).toBe("attacker");
    expect(game.state("atk").might).toBe(5);
    expect(game.p1.can("cast", "grip")).toBe(true);
    await game.p1.cast("grip", { targets: "atk" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vi", "grip"]);
    expect(game.p1.resources().energy).toBe(0);
  });

  // Expected: Deathgrip resolves while Atk is a 5-Might Attacker, so Buddy gets +5 (→ 6); then the trigger
  // resolves and combat ends; the conquer point stands even though Atk died. Actual: the engine transfers only
  // Atk's non-Assault Might (+2 → Buddy 3) — Deathgrip ignores the Assault bonus of the killed attacker.
  test("ruling 48c19903e627830d — Deathgrip should transfer the full 5 (incl. Assault +3); engine gives Buddy only +2", async () => {
    const game = await board(true).build();
    await cleaveAndFight(game);
    await game.p1.yes();
    await game.p1.pick("buddy");
    await game.p1.cast("grip", { targets: "atk" });
    // Deathgrip (top) resolves first: kill Atk, "+Might equal to its Might" to Buddy.
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("buddy");
    }
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.state("buddy").might).toBe(6); // 1 + 5
    // Then the Enforcer trigger resolves and combat ends; the point scored on conquering is kept.
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.state("buddy").might).toBe(6);
  });

  test("with the trigger path fully resolved: Atk is dead, the Enforcer is exhausted, Buddy was readied and drew P1 a card — and P1 still has the conquer point", async () => {
    const game = await board(true).build();
    const handBefore = game.p1.hand().length; // cleave + grip
    await cleaveAndFight(game);
    await game.p1.yes();
    await game.p1.pick("buddy");
    await game.p1.cast("grip", { targets: "atk" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("buddy");
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("grip")).toBe("trash");
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.state("buddy").isReady).toBe(true);
    expect(game.p1.hand()).toHaveLength(handBefore - 2 + 1); // Deathgrip's "Draw 1"
    expect(game.p1.points()).toBe(1);
    expect(game.state("atk").combatRole ?? null).toBeNull();
  });
});
