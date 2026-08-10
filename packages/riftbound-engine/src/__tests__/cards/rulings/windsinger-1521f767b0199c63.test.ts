/**
 * Ruling 1521f767b0199c63 — Windsinger (SFD-138 → sfd-138-221) · Unit · Chaos · 2 · 1 Might
 *   "[Hidden] — When you play me, you may return another unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Windsinger is hidden at battlefield 1. My opponent starts a showdown at battlefield 2 with a unit of 3 Might or
 *    less. Can I flip Windsinger at battlefield 1 to bounce that unit at battlefield 2?
 * A: No. Played from Hidden, the targets of its "When you play me" ability must be chosen at the battlefield where it
 *    was hidden (battlefield 1); a unit at battlefield 2 cannot be chosen.
 * Rules: 811.1.d.2 (play effect of a hidden permanent targets only at that battlefield), 811.1.d.1, 402.4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WINDSINGER = "sfd-138-221";

/**
 * Turn 3, P2 active (Windsinger was hidden at bf1 on an earlier P1 turn).
 *   bf1 (P1): Defender D (4) [+ Fae F (2) when `smallAtBf1`] + facedown Windsinger
 *   bf2 (P1): Keeper E (5)          P2 base: Attacker A (3) — it will attack bf2
 */
function board(opts: { smallAtBf1?: boolean } = {}) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Defender D" }, "D")
    .unit(P1, "bf2", { might: 5, name: "Keeper E" }, "E")
    .unit(P2, "base", { might: 3, name: "Attacker A" }, "A")
    .facedown(P1, "bf1", WINDSINGER, "ws");
  return opts.smallAtBf1 ? s.unit(P1, "bf1", { might: 2, name: "Fae F" }, "F") : s;
}

/** P2 attacks bf2 with A (3) and passes Focus; P1 now holds Focus in the bf2 showdown. */
async function showdownAtBf2(game: Game): Promise<void> {
  await game.p2.move("A", "bf2");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.state("A")).toMatchObject({ combatRole: "attacker", location: "bf2" });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

/** Both players pass priority until the chain is empty (the showdown itself stays open). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

const pickCards = (game: Game) => {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
};

describe("Ruling 1521f767b0199c63 — Windsinger flipped at bf1 cannot bounce the ≤3-Might attacker at bf2", () => {
  test("P1 may flip the hidden Windsinger at bf1 while holding Focus in the bf2 showdown — it is played TO bf1 (811.1.d.1), not to bf2", async () => {
    const game = await board({ smallAtBf1: true }).build();
    await showdownAtBf2(game);
    expect(game.p1.can("reveal", "ws")).toBe(true);
    await game.p1.reveal("ws");
    expect(game.zoneOf("ws")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ws", controller: P1, triggered: true })]);
  });

  test("with a legal object AT bf1 (Fae F, 2 Might): after 'yes' the target menu offers ONLY F — Attacker A (3, at bf2) is not offered and naming it is rejected (811.1.d.2)", async () => {
    const game = await board({ smallAtBf1: true }).build();
    await showdownAtBf2(game);
    await game.p1.reveal("ws");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(pickCards(game)).toEqual(["F"]);
      expect(pickCards(game)).not.toContain("A");
      expect((await game.p1.try((p) => p.pick("A"))).ok).toBe(false);
      await game.p1.pick("F");
    }
    // F was the only legal object → bound (asked or auto); A never was.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ws", targets: ["F"] })]);
    await drainChain(game);
    expect(game.zoneOf("F")).toBe("hand");
    expect(game.state("A")).toMatchObject({ combatRole: "attacker", location: "bf2", zone: "battlefield-bf2" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("with NO ≤3-Might unit at bf1 (only D, 4): the ability has no legal object at all — A at bf2 is never offered, nothing is returned, A keeps attacking bf2", async () => {
    const game = await board().build();
    await showdownAtBf2(game);
    await game.p1.reveal("ws");
    expect(game.zoneOf("ws")).toBe("battlefield-bf1");
    // Either the item is removed unasked (402.4) or the "you may" is asked and then finds nothing; in no case is A choosable.
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d?.kind === "pick" && d.seat === P1) {
        expect(pickCards(game)).not.toContain("A");
        expect(pickCards(game)).not.toContain("E");
        expect((await game.p1.try((p) => p.pick("A"))).ok).toBe(false);
        await game.p1.decline();
      } else {
        break;
      }
    }
    expect(game.chain().some((c) => c.cardId === "ws" && (c.targets ?? []).includes("A"))).toBe(false);
    await drainChain(game);
    expect(game.state("A")).toMatchObject({ combatRole: "attacker", location: "bf2", zone: "battlefield-bf2" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.p2.hand()).not.toContain("A");
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.zoneOf("E")).toBe("battlefield-bf2");
  });

  test("the showdown at bf2 then plays out untouched by Windsinger: A (3) dies to Keeper E (5), P1 keeps bf2; Windsinger sits at bf1", async () => {
    const game = await board().build();
    await showdownAtBf2(game);
    await game.p1.reveal("ws");
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("E")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.zoneOf("ws")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
