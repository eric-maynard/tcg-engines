/**
 * Forge of the Future — ogn-212-298 · Gear · Order · 2 energy
 *
 *   When you play this, play a 1 [Might] Recruit unit token at your base.
 *   Kill this: Recycle up to 4 cards from trashes.
 *
 * Rules: a token unit is a unit — a played one enters exhausted (179 / 143.4); "Kill this" is
 * the activation cost (Forge goes to the trash as the ability is put on the chain); recycle (416)
 * = put on the bottom of its owner's Main Deck; "from trashes" = any player's trash; "up to 4"
 * = the controller chooses 0–4 cards on resolution.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-212-298";
const FILLER = "ogn-175-298";
const KILL_ABILITY = 1; // abilities[0] is the play trigger, abilities[1] the "Kill this:" ability

function trashBoard() {
  return scenario()
    .gear(P1, CARD, "forge")
    .trash(P1, FILLER, "t1")
    .trash(P1, FILLER, "t2")
    .trash(P1, FILLER, "t3")
    .trash(P1, FILLER, "t4")
    .trash(P1, FILLER, "t5")
    .trash(P2, FILLER, "e1");
}

describe("Forge of the Future (ogn-212-298)", () => {
  test("costs 2 energy and enters the base as gear; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "forge").build();
    await game.p1.play("forge");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("forge")).toBe("base");
    expect(game.p1.gear()).toEqual(["forge"]);
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "forge").build();
    expect(poor.p1.can("play", "forge")).toBe(false);
  });

  test("When you play this: a 1-Might Recruit unit token is played at your base (exhausted, like any played unit)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "forge").build();
    await game.p1.play("forge");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "forge", triggered: true })]);
    await game.settle();
    const units = game.p1.units("base");
    expect(units).toHaveLength(1);
    const token = game.state(units[0] as string);
    expect(token).toMatchObject({ cardType: "unit", isToken: true, might: 1, name: "Recruit", owner: P1 });
    expect(token.isExhausted).toBe(true);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units()).toEqual([]);
  });

  test("Kill this: activating costs nothing but the Forge itself — it goes to the trash and the ability is on the chain", async () => {
    const game = await trashBoard().build();
    expect(game.p1.can("activate", "forge")).toBe(true);
    await game.p1.activate("forge", KILL_ABILITY);
    expect(game.zoneOf("forge")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "forge", controller: P1, triggered: false })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("on resolution P1 picks up to 4 cards from ANY trash; each goes to the bottom of its owner's main deck", async () => {
    // Expected: a pick prompt (min 0, max 4) listing every trash card (t1–t5, e1 and the Forge
    // itself); choosing t1, t2, e1 recycles them — t1/t2 to the bottom of P1's deck, e1 to the
    // bottom of P2's deck; t3–t5 stay. Actual: the ability resolves with no prompt and recycles nothing.
    const game = await trashBoard().build();
    const p1Deck = game.p1.deck().length;
    const p2Deck = game.p2.deck().length;
    await game.p1.activate("forge", KILL_ABILITY);
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, max: 4 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["e1", "forge", "t1", "t2", "t3", "t4", "t5"]);
    await game.p1.answer(["t1", "t2", "e1"]);
    await game.settle();
    expect(game.zoneOf("t1")).toBe("mainDeck");
    expect(game.zoneOf("t2")).toBe("mainDeck");
    expect(game.zoneOf("e1")).toBe("mainDeck");
    expect(game.p1.deck().slice(-2).sort()).toEqual(["t1", "t2"]);
    expect(game.p2.deck()[game.p2.deck().length - 1]).toBe("e1");
    expect(game.p1.deck()).toHaveLength(p1Deck + 2);
    expect(game.p2.deck()).toHaveLength(p2Deck + 1);
    expect(game.p1.trash().sort()).toEqual(["forge", "t3", "t4", "t5"]);
  });

  test("'up to 4' — the controller may recycle nothing at all", async () => {
    // Expected: the pick allows declining / choosing zero; all trash cards stay. Actual: no prompt.
    const game = await trashBoard().build();
    await game.p1.activate("forge", KILL_ABILITY);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.decline();
    await game.settle();
    expect(game.p1.trash().sort()).toEqual(["forge", "t1", "t2", "t3", "t4", "t5"]);
    expect(game.p2.trash()).toEqual(["e1"]);
  });
});
