/**
 * Ruling 011569c51708d8c8 — Riposte (SFD-206 → sfd-206-221) · Spell · Body/Order · [2] + 2 power · Reaction
 *   "Choose a friendly unit and a spell. Counter that spell and give that unit +[Might] equal to that spell's
 *    Energy cost this turn."
 *   × Cleave (OGN-004 → ogn-004-298) · Spell · Fury · [1] · Action — "Give a unit [Assault 3] this turn."
 *
 * Q: In a showdown, can Riposte be played "in response to" Cleave after Cleave has already resolved?
 * A: No. Riposte needs BOTH a friendly unit and a spell on the chain as targets. While Cleave is on the chain
 *    both players get Reaction windows; once Cleave resolves there is no spell to choose, so Riposte is illegal.
 *    (Units/gear give no Reaction window at all — they fall right off the chain.)
 * Rules: 355.8 (a play with no legal choice for a required target is illegal), 347/332 (priority windows while
 *        a spell is on the chain), 339 (permanents leave the chain immediately).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIPOSTE = "sfd-206-221";
const CLEAVE = "ogn-004-298";

/**
 * P1's turn. P2 holds bf1 with "defender" (4). P1 has "attacker" (3) ready in base and Cleave + exactly [1].
 * P2 holds Riposte with [2] and power to cover either domain reading.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2, power: { body: 1, order: 1, rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Attacker" }, "attacker")
    .unit(P2, "bf1", { might: 4, name: "Defender" }, "defender")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, RIPOSTE, "riposte");
}

/** P1 attacks bf1 (showdown opens, P1 has Focus) and casts Cleave on its attacker. */
async function attackAndCleave(game: Game): Promise<void> {
  await game.p1.move("attacker", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("cleave", { targets: "attacker" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
}

describe("Ruling 011569c51708d8c8 — Riposte must be played while the spell is still on the chain", () => {
  test("while Cleave is on the chain (showdown), P2 gets priority and Riposte IS legal — it counters Cleave and gives defender +1 (Cleave's cost)", async () => {
    const game = await board().build();
    await attackAndCleave(game);
    await game.p1.passPriority(); // caster keeps priority until passing
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "riposte")).toBe(true);
    // With a single spell on the chain the spell role is forced; only the friendly unit is enumerated.
    const targets = game.p2.option("cast", "riposte")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets.map((t) => (t as string[])[0])).toEqual(["defender"]);
    await game.p2.cast("riposte", { targets: "defender" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "riposte"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Riposte resolves → Cleave countered
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("riposte")).toBe("trash");
    expect(game.state("attacker").grantedKeywords).toEqual([]); // no Assault 3
    expect(game.state("attacker").might).toBe(3);
    expect(game.state("defender").might).toBe(5); // +1 = Cleave's Energy cost
  });

  test("once both players pass and Cleave RESOLVES, the chain is empty and Riposte is no longer castable — there is no spell to choose (355.8)", async () => {
    const game = await board().build();
    await attackAndCleave(game);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "riposte")).toBe(true); // this was the window …
    await game.p2.passPriority(); // … and P2 let it go: Cleave resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("attacker").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("attacker").might).toBe(6); // 3 + Assault 3 while attacking
    // Still in the showdown; whoever holds Focus, Riposte is not a legal play for P2 any more.
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.active).toBe(true);
    expect(game.p2.can("cast", "riposte")).toBe(false);
    // Give P2 the Focus explicitly and check again.
    if (game.actingSeat() === P1) {
      await game.p1.passFocus();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "riposte")).toBe(false);
    const r = await game.p2.try((p) => p.cast("riposte", { targets: "defender" }));
    expect(r.ok).toBe(false);
  });

  test("nuance: playing a UNIT gives no Reaction window — it never sits on the chain for Riposte to answer", async () => {
    const game = await board()
      .resources(P1, { energy: 3 })
      .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Fresh Recruit" }, "recruit")
      .build();
    await game.p1.play("recruit", { to: "base" });
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "riposte")).toBe(false);
  });
});
