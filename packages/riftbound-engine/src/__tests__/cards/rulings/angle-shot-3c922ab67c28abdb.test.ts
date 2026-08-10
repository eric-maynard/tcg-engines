/**
 * Ruling 3c922ab67c28abdb — Angle Shot (SFD-011 → sfd-011-221) · Reaction · Fury · [2]
 *     "Choose a unit and an Equipment with the same controller. Attach that Equipment to that unit or detach that
 *      Equipment from that unit. Draw 1."
 *   × Eye of the Herald (SFD-153 → sfd-153-221) · Equipment · +0 — grants the wearer "When I move, play a 1 [Might]
 *     Recruit unit token here."
 *
 * Q: The Herald wearer moves; with its move trigger on the chain, Angle Shot detaches the Eye. Does the trigger fizzle,
 *    and where does the token go?
 * A: The trigger stays on the chain and resolves: the equipment gave the ability to the UNIT, so "here" is the unit's
 *    location — the token is played where the unit now is (the battlefield). Nuances: if the unit is moved to base
 *    first, the token is made in base; if the unit itself is bounced/killed, "here" is null and no token is made.
 * Rules: 150.2 / 718.3 (Effect Text is the wearer's ability), 359.3.f.1–2 ("here" is a referent read on execution),
 *        359.3.f.2.a (null referent → instruction ignored), 383 (a triggered ability on the chain is independent of
 *        its source's later state).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ANGLE_SHOT = "sfd-011-221";
const EYE_OF_THE_HERALD = "sfd-153-221";
const FLASH = "ogs-011-024"; // Reaction [2]: move up to 2 friendly units to base
const RETREAT = "ogn-104-298"; // Reaction [1]: return a friendly unit to hand; owner channels 1 rune exhausted

/**
 * P1's turn. P1's Knight (3) in base wears Eye of the Herald; bf1 is empty and uncontrolled (so the move opens only a
 * non-combat showdown — no combat noise). P1 holds Angle Shot, Flash and Retreat with [5].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Far Guard" }, "far")
    .unit(P1, "base", { might: 3, name: "Knight" }, "knight", { equippedWith: ["eye"] } as Record<string, unknown>)
    .card("eye", { def: EYE_OF_THE_HERALD, meta: { attachedTo: "knight" } as Record<string, unknown>, owner: P1, zone: "base" })
    .hand(P1, ANGLE_SHOT, "shot")
    .hand(P1, FLASH, "flash")
    .hand(P1, RETREAT, "retreat")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 });

/** Knight moves base → bf1: its (Eye-granted) move trigger is on the chain, P1 holding priority. */
async function knightMoves(): Promise<Game> {
  const game = await board().build();
  expect(game.state("knight").attachments).toEqual(["eye"]);
  await game.p1.move("knight", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "knight", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** Play `spell` with `targets` on top of the trigger and pass priority until the spell has resolved (trigger still pending). */
async function respondAndResolve(game: Game, spell: string, targets: string | string[]): Promise<void> {
  await game.p1.cast(spell, { targets });
  expect(game.chain().map((c) => c.cardId)).toEqual(["knight", spell]);
  for (let i = 0; i < 6 && game.zoneOf(spell) !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => /detach/i.test(o.label))) {
      await game.p1.pick(d.options.find((o) => /detach/i.test(o.label))?.key as string);
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf(spell)).toBe("trash");
  expect(game.chain().map((c) => c.cardId)).toEqual(["knight"]); // the move trigger is STILL there
}

describe("Ruling 3c922ab67c28abdb — the Herald move trigger survives losing the Eye; the token follows the UNIT's location", () => {
  test("control: unanswered, the trigger makes one Recruit token at bf1 (where the Knight moved to)", async () => {
    const game = await knightMoves();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(recruits(game)).toHaveLength(1);
    expect(game.locationOf(recruits(game)[0]!)).toBe("bf1");
  });

  test("Angle Shot [Knight, Eye] in response DETACHES the Eye and draws 1 — and the trigger does not fizzle: it still resolves and the Recruit is played at bf1, the Knight's location", async () => {
    const game = await knightMoves();
    expect(game.p1.can("cast", "shot")).toBe(true);
    await respondAndResolve(game, "shot", ["knight", "eye"]);
    expect(game.state("knight").attachments).toEqual([]);
    expect(game.state("eye").attachedTo).toBeUndefined();
    expect(game.p1.hand()).toContain("d1"); // "Draw 1"
    // Now let the trigger resolve.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(recruits(game)).toHaveLength(1);
    expect(game.locationOf(recruits(game)[0]!)).toBe("bf1");
    expect(game.locationOf("knight")).toBe("bf1");
    await game.settle();
    expect(game.zoneOf("eye")).toBe("base"); // loose gear ends up in base, still P1's — never trashed
    expect(game.violations()).toEqual([]);
  });

  test("nuance — the unit is moved to BASE (Flash) before the trigger resolves: 'here' is read on execution → the Recruit is made in P1's base, not at bf1", async () => {
    const game = await knightMoves();
    await game.p1.cast("flash", { targets: ["knight"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["knight", "flash"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Flash resolves: Knight → base (this is itself a move, so the Eye triggers AGAIN)
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("knight")).toBe("base");
    expect(recruits(game)).toEqual([]); // the original trigger has not resolved yet
    const pending = game.chain().filter((c) => c.cardId === "knight" && c.triggered);
    expect(pending.length).toBeGreaterThanOrEqual(1); // the ORIGINAL bf1-move trigger is still on the chain
    await game.settle();
    expect(game.chain()).toEqual([]);
    // Every Recruit — in particular the one from the original trigger — was made where the Knight IS (base); none at bf1.
    expect(recruits(game).length).toBe(pending.length);
    for (const r of recruits(game)) {
      expect(game.locationOf(r)).toBe("base");
    }
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("nuance — the unit itself is BOUNCED to hand (Retreat) before the trigger resolves: 'here' is null → the trigger resolves without effect, no Recruit anywhere", async () => {
    const game = await knightMoves();
    await respondAndResolve(game, "retreat", "knight");
    expect(game.zoneOf("knight")).toBe("hand");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(recruits(game)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
