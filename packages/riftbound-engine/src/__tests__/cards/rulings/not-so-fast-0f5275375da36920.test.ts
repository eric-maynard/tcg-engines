/**
 * Ruling 0f5275375da36920 — Not So Fast (SFD-045 → sfd-045-221) · Calm Reaction spell · [2][calm]
 *   "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Ruined Rex (UNL-067 → unl-067-219) · 6-Might unit — "[Deathknell] Deal 4 to an enemy unit."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) — "Your [Deathknell] effects trigger an additional time."
 *   (+ Hidden Blade ogn-213-298 as the spell that kills the Rex.)
 *
 * Q: Does one Not So Fast counter BOTH Deathknell triggers of a Ruined Rex that dies with Karthus on the field?
 * A: No. With Karthus the Deathknell triggers twice and the two triggers are separate chain items. Not So Fast
 *    counters exactly one of them; the other stays on the chain and resolves normally (4 damage). Stopping
 *    both takes two counters.
 * Rules: 808 (Deathknell), Karthus's additional trigger = an extra chain item, 425.1 (counter one item).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const RUINED_REX = "unl-067-219";
const KARTHUS = "ogn-236-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P2's turn. P1: Ruined Rex (6) at P1's bf1, Karthus (3) in base. P2: a lone 9-Might "Big" in base (the only
 * enemy unit the Rex can choose), Hidden Blade + Not So Fast ×N in hand, [2][order] + N×[2][calm].
 */
function board(nsfCopies: 1 | 2) {
  const s = scenario()
    .active(P2)
    .resources(P2, { energy: 2 + 2 * nsfCopies, power: { calm: nsfCopies, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", RUINED_REX, "rex")
    .unit(P1, "base", KARTHUS, "karthus")
    .unit(P2, "base", { might: 9, name: "Big" }, "big")
    .hand(P2, HIDDEN_BLADE, "blade")
    .hand(P2, NOT_SO_FAST, "nsf");
  return nsfCopies === 2 ? s.hand(P2, NOT_SO_FAST, "nsf2") : s;
}

/** P2 Hidden-Blades the Rex; it resolves; the Rex's Deathknell items are put on the chain (choosing Big). P1 then passes. */
async function killRex(nsfCopies: 1 | 2 = 1): Promise<Game> {
  const game = await board(nsfCopies).build();
  await game.p2.cast("blade", { targets: "rex" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Blade resolves → Rex dies (P1 draws 2)
  expect(game.zoneOf("rex")).toBe("trash");
  await game.acceptTriggerOrder();
  // If the engine asks P1 which enemy unit each trigger chooses, it is Big (the only one).
  for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
    await game.p1.pick("big");
  }
  return game;
}

describe("Ruling 0f5275375da36920 — one Not So Fast counters only ONE of the two Karthus-doubled Deathknell triggers", () => {
  test("with Karthus out, the Rex's Deathknell is on the chain TWICE — two separate triggered items controlled by P1, each choosing Big", async () => {
    const game = await killRex();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "rex", controller: P1, targets: ["big"], triggered: true }),
      expect.objectContaining({ cardId: "rex", controller: P1, targets: ["big"], triggered: true }),
    ]);
    expect(new Set(game.chain().map((c) => c.id)).size).toBe(2);
  });

  test("control: uncountered, both resolve — Big takes 4 + 4 = 8", async () => {
    const game = await killRex();
    await game.settle();
    expect(game.state("big").damage).toBe(8);
    expect(game.zoneOf("big")).toBe("base");
  });

  test("Not So Fast is a legal response for P2 (enemy ability choosing a friendly unit) and must pick ONE of the two items as its target", async () => {
    const game = await killRex();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.p2.can("cast", "nsf")).toBe(true);
    const field = game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets");
    expect(field?.max).toBe(1);
    expect(field?.options).toHaveLength(2); // one entry per Deathknell item
  });

  test("ruling: Not So Fast counters exactly one trigger — the other still resolves and Big takes exactly 4", async () => {
    const game = await killRex();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    const field = game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets");
    const firstTarget = (field?.options?.[0] as string[])[0]!;
    await game.p2.cast("nsf", { targets: firstTarget });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, order: 0 } });
    expect(game.chain()).toHaveLength(3);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Not So Fast resolves → one item countered
    const rexItems = game.chain().filter((c) => c.cardId === "rex");
    // One Deathknell item remains live on the chain (the countered one is cleared or flagged countered).
    expect(rexItems.filter((c) => !c.countered)).toHaveLength(1);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("big").damage).toBe(4);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("to stop both you need TWO counters: a second Not So Fast on the remaining item leaves Big undamaged", async () => {
    const game = await killRex(2);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    let field = game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets");
    await game.p2.cast("nsf", { targets: (field?.options?.[0] as string[])[0]! });
    await game.p2.passPriority();
    await game.p1.passPriority(); // first counter resolves
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.p2.can("cast", "nsf2")).toBe(true);
    field = game.p2.option("cast", "nsf2")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toHaveLength(1); // only the surviving item is left to counter
    await game.p2.cast("nsf2", { targets: (field?.options?.[0] as string[])[0]! });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("big").damage).toBe(0);
  });
});
