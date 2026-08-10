/**
 * Ruling c118ea12c3d4410d — Sprite Call (OGN-094 → ogn-094-298) · Spell · Mind · 3 · [Hidden] [Action]
 *     "Play a ready 3 Might Sprite unit token with [Temporary]."   × Sprite token (OGN-274 → ogn-274-298)
 *
 * Q: Sprite Call is hidden at battlefield A and is played from there during a showdown at battlefield B. Where can the
 *    Sprite be played?
 * A: At battlefield A — a unit played by a hidden spell must be played where the hidden card was. Played from HAND
 *    instead, the Sprite could go to base or any battlefield you control. The restriction comes from being hidden, not
 *    from the showdown timing.
 * Rules: 811.1.d.1 (a hidden card's units are played "here"), 419.3 (playing a unit: base or a controlled battlefield),
 *        806 / 811 (Action / hidden Reaction timing in showdowns).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";

const sprites = (game: Game) => game.findAll({ name: "Sprite", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");

describe("Ruling c118ea12c3d4410d — a hidden Sprite Call makes its Sprite at the battlefield it was hidden at", () => {
  test("hidden at A, played during the showdown at B (P1 has Focus): NO destination is asked — the ready 3-Might Temporary Sprite appears at battlefield A (not B, not base)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P1 })
      .unit(P1, "bfA", { might: 2, name: "Holder A" }, "holderA")
      .unit(P1, "bfB", { might: 2, name: "Holder B" }, "holderB")
      .facedown(P1, "bfA", SPRITE_CALL, "call")
      .unit(P2, "base", { might: 3, name: "Attacker" }, "attacker")
      .build();
    await game.p2.move("attacker", "bfB");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfB", isCombatShowdown: true });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "call")).toBe(true); // playable from A even though the showdown is at B
    await game.p1.reveal("call");
    expect(game.p1.energy()).toBe(0); // for [0]
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "call", controller: P1 })]);
    let askedDestination = false;
    for (let i = 0; i < 8 && game.zoneOf("call") !== "trash"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        askedDestination = true;
        break;
      }
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(askedDestination).toBe(false);
    expect(game.zoneOf("call")).toBe("trash");
    const made = sprites(game);
    expect(made).toHaveLength(1);
    expect(game.zoneOf(made[0] as string)).toBe("battlefield-bfA");
    expect(game.state(made[0] as string)).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 3 });
    expect(game.state(made[0] as string).keywords).toContain("Temporary");
    expect(game.p1.units("bfB")).toEqual(["holderB"]);
    expect(game.p1.units("base")).toEqual([]);
    // The bfB showdown carries on.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — cast from HAND (P1's turn, [3]): P1 IS asked where the Sprite goes, offered base and every battlefield P1 controls (A and B) but not the enemy's C", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 3 })
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P1 })
      .battlefield("bfC", { controller: P2 })
      .unit(P1, "bfA", { might: 2, name: "Holder A" }, "holderA")
      .unit(P1, "bfB", { might: 2, name: "Holder B" }, "holderB")
      .unit(P2, "bfC", { might: 2, name: "Holder C" }, "holderC")
      .hand(P1, SPRITE_CALL, "call")
      .build();
    await game.p1.cast("call");
    expect(game.p1.energy()).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bfA", "battlefield-bfB"]);
    await game.p1.pick("battlefield-bfB");
    await game.settle();
    const made = sprites(game);
    expect(made).toHaveLength(1);
    expect(game.zoneOf(made[0] as string)).toBe("battlefield-bfB");
    expect(game.violations()).toEqual([]);
  });
});
