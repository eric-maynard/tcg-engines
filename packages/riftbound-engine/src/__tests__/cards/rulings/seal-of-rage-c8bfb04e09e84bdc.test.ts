/**
 * Ruling c8bfb04e09e84bdc — Seal of Rage (OGN-040 → ogn-040-298) · Gear "[Exhaust]: [Reaction] — [Add] [fury]."
 *   × Sigil of the Storm (OGN-287 → ogn-287-298) · Battlefield "When you conquer here, you must recycle one of your runes."
 *
 * Q: Can Seal of Rage be used to pay Sigil of the Storm's recycle?
 * A: No. Seals only pay Power costs; the Sigil literally requires recycling a RUNE, so a rune card must be recycled and no
 *    alternative payment (Seal, ability) substitutes for it.
 * Rules: 416 (Recycle), 154/159 (rune cards), 429 ([Add] produces resources — it is not recycling).
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SIGIL = "ogn-287-298";
const SEAL_OF_RAGE = "ogn-040-298";

/** P1's turn. P2 holds the live Sigil with a 1-Might Defender; P1: Raider (3) + Seal of Rage in base, `runes` fury runes. */
function board(runes: number) {
  const s = scenario()
    .battlefield("sigil", { controller: P2, def: SIGIL, inert: false, owner: P2 })
    .unit(P2, "sigil", { might: 1, name: "Defender" }, "def")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .gear(P1, SEAL_OF_RAGE, "seal")
    .rune(P2, "fury", { alias: "theirs" });
  if (runes >= 1) {
    s.rune(P1, "fury", { alias: "r1" });
  }
  if (runes >= 2) {
    s.rune(P1, "fury", { alias: "r2", exhausted: true });
  }
  return s;
}

describe("Ruling c8bfb04e09e84bdc — Seal of Rage cannot pay Sigil of the Storm's 'recycle one of your runes'", () => {
  test("premise: Seal of Rage is a GEAR; r1/r2 are rune cards in P1's pool", async () => {
    const game = await board(2).build();
    expect(game.state("seal").cardType).toBe("gear");
    expect(game.state("r1").cardType).toBe("rune");
    expect(game.p1.runes().sort()).toEqual(["r1", "r2"]);
  });

  test("conquering the Sigil: the mandatory recycle prompt offers ONLY P1's runes — never the Seal — and picking the Seal is rejected", async () => {
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
    expect(offered).not.toContain("theirs");
    expect((await game.p1.try((p) => p.pick("seal"))).ok).toBe(false);
    await game.p1.pick("r1");
    await game.settle();
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.state("seal").isReady).toBe(true);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("exhausting Seal of Rage for [fury] while the trigger is pending does NOT satisfy it: the lone rune is still recycled", async () => {
    const game = await board(1).build();
    await game.p1.move("raider", "sigil");
    await game.p1.passFocus();
    await game.p2.passFocus();
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
      expect(game.p1.power("fury")).toBe(1);
    }
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("r1")).toBe("runeDeck"); // the rune had to go anyway
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.points()).toBe(1);
  });

  test("no runes, only the Seal: nothing can be recycled — no prompt offers the Seal, it stays ready, and the conquer stands", async () => {
    const game = await board(0).build();
    await game.p1.move("raider", "sigil");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.sigil?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.state("seal").isReady).toBe(true);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
