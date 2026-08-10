/**
 * Ruling 0381d349b84f783b — (general, [Hidden]) illustrated with Block (OGN-057 → ogn-057-298) "[Hidden][Action] Give a unit [Shield 3] and [Tank]
 *     this turn." and Stand United (OGN-053 → ogn-053-298) "[Hidden][Action] Buff a friendly unit. Buffs give an additional +1 [Might] to friendly
 *     units this turn."
 *
 * Q: When my battlefield is attacked, can I unhide several hidden cards — including ones hidden at OTHER battlefields — to buff my units?
 * A: Yes. Each play-from-facedown is its own Reaction-speed play and they can be chained. Nuance: a card revealed from a DIFFERENT battlefield
 *    has its targeting restricted to the battlefield it was hidden at.
 * Rules: 811.1.b / 811.6 (a facedown card gains [Reaction], playable from the next turn for [0]), 811.1.c.3 (each play opens/extends a chain),
 *        811.1.d.2 (targets restricted to that battlefield), 811.2 (non-targeting parts work normally).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLOCK = "ogn-057-298";
const STAND_UNITED = "ogn-053-298";

/**
 * Turn 3, P2's turn. P1 holds bf1 with Defender (2) and a facedown Block there, and bf2 with Faraway (2) and a facedown Stand United there
 * (both hidden on an earlier turn). P2's Raider (5) attacks bf1 from base. P1 has NO resources — plays from facedown cost [0].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P1, "bf2", { might: 2, name: "Faraway" }, "far")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .facedown(P1, "bf1", BLOCK, "block")
    .facedown(P1, "bf2", STAND_UNITED, "su");
}

/** Raider attacks bf1; P2 passes Focus so P1 may act. */
async function attacked(): Promise<Game> {
  const game = await board().build();
  expect(game.zoneOf("block")).toBe("facedown-bf1");
  expect(game.zoneOf("su")).toBe("facedown-bf2");
  await game.p2.move("raider", "bf1");
  expect(game.state("def").combatRole).toBe("defender");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 0381d349b84f783b — several hidden cards can be flipped at Reaction speed on one chain, even from other battlefields", () => {
  test("with Focus, P1 is offered BOTH facedown cards — the Block at the attacked bf1 AND the Stand United at the untouched bf2 — for [0]", async () => {
    const game = await attacked();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("reveal", "block")).toBe(true);
    expect(game.p1.can("reveal", "su")).toBe(true);
  });

  test("first unhide: Block is played from bf1 onto a new chain; its target must be at bf1 — offered exactly Defender and Raider (the units there), not Faraway", async () => {
    const game = await attacked();
    await game.p1.reveal("block");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "block" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["def", "raider"]);
    await game.p1.pick("def");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "block", controller: P1, targets: ["def"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 keeps priority → may chain more
  });

  test("second unhide chained on top, from the OTHER battlefield: Stand United's 'friendly unit' is restricted to bf2, so it can only (and does) name Faraway — never the Defender at bf1", async () => {
    const game = await attacked();
    await game.p1.reveal("block");
    await game.p1.pick("def");
    expect(game.p1.can("reveal", "su")).toBe(true);
    await game.p1.reveal("su");
    const d = game.decision();
    if (d?.kind === "pick" && d.source?.cardId === "su") {
      expect(d.options.map((o) => o.card)).toEqual(["far"]);
      await game.p1.pick("far");
    }
    expect(game.chain().map((c) => ({ cardId: c.cardId, targets: c.targets }))).toEqual([
      { cardId: "block", targets: ["def"] },
      { cardId: "su", targets: ["far"] },
    ]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // both free
  });

  test("both resolve (LIFO): Faraway is buffed (2 +1 buff +1 'buffs give an additional +1' = 4), Defender gets Shield 3 + Tank for the turn; both spells to trash", async () => {
    const game = await attacked();
    await game.p1.reveal("block");
    await game.p1.pick("def");
    await game.p1.reveal("su");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("far");
    }
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("block")).toBe("trash");
    expect(game.zoneOf("su")).toBe("trash");
    expect(game.state("far")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.state("def").isBuffed).toBe(false); // Stand United could not reach it
    expect(game.state("def").grantedKeywords).toEqual(expect.arrayContaining([
      { duration: "turn", keyword: "Shield", value: 3 },
      expect.objectContaining({ duration: "turn", keyword: "Tank" }),
    ]));
    // and the combat then goes the Defender's way: 2 + Shield 3 = 5 ≥ Raider's 5 → Raider dies; Defender (takes 5 ≥ 2) dies too
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
