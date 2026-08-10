/**
 * Ruling 50c40f3ddd0cc272 — Gemcraft Seer (OGN-100 → ogn-100-298) · 3 Might
 *     "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.) Other friendly units have [Vision]."
 *   × Taric, Protector (OGN-074 → ogn-074-298) "[Shield] [Tank] Other friendly units here have [Shield]." (the answer's analogy)
 *
 * Q: With two Gemcraft Seers in play, do my units get Vision twice?
 * A: Yes — every other friendly unit has Vision Vision; the two instances trigger separately, so a unit entering play looks at
 *    the top card twice in a row. Same stacking idea as two Tarics giving Shield 2.
 * Rules: 132.3 / 800-series (multiple instances of a triggered keyword each trigger), 819 (Vision), 815 (Shield stacks).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GEMCRAFT_SEER = "ogn-100-298";
const TARIC = "ogn-074-298";

/** P1's turn. Two Seers in base, a vanilla 2-cost Newbie in hand with exactly [2], known deck top d1 d2 d3. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", GEMCRAFT_SEER, "seer1")
    .unit(P1, "base", GEMCRAFT_SEER, "seer2")
    .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Newbie" }, "newbie")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Pass priorities until a non-action prompt (or the main phase). */
async function passToPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context === "main" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 50c40f3ddd0cc272 — two Gemcraft Seers grant Vision twice; each instance triggers on its own", () => {
  test("a unit played with two Seers out carries TWO Vision instances and puts two Vision triggers on the chain", async () => {
    const game = await board().build();
    await game.p1.play("newbie", { to: "base" });
    const visions = game.state("newbie").grantedKeywords.filter((k) => k.keyword === "Vision");
    expect(visions).toHaveLength(2);
    expect(game.chain().filter((c) => c.cardId === "newbie" && c.triggered)).toHaveLength(2);
  });

  test("they resolve one after the other: look at d1 (recycle it), then a SECOND look now showing d2 (recycle it) → d3 is on top", async () => {
    const game = await board().build();
    await game.p1.play("newbie", { to: "base" });
    await passToPrompt(game);
    let d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["d1"]);
    await game.p1.pick("d1");
    await passToPrompt(game);
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["d2"]);
    await game.p1.pick("d2");
    await game.settle();
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.zoneOf("d1")).toBe("mainDeck");
    expect(game.zoneOf("d2")).toBe("mainDeck");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: with ONE Seer the Newbie looks exactly once", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", GEMCRAFT_SEER, "seer1")
      .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Newbie" }, "newbie")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    await game.p1.play("newbie", { to: "base" });
    expect(game.chain().filter((c) => c.cardId === "newbie" && c.triggered)).toHaveLength(1);
    await passToPrompt(game);
    await game.p1.pick("d1");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck()[0]).toBe("d2");
  });

  test("nuance (same stacking): two Tarics at one battlefield give the other defenders there Shield twice — a 2-Might Pawn defends at 4, each Taric (own Shield + the other's) at 6", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TARIC, "taric1")
      .unit(P1, "bf1", TARIC, "taric2")
      .unit(P1, "bf1", { might: 2, name: "Pawn" }, "pawn")
      .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
      .build();
    await game.p2.move("poker", "bf1");
    expect(game.state("pawn").combatRole).toBe("defender");
    expect(game.state("pawn").might).toBe(4);
    expect(game.state("taric1").might).toBe(6);
    expect(game.state("taric2").might).toBe(6);
  });
});
