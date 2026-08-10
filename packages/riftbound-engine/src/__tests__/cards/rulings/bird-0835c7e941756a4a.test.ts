/**
 * Ruling 0835c7e941756a4a — Bird token (UNL-T02 → unl-t02) via Flurry of Feathers (UNL-044 → unl-044-219)
 *   Flurry of Feathers · Spell · Calm · 4+[calm][calm] · Reaction · "Choose one — Counter a spell. · Play four
 *   1 [Might] Bird unit tokens with [Deflect]."
 *
 * Q: Can I play the Bird tokens directly onto a battlefield I am currently ATTACKING?
 * A: No. Tokens follow the normal rules for playing units: base or a battlefield you CONTROL. While you attack
 *    a battlefield an opponent controls it, so it is not a legal location. If you control no battlefield at
 *    all, the tokens must go to your base.
 * Rules: 179.1.d / 185 (tokens are played like units), 355.2 / 439.2.b.1 (a unit is played to base or a
 *        battlefield you control), 813 (Reaction — castable with Focus in the combat showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLURRY_OF_FEATHERS = "unl-044-219";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const birdsOf = (game: Game, at?: string) => game.p1.units(at).filter((id) => game.state(id).isToken);

/**
 * P1's turn. P2 holds bf1 with a 2-Might Guard; P1 has a 3-Might Raider in base and Flurry with exactly
 * 4 + calm calm. `withOwnBattlefield` also gives P1 control of bf2 (held by a 1-Might Sentry).
 */
function board(withOwnBattlefield: boolean) {
  const s = scenario()
    .resources(P1, { energy: 4, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, FLURRY_OF_FEATHERS, "fof");
  return withOwnBattlefield ? s.battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 1, name: "Sentry" }, "sentry") : s;
}

/** Raider attacks bf1 → combat showdown with P1 (attacker) holding Focus; P1 casts Flurry in Bird mode and it resolves. */
async function attackThenCastBirds(game: Game): Promise<void> {
  await game.p1.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
  expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // the attacked battlefield is the OPPONENT's
  expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
  expect(game.p1.can("cast", "fof")).toBe(true);
  await game.p1.cast("fof", { mode: 1 });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["fof"]);
  // Both pass priority → Flurry resolves (token placement prompts, if any, follow); stop right there.
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 0835c7e941756a4a — Bird tokens can't be played to the battlefield you are attacking", () => {
  test("attacking bf1 while controlling bf2: each Bird's location offer is base | bf2 — never bf1; choosing bf2/base lands them there, exhausted", async () => {
    const game = await board(true).build();
    await attackThenCastBirds(game);
    for (let i = 0; i < 4; i++) {
      const d = game.decision() as PickDecision;
      expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
      const keys = d.options.map((o) => o.key).sort();
      expect(keys).toEqual(["base", "battlefield-bf2"]);
      expect(keys).not.toContain("battlefield-bf1");
      await game.p1.pick(i < 2 ? "battlefield-bf2" : "base");
    }
    expect(game.zoneOf("fof")).toBe("trash");
    expect(birdsOf(game)).toHaveLength(4);
    expect(birdsOf(game, "bf2")).toHaveLength(2);
    expect(birdsOf(game, "base")).toHaveLength(2);
    expect(birdsOf(game, "bf1")).toHaveLength(0);
    for (const b of birdsOf(game)) {
      expect(game.state(b)).toMatchObject({ isExhausted: true, might: 1 });
      expect(game.state(b).keywords).toContain("Deflect");
    }
    // The attack itself is untouched: still Raider alone vs Guard at bf1.
    expect(game.cardsAt("bf1").sort()).toEqual(["guard", "raider"]);
  });

  test("attacking bf1 while controlling NO battlefield: the Birds must go to base (no location choice includes bf1); all four land in base", async () => {
    const game = await board(false).build();
    await attackThenCastBirds(game);
    // With base the only legal location the engine may lock it without asking; answer any prompt it does raise.
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind !== "pick") {
        break;
      }
      expect(d).toMatchObject({ seat: P1, semantics: "destination" });
      expect(d.options.map((o) => o.key)).toEqual(["base"]);
      await game.p1.pick("base");
    }
    expect(game.zoneOf("fof")).toBe("trash");
    expect(birdsOf(game)).toHaveLength(4);
    expect(birdsOf(game, "base")).toHaveLength(4);
    expect(birdsOf(game, "bf1")).toHaveLength(0);
    expect(game.cardsAt("bf1").sort()).toEqual(["guard", "raider"]);
  });

  test("the combat then resolves with only the Raider attacking: Guard (2) dies, Raider (3) conquers bf1; the Birds never took part", async () => {
    const game = await board(false).build();
    await attackThenCastBirds(game);
    await game.settle({ policy: "first" }); // place tokens (base only) and pass focus through combat
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(birdsOf(game, "base")).toHaveLength(4);
    expect(birdsOf(game, "bf1")).toHaveLength(0);
    for (const b of birdsOf(game)) {
      expect(game.state(b).damage).toBe(0);
    }
    expect(game.violations()).toEqual([]);
  });
});
