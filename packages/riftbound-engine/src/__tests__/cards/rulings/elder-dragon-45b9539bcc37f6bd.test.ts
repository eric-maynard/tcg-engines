/**
 * Ruling 45b9539bcc37f6bd — Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · 12+[body]×4 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at each
 *      location. Deal 1 to them."
 *   × Flash (OGS-011 → ogs-011-024) · Spell · [Reaction] · 2 "Move up to 2 friendly units to base."
 *
 * Q: Elder Dragon's play trigger targets my unit at a battlefield; I Flash it to base in response. Is it still hit?
 *    And if I already had another unit in base, does the Dragon player get to pick which base unit dies?
 * A: No damage in either case. Targets are locked per location when the trigger is finalized; a unit that is no
 *    longer at the location it was chosen for fails the targeting restriction on resolution and is unaffected. The
 *    ability does not re-target — the Dragon player gets no new choice.
 * Rules: 355.5/355.7 (targets chosen at finalization), 359.3.e.5 (illegal target on resolution → not affected).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const FLASH = "ogs-011-024";

function board(withBaseUnit: boolean) {
  const s = scenario()
    .resources(P1, { energy: 12, power: { body: 4 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Yak" }, "yak")
    .hand(P2, FLASH, "flash")
    .hand(P1, ELDER_DRAGON, "elder");
  return withBaseUnit ? s.unit(P2, "base", { might: 2, name: "Ox" }, "ox") : s;
}

/** P1 plays Elder Dragon and locks in the given targets; P1 passes; P2 Flashes Yak home; everything resolves. */
async function dragonThenFlash(game: Game, targets: string[]): Promise<void> {
  await game.p1.play("elder");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "elder", triggered: true })]);
  // Targets are demanded NOW, at finalization (timing FIN), before anyone gets priority.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "elder" }, timing: "FIN" });
  await game.p1.pick(...targets);
  for (let i = 0; i < 4 && game.decision()?.kind === "pick" && game.decision()?.seat === P1; i++) {
    // per-location follow-up picks, if the engine asks location by location
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    const want = targets.filter((t) => keys.includes(t));
    if (want.length > 0) {
      await game.p1.pick(want[0]!);
    } else {
      await game.p1.decline();
    }
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "flash")).toBe(true);
  await game.p2.cast("flash", { targets: ["yak"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["elder", "flash"]);
  // Resolve LIFO; the Dragon player must never be asked to re-target.
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    expect(d?.kind === "pick" && d.seat === P1).toBe(false);
    if (d?.kind !== "action") break;
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 45b9539bcc37f6bd — Flash out from under Elder Dragon's per-location targets", () => {
  // BUG (all three): expected — a target moved off the location it was chosen "at" no longer satisfies the
  // per-location targeting requirement and is untouched on resolution (359.3.e.5). Actual — the engine follows the
  // unit to base and still deals Elder Dragon's 1 to it, which (any amount being lethal) kills it.
  test("ruling 45b9539bcc37f6bd — engine still deals the 1 to the Flashed unit in base and kills it. scenario 1 (no other unit in base): Yak, targeted at bf1, is Flashed to base first; the trigger then resolves and Yak takes NO damage and survives", async () => {
    const game = await board(false).build();
    await dragonThenFlash(game, ["yak"]);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("yak")).toBe("base");
    expect(game.state("yak").damage).toBe(0);
    expect(game.zoneOf("yak")).toBe("base"); // "any amount is lethal" never applied
    expect(game.zoneOf("elder")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("ruling 45b9539bcc37f6bd — engine still deals the 1 to the Flashed unit in base and kills it. scenario 2 (Ox already in base, both locked in): Flash sends Yak home; on resolution Ox (the base target) takes 1 and dies, Yak — chosen 'at bf1' — is unaffected, and P1 is never offered a new pick", async () => {
    const game = await board(true).build();
    await dragonThenFlash(game, ["yak", "ox"]);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("yak")).toBe("base");
    expect(game.state("yak").damage).toBe(0);
    expect(game.zoneOf("ox")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("ruling 45b9539bcc37f6bd — engine still deals the 1 to the Flashed unit in base and kills it. scenario 2 variant (only Yak targeted, Ox left alone): after Flash, neither base unit is damaged — the ability does not slide onto Ox", async () => {
    const game = await board(true).build();
    await dragonThenFlash(game, ["yak"]);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("yak")).toBe("base");
    expect(game.state("yak").damage).toBe(0);
    expect(game.zoneOf("ox")).toBe("base");
    expect(game.state("ox").damage).toBe(0);
  });
});
