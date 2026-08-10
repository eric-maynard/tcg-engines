/**
 * Ruling d7b89edbb8e56e1a — Dragon's Rage (ogn-258-298) × Defy (ogn-045-298) × Mystic Reversal (ogn-080-298)
 *   Dragon's Rage — [4]+1: "Move an enemy unit. Then do this: Choose another enemy unit at its destination. They deal
 *   damage equal to their Mights to each other."
 *   Defy — [Reaction] · [1][calm]: "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   Mystic Reversal — [Reaction] · [4][calm]×3: "Gain control of a spell. You may make new choices for it."
 *
 * Q: P1 plays Dragon's Rage, P2 Defies it, P1 Mystic Reversals the Defy — what happens?
 * A: P1 gains control of Defy, but Defy says "a spell" (not "an enemy spell") and the only legal target left on the chain
 *    is Dragon's Rage — so no real re-targeting is possible: Defy still targets (and counters) Dragon's Rage.
 * Rules: 424 (gain control of a spell), 751–755 (new choices must be legal), 355.9.c (a spell can't target itself).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAGONS_RAGE = "ogn-258-298";
const DEFY = "ogn-045-298";
const MYSTIC_REVERSAL = "ogn-080-298";

/**
 * P1's turn with [8] + 4 calm (Rage 4+1, Reversal 4+3). P2: Victim (3) in base, Brute (5) at P2's bf2; Defy + [1][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { calm: 4 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 5, name: "Brute" }, "brute")
    .unit(P2, "base", { might: 3, name: "Victim" }, "victim")
    .hand(P1, DRAGONS_RAGE, "rage")
    .hand(P1, MYSTIC_REVERSAL, "reversal")
    .hand(P2, DEFY, "defy");
}

/** Rage on the Victim (→ bf2), P2 Defies it, P1 Reversals the Defy; stop with all three on the chain. */
async function rageDefyReversal(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rage", { targets: "victim" });
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bf2");
  }
  expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 3 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["rage"]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "defy")).toBe(true);
  await game.p2.cast("defy", { targets: "rage" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  await game.p2.passPriority();
  expect(game.p1.can("cast", "reversal")).toBe(true);
  await game.p1.cast("reversal", { targets: "defy" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["rage", "defy", "reversal"]);
  return game;
}

describe("Ruling d7b89edbb8e56e1a — Reversing a Defy aimed at your own Dragon's Rage gains you the Defy, but it still has to hit Dragon's Rage", () => {
  test("Mystic Reversal resolves first: P1 now CONTROLS Defy (still on the chain above Dragon's Rage)", async () => {
    const game = await rageDefyReversal();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Reversal resolves
    expect(game.zoneOf("reversal")).toBe("trash");
    const chain = game.chain();
    expect(chain.map((c) => c.cardId)).toEqual(["rage", "defy"]);
    expect(chain[1]).toMatchObject({ cardId: "defy", controller: P1 });
    expect(chain[0]).toMatchObject({ cardId: "rage", controller: P1 });
  });

  // Expected: the New Choices dialog for Defy's "a spell" slot can only offer Dragon's Rage (the sole other spell on the
  // chain), already marked current. Actual: the engine offers the UNITS Victim and Brute (Dragon's Rage's own move
  // candidates) as new "targets" for Defy, and Rage is not even listed.
  test.failing("BUG: ruling d7b89edbb8e56e1a — Defy's new-choice menu must be exactly [Dragon's Rage] (engine offers enemy units instead of spells)", async () => {
    const game = await rageDefyReversal();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.newChoices?.grantedBy : undefined).toBe("reversal");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toEqual(["rage"]);
    expect(d?.kind === "pick" ? d.options[0]?.current : false).toBe(true); // it already holds that value
    expect((await game.p1.try((p) => p.pick("defy"))).ok).toBe(false);
    await game.p1.keepChoices();
    const defy = game.chain().find((c) => c.cardId === "defy");
    expect(defy?.targets ?? ["rage"]).toEqual(["rage"]);
  });

  // Expected: keeping the (only) choice, Defy — now P1's — resolves and counters Dragon's Rage: Rage goes to the trash
  // without effect, the Victim never moves and no fight happens. Actual: Defy resolves without countering anything and
  // Dragon's Rage then resolves in full (Victim moved to bf2, trades blows with the Brute and dies).
  test("ruling d7b89edbb8e56e1a — the reversed Defy still counters Dragon's Rage (engine lets Rage resolve: Victim moved and killed)", async () => {
    const game = await rageDefyReversal();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("reversal")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").damage).toBe(0);
    expect(game.state("brute").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without the Reversal the outcome for Dragon's Rage is the same (Defy counters it) — the Reversal only changed who controlled Defy", async () => {
    const game = await board().build();
    await game.p1.cast("rage", { targets: "victim" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf2");
    }
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "rage" });
    await game.settle();
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.zoneOf("reversal")).toBe("hand");
  });
});
