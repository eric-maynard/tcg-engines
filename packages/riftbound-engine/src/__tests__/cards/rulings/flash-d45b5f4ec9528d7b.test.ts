/**
 * Ruling d45b5f4ec9528d7b — Flash (OGS-011 → ogs-011-024) · Reaction [2] "Move up to 2 friendly units to base."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action [2][chaos] "Move a friendly unit and ready it."
 *   × Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might "When I move, discard 1, then draw 1." (the nuance's chain-making mover)
 *
 * Q: Opponent standard-moves to battlefield B. Can I Flash my unit at A "in reaction" to the move, then Ride the Wind a unit from
 *    base to B once the showdown starts?
 * A: A standard move creates no chain, so there is nothing to react to with Flash. But once the showdown at B begins and you get
 *    Focus you may cast Ride the Wind (an Action needs Focus, not just priority) to move a unit from base to B. Nuance: if the mover
 *    has a move trigger (Traveling Merchant) a chain does exist before the showdown, and Flash could be played into it.
 * Rules: 140.3 (standard move is not a chain item), 340–347 (showdown; Focus), 331/336 (Reactions on a chain, Actions need Open+Focus).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const RIDE_THE_WIND = "ogn-173-298";
const TRAVELING_MERCHANT = "ogn-185-298";

/** P2's turn. P1: unit A at bfA (P1's), unit B in base, Flash + Ride the Wind with [4]+chaos. bfB empty & uncontrolled. */
function board(mover: "vanilla" | "merchant") {
  const s = scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P1, "bfA", { might: 2, name: "Unit A" }, "a")
    .unit(P1, "base", { might: 3, name: "Unit B" }, "b")
    .hand(P1, FLASH, "flash")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P2, { might: 1, name: "Spare" }, "spare");
  return mover === "vanilla" ? s.unit(P2, "base", { might: 3, name: "Raider" }, "mover") : s.unit(P2, "base", TRAVELING_MERCHANT, "mover");
}

describe("Ruling d45b5f4ec9528d7b — no Flash 'in response' to a plain move; Ride the Wind once you have Focus in the showdown", () => {
  test("a standard move makes NO chain: the very next decision is already the showdown at bfB (P2's Focus) — P1 never got a priority window to Flash", async () => {
    const game = await board("vanilla").build();
    await game.p2.move("mover", "bfB");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfB" });
    // Without Focus P1 has no play at all right now (not Flash, not Ride the Wind).
    expect(game.p1.legal().some((o) => o.verb === "cast")).toBe(false);
    expect((await game.p1.try((p) => p.cast("flash", { targets: ["a"] }))).ok).toBe(false);
    expect(game.locationOf("a")).toBe("bfA");
  });

  test("when P1 gains Focus in that showdown, Ride the Wind (Action) is legal: Unit B moves from base to bfB and is readied", async () => {
    const game = await board("vanilla").build();
    await game.p2.move("mover", "bfB");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { targets: "b", answers: ["battlefield-bfB", "bfB"] });
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        expect(d.options.map((o) => o.key)).toContain("battlefield-bfB");
        await game.p1.pick("battlefield-bfB");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("b")).toBe("bfB");
    expect(game.state("b").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: a Traveling Merchant moving DOES open a chain (its move trigger) before the showdown — there P1 holds priority and may Flash (Reaction), but not Ride the Wind (Action)", async () => {
    const game = await board("merchant").build();
    await game.p2.move("mover", "bfB");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mover", controller: P2, triggered: true })]);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0); // showdown not begun yet — only staged
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "flash")).toBe(true);
    expect(game.p1.can("cast", "rtw")).toBe(false);
    await game.p1.cast("flash", { targets: ["a"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["mover", "flash"]);
    // Flash resolves (A → base), then the Merchant's discard/draw, and only then does the showdown at bfB begin.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "spare")?.key ?? d.options[0]!.key);
      } else {
        break;
      }
    }
    expect(game.locationOf("a")).toBe("base");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfB" });
  });
});
