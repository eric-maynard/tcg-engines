/**
 * Ruling eb6a59f1c2a05dba — Miss Fortune, Buccaneer (OGN-193 → ogn-193-298) · Champion Unit · Chaos · 4+[chaos] · 4 Might
 *     "You may play me to an open battlefield. Friendly units may be played to open battlefields."
 *   × Sprite Call (ogn-094-298) "[Hidden] … [Action] Play a ready 3 [Might] Sprite unit token with [Temporary]."  × Sprite token (ogn-274-298)
 *   × Tideturner (ogn-199-298) "[Hidden] … When you play me, you may choose a unit you control at another location …" (a Hidden UNIT)
 *
 * Q: With Miss Fortune out, can a hidden unit — or the unit a hidden spell (Sprite Call) plays — be played to an OPEN
 *    battlefield instead of the battlefield it was hidden at?
 * A: No. A card played from facedown must be played to the battlefield where it was hidden ("can't beats can": the hidden
 *    rule's requirement trumps Miss Fortune's permission). This holds for hidden units and for units a hidden spell plays.
 * Rules: 811.1.c/811.1.d (play from facedown "here"), 054 (can't beats can), Miss Fortune's permission for normal plays.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MISS_FORTUNE = "ogn-193-298";
const SPRITE_CALL = "ogn-094-298";
const TIDETURNER = "ogn-199-298";
const SKULKER = "ogn-175-298"; // a plain 3-cost unit in hand — the "normal" play that Miss Fortune DOES widen

/**
 * P1's turn (turn 2; the facedown cards were hidden on an earlier turn). Miss Fortune in P1's base; P1 holds bf1 with a
 * Holder and has Tideturner + Sprite Call facedown there; bf2 is OPEN (uncontrolled, empty). Skulker in hand with [3].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", MISS_FORTUNE, "mf")
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .facedown(P1, "bf1", TIDETURNER, "tt")
    .facedown(P1, "bf1", SPRITE_CALL, "call")
    .hand(P1, SKULKER, "skulker");
}

const locations = (game: Game, verb: string, card: string) =>
  (game.p1.option(verb, card)?.fields.find((f) => f.name === "location" || f.arg === "to")?.options ?? []) as string[];

const tokensAt = (game: Game, loc: string) => game.p1.units(loc).filter((id) => game.state(id).isToken);

describe("Ruling eb6a59f1c2a05dba — Miss Fortune widens NORMAL plays only; facedown cards still play 'here'", () => {
  test("Miss Fortune's permission is live: a unit from HAND (Skulker) is offered base, bf1 AND the open bf2, and can actually be played to bf2", async () => {
    const game = await board().build();
    expect(locations(game, "play", "skulker").sort()).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
    await game.p1.play("skulker", { to: "bf2" });
    await game.settle();
    expect(game.locationOf("skulker")).toBe("bf2");
  });

  test("the hidden UNIT (Tideturner at bf1) has exactly one way to be played — no destination choice is offered at all, bf2 cannot be named, and revealing it puts it AT bf1", async () => {
    const game = await board().build();
    expect(game.p1.can("reveal", "tt")).toBe(true);
    expect(game.p1.option("reveal", "tt")?.variantCount).toBe(1);
    expect(locations(game, "reveal", "tt")).toEqual([]); // nothing to choose: "here" only
    // Forcing bf2 through the raw params is refused (or ignored) — it never lands at bf2.
    const forced = await game.p1.try((p) => p.reveal("tt", { params: { location: "bf2", to: "bf2" } }));
    if (forced.ok) {
      expect(game.locationOf("tt")).toBe("bf1");
    } else {
      await game.p1.reveal("tt");
    }
    // Decline / skip Tideturner's optional swap; let everything settle.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else if (d?.kind === "pick" && d.seat === P1 && d.allowDecline) {
        await game.p1.decline();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.locationOf("tt")).toBe("bf1");
    expect(game.p1.units("bf2")).toEqual([]);
  });

  test("the hidden SPELL (Sprite Call at bf1): its Sprite token is played AT bf1 — never to the open bf2 and with no destination prompt — ready, 3 Might, [Temporary]", async () => {
    const game = await board().build();
    expect(game.p1.option("reveal", "call")?.variantCount).toBe(1);
    await game.p1.reveal("call");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "call", controller: P1 })]);
    let sawDestinationPrompt = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => /bf2/.test(o.key))) {
        sawDestinationPrompt = true;
        break;
      }
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(sawDestinationPrompt).toBe(false);
    expect(game.zoneOf("call")).toBe("trash");
    expect(tokensAt(game, "bf2")).toEqual([]);
    expect(tokensAt(game, "base")).toEqual([]);
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ isReady: true, might: 3, name: "Sprite" });
    expect(game.state(toks[0] as string).keywords).toContain("Temporary");
    expect(game.violations()).toEqual([]);
  });
});
