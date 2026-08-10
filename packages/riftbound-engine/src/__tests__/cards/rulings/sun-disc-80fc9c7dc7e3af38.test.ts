/**
 * Ruling 80fc9c7dc7e3af38 — Sun Disc (OGN-021 → ogn-021-298) · Gear · "[Exhaust]: [Legion] — The next unit you play this turn enters
 *   ready. (Get the effect if you've played another card this turn.)"   × Immortal Phoenix (OGN-037 → ogn-037-298) · 3 Might ·
 *   "When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *
 * Q: Can I activate Sun Disc AFTER casting the burn spell but BEFORE the Phoenix revives, so it enters ready?
 * A: No — Sun Disc's ability is not a Reaction, so it cannot be used while the spell / the Phoenix trigger are pending. Do it
 *    first: play a card (Sun Disc itself counts on the turn it is played), exhaust Sun Disc, THEN cast the burn spell; the Phoenix
 *    trigger plays it from trash and it enters ready.
 * Rules: 812 (Legion), 336–337 (Closed state: only Reactions), 805-style "enters ready" one-shot, 383 (Phoenix trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SUN_DISC = "ogn-021-298";
const IMMORTAL_PHOENIX = "ogn-037-298";
/** Inline burn spell: deal 3 to a unit (kills the 2-Might Target). */
const BURN = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Burn",
  timing: "action",
} as const;
const WARMUP = { cardType: "unit", energyCost: 1, might: 1, name: "Warmup" } as const;

/**
 * P1's turn 3. P1: Sun Disc ready in base (played earlier), Phoenix in trash, hand = Warmup (1) + Burn (1); pool = 1 + 1 + the
 * Phoenix's [1][fury]. P2's 2-Might Target stands at P2's bf1.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, SUN_DISC, "disc")
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .unit(P2, "bf1", { might: 2, name: "Target" }, "target")
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .hand(P1, WARMUP, "warmup")
    .hand(P1, BURN, "burn");
}

/** Drive the Phoenix opt-in: pay, take base if a destination is asked, settle. */
async function revivePhoenix(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      expect(d.source?.cardId).toBe("phoenix");
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      const base = d.options.find((o) => o.key === "base" || /base/i.test(o.label));
      await game.p1.pick(base ? base.key : (d.options[0]?.key as string));
    } else if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  await game.settle();
  expect(game.zoneOf("phoenix")).toBe("base");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
}

describe("Ruling 80fc9c7dc7e3af38 — Sun Disc must be exhausted BEFORE the burn spell for the revived Phoenix to enter ready", () => {
  test("correct line: play Warmup (Legion on) → exhaust Sun Disc → cast Burn killing the Target → pay [1][fury]: the Phoenix is played from trash and enters READY", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "disc")).toBe(false); // Legion: nothing else played yet this turn
    await game.p1.play("warmup");
    await game.settle();
    expect(game.p1.can("activate", "disc")).toBe(true);
    await game.p1.activate("disc");
    await game.settle();
    expect(game.state("disc").isExhausted).toBe(true);
    await game.p1.cast("burn", { targets: "target" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("target")).toBe("trash");
    await revivePhoenix(game);
    expect(game.state("phoenix").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the asked line: Warmup → cast Burn FIRST — while Burn is on the chain, and again while the Phoenix trigger is pending, Sun Disc's [Exhaust] (not a Reaction) is NOT activatable; the Phoenix then enters EXHAUSTED", async () => {
    const game = await board().build();
    await game.p1.play("warmup");
    await game.settle();
    await game.p1.cast("burn", { targets: "target" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["burn"]);
    expect(game.p1.can("activate", "disc")).toBe(false); // closed state
    expect((await game.p1.try((p) => p.activate("disc"))).ok).toBe(false);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Burn resolves, Target dies, Phoenix trigger
    expect(game.zoneOf("target")).toBe("trash");
    // Whatever is being asked now (the Phoenix opt-in / priority on its trigger), Sun Disc is still not an option.
    expect(game.decision()?.kind === "action" ? game.p1.can("activate", "disc") : (game.decision() as { actions?: readonly { card?: string }[] })?.actions?.some((a) => a.card === "disc") ?? false).toBe(false);
    await revivePhoenix(game);
    expect(game.state("phoenix").isReady).toBe(false);
    expect(game.state("disc").isExhausted).toBe(false); // never got used
  });

  // RULING-CONFLICT: riftjudge 80fc9c7dc7e3af38's aside says Sun Disc itself counts as the card played that turn, so it could
  // be exhausted right after being played. rule 812.1.c says the opposite in as many words — the Dependent Ability is Active
  // only "as long as a card different than the one with the Legion ability has been Finalized by you on the same turn"
  // (812.1.b.1: "if you have played ANOTHER card this turn"). Engine follows the CR (evaluateLegionCondition excludes the
  // source card); the ruling's actual answer — Sun Disc is not a Reaction, exhaust it before the burn spell — is untouched and
  // is asserted by the two tests above.
  test("a just-played Sun Disc does NOT satisfy its own Legion (rule 812.1.c, 'a card different than the one with the Legion ability')", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 4, power: { fury: 2 } }) // Sun Disc 2+[fury], Burn 1, Phoenix [1][fury]
      .battlefield("bf1", { controller: P2 })
      .hand(P1, SUN_DISC, "disc")
      .trash(P1, IMMORTAL_PHOENIX, "phoenix")
      .unit(P2, "bf1", { might: 2, name: "Target" }, "target")
      .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
      .hand(P1, BURN, "burn")
      .build();
    await game.p1.play("disc");
    await game.settle();
    expect(game.zoneOf("disc")).toBe("base");
    expect(game.p1.can("activate", "disc")).toBe(false); // no OTHER card played this turn yet
    expect((await game.p1.try((p) => p.activate("disc"))).ok).toBe(false);
    // Casting Burn is the "other card"; but it also kills the Target, so the Phoenix revives with Legion never having fired.
    await game.p1.cast("burn", { targets: "target" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await revivePhoenix(game);
    expect(game.state("phoenix").isReady).toBe(false);
    expect(game.state("disc").isExhausted).toBe(false);
    // …and only now, with Burn Finalized, is Sun Disc's Legion ability Active.
    expect(game.p1.can("activate", "disc")).toBe(true);
  });
});
