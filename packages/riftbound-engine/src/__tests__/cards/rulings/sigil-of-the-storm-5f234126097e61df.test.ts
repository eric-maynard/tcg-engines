/**
 * Ruling 5f234126097e61df — Sigil of the Storm (OGN-287 → ogn-287-298, Battlefield)
 *     "When you conquer here, you must recycle one of your runes. (This doesn't choose anything.)"
 *   × Seal of Unity (OGN-245 → ogn-245-298, Gear) "[Exhaust]: [Reaction] — [Add] [order]."
 *   × Gold token (SFD-T03 → sfd-t03, Gear token) "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Q: On the Sigil's conquer trigger, can I recycle Seal of Unity, or must it be a Rune?
 * A: It must be an actual RUNE card (from your board). Seal of Unity is a Gear — exhausting it makes Power but is not "recycling
 *    a rune"; same for a Gold token or any non-Rune object. If you have no runes the trigger resolves doing nothing and the
 *    conquer still stands; if you do have runes you MUST recycle one of them.
 * Rules: 416 (Recycle; 416.4 as many as possible; 416.6 doesn't target), 154/159 (Rune cards vs the Rune Pool), 429 ([Add]).
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SIGIL = "ogn-287-298";
const SEAL_OF_UNITY = "ogn-245-298";
const GOLD = "sfd-t03";

/** P1's turn. P2 holds the live Sigil with a 1-Might Defender; P1: Raider (3) in base, Seal of Unity + a Gold token in base, `runes` runes. */
function board(runes: number) {
  const s = scenario()
    .battlefield("sigil", { controller: P2, def: SIGIL, inert: false, owner: P2 })
    .unit(P2, "sigil", { might: 1, name: "Defender" }, "def")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .gear(P1, SEAL_OF_UNITY, "seal")
    .gear(P1, GOLD, "gold")
    .rune(P2, "order", { alias: "theirs" });
  if (runes >= 1) {
    s.rune(P1, "order", { alias: "r1" });
  }
  if (runes >= 2) {
    s.rune(P1, "body", { alias: "r2", exhausted: true });
  }
  return s;
}

describe("Ruling 5f234126097e61df — the Sigil recycles a RUNE; Seal of Unity / Gold are not runes", () => {
  test("premise: Seal of Unity and the Gold token are GEAR on P1's board, the runes are Rune cards in the pool", async () => {
    const game = await board(2).build();
    expect(game.state("seal").cardType).toBe("gear");
    expect(game.state("gold")).toMatchObject({ cardType: "gear", isToken: true });
    expect(game.state("r1").cardType).toBe("rune");
    expect(game.p1.gear().sort()).toEqual(["gold", "seal"]);
    expect(game.p1.runes().sort()).toEqual(["r1", "r2"]);
  });

  test("P1 conquers the Sigil (scores) → the mandatory recycle prompt offers ONLY P1's rune cards — not Seal of Unity, not the Gold token, not P2's rune — and cannot be declined", async () => {
    const game = await board(2).build();
    await game.p1.move("raider", "sigil");
    const r = await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.sigil?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    const offered = d.options.map((o) => o.card ?? o.key).sort();
    expect(offered).toEqual(["r1", "r2"]);
    expect(offered).not.toContain("seal");
    expect(offered).not.toContain("gold");
    expect(offered).not.toContain("theirs");
    // Forcing the Seal is rejected.
    const forced = await game.p1.try((p) => p.pick("seal"));
    expect(forced.ok).toBe(false);
    expect(game.zoneOf("seal")).toBe("base");
  });

  test("recycling a rune: it goes to the bottom of P1's rune deck; Seal of Unity and Gold stay on the board untouched (ready), no Power was produced", async () => {
    const game = await board(2).build();
    await game.p1.move("raider", "sigil");
    await game.settle();
    await game.p1.pick("r2");
    await game.settle();
    expect(game.zoneOf("r2")).toBe("runeDeck");
    expect(game.p1.runeDeck().at(-1)).toBe("r2");
    expect(game.p1.runes()).toEqual(["r1"]);
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.zoneOf("gold")).toBe("base");
    expect(game.state("seal").isReady).toBe(true);
    expect(game.state("gold").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("exhausting the Seal for [order] in response does NOT satisfy the Sigil: with one rune, that rune must still go", async () => {
    const game = await board(1).build();
    await game.p1.move("raider", "sigil");
    await game.p1.passFocus();
    await game.p2.passFocus();
    // The Sigil trigger is on the chain; P1 may use the Seal's Reaction-speed [Add] meanwhile.
    for (let i = 0; i < 6 && !game.p1.can("activate", "seal"); i++) {
      const d = game.decision();
      if (d?.kind !== "action") {
        break;
      }
      await game.seat(d.seat).pass();
    }
    if (game.p1.can("activate", "seal")) {
      await game.p1.activate("seal");
      expect(game.state("seal").isExhausted).toBe(true);
      expect(game.p1.power("order")).toBe(1);
    }
    // One rune → the mandatory 1-of-1 pick is forced (settle takes it): r1 is recycled regardless of the Seal.
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.zoneOf("seal")).toBe("base"); // the Seal was never "recycled"
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.points()).toBe(1);
  });

  test("no runes at all (only the Seal and the Gold on board): the trigger resolves doing nothing — no prompt to 'recycle' a gear — and P1 still conquers and scores", async () => {
    const game = await board(0).build();
    await game.p1.move("raider", "sigil");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.sigil?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.zoneOf("gold")).toBe("base");
    expect(game.state("seal").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
