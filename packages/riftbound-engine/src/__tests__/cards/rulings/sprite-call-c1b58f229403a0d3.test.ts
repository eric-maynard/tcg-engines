/**
 * Ruling c1b58f229403a0d3 — Sprite Call (OGN-094 → ogn-094-298) · Spell · Mind · 3 · [Hidden] [Action]
 *     "Play a ready 3 [Might] Sprite unit token with [Temporary]."   × Sprite token (OGN-274 → ogn-274-298)
 *
 * Q: Sprite Call is hidden at a battlefield I hold with a single unit; the opponent plays hard removal on that unit. Can I
 *    reveal Sprite Call in response and put the Sprite there?
 * A: Yes. A facedown card gains Reaction (from the turn after it was hidden), so you flip it in response for [0]; it resolves
 *    first and the Sprite is played to that battlefield — before the removal resolves.
 * Rules: 811.1 (Hidden: hide for [rainbow]; from a later turn play it as a Reaction for [0]), 811.1.d.3 (a unit it plays goes
 *        to that battlefield), 340.1 (LIFO), 190.4 (control follows having a unit there).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";
/** Inline [Action] hard removal: "Kill a unit." */
const EXECUTE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  name: "Test Execute",
  timing: "action",
} as const;

/**
 * P1's turn 3. P1 holds bf1 with a lone 2-Might Warden and has Sprite Call in hand + one [rainbow] to hide it. P2 holds the
 * removal (paid next turn from freshly channeled runes) and a Raider in base.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Warden" }, "warden")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, SPRITE_CALL, "call")
    .hand(P2, EXECUTE, "kill");
}

const sprites = (game: Game) => game.findAll({ name: "Sprite", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");

/** Hide Sprite Call at bf1, pass the turn; P2 taps 2 runes and casts the removal on the Warden, then passes priority to P1. */
async function hideThenRemovalNextTurn(game: Game): Promise<void> {
  await game.p1.hide("call", "bf1");
  expect(game.zoneOf("call")).toBe("facedown-bf1");
  expect(game.p1.power("rainbow")).toBe(0);
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.tapRunes(2);
  await game.p2.cast("kill", { targets: "warden" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kill", controller: P2, targets: ["warden"] })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling c1b58f229403a0d3 — a hidden Sprite Call can be flipped in response to removal on the lone unit guarding it", () => {
  test("hiding costs [rainbow] and the card can NOT be revealed on the turn it was hidden", async () => {
    const game = await board().build();
    expect(game.p1.can("hide", "call")).toBe(true);
    await game.p1.hide("call", "bf1");
    expect(game.zoneOf("call")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.p1.can("reveal", "call")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("reveal");
  });

  test("next turn, with P2's removal targeting the Warden on the chain, P1 (priority) is offered the reveal — a facedown card reacts for [0] even with an empty pool", async () => {
    const game = await board().build();
    await hideThenRemovalNextTurn(game);
    expect(game.p1.resources().energy).toBe(0);
    expect(game.p1.can("reveal", "call")).toBe(true);
    await game.p1.reveal("call");
    expect(game.chain().map((c) => c.cardId)).toEqual(["kill", "call"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "call", controller: P1, triggered: false });
  });

  test("LIFO: Sprite Call resolves first — a READY 3-Might Sprite token is played AT bf1 while the Warden is still alive and the removal still pending", async () => {
    const game = await board().build();
    await hideThenRemovalNextTurn(game);
    await game.p1.reveal("call");
    for (let i = 0; i < 8 && game.chain().some((c) => c.cardId === "call"); i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        // 811.1.d.3 — if a destination is asked at all, bf1 must be the answer.
        await game.p1.pick(d.options.find((o) => o.key === "battlefield-bf1" || o.key === "bf1")?.key ?? "battlefield-bf1");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.zoneOf("call")).toBe("trash");
    const made = sprites(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0] as string)).toMatchObject({ isReady: true, isToken: true, might: 3, zone: "battlefield-bf1" });
    expect(game.state(made[0] as string).keywords).toContain("Temporary");
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["kill"]);
  });

  test("then the removal resolves and kills the Warden — but the Sprite now holds bf1, so P1 keeps control", async () => {
    const game = await board().build();
    await hideThenRemovalNextTurn(game);
    await game.p1.reveal("call");
    game.script(P1, [(d) => (d.kind === "pick" ? (d.options.find((o) => o.key === "battlefield-bf1")?.key ?? d.options[0]?.key) : undefined)]);
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.zoneOf("kill")).toBe("trash");
    expect(sprites(game)).toHaveLength(1);
    expect(game.p1.units("bf1")).toHaveLength(1);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if P1 just passes, the Warden dies, P1 loses bf1 and the still-hidden Sprite Call is trashed unplayed", async () => {
    const game = await board().build();
    await hideThenRemovalNextTurn(game);
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P1);
    expect(game.zoneOf("call")).toBe("trash");
    expect(sprites(game)).toEqual([]);
  });
});
