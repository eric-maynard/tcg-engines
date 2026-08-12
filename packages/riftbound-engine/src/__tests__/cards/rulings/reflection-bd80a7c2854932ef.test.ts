/**
 * Ruling bd80a7c2854932ef — Reflection (UNL-T06 → unl-t06) · Unit token
 *     "(I become a copy of something when played. I don't get that card's play effects.)"
 *   × Mirror Image (UNL-200 → unl-200-219) · [3][rainbow][rainbow] "Choose a unit. Play a ready Reflection unit
 *     token to your base. It becomes a copy of that unit. Give it [Temporary]."
 *   × Ruined Rex (UNL-067 → unl-067-219) · [6][mind] · 6 Might, as the unit being copied.
 *
 * Q: Does a Reflection token gain the Energy and Power costs of the unit it copies?
 * A: Yes. Cost is a copyable trait: a token normally has no cost, but once it becomes a copy of a card it takes
 *    on that card's Energy and Power costs (along with its Might, name and abilities). Only the play effects are
 *    excluded.
 * Rules: 477.1 (copy = all copyable characteristics, cost included), 186 (a token's own printed cost is nothing),
 *        182.1.d (tokens are units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const RUINED_REX = "unl-067-219";

/** P1's turn with exactly Mirror Image's cost. P2's Ruined Rex ([6][mind], 6 Might) is the copy source. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .unit(P2, "base", RUINED_REX, "rex")
    .hand(P1, MIRROR_IMAGE, "mirror");
}

/** Cast Mirror Image naming the Rex, resolve, and return the Reflection token's id. */
async function makeReflection(game: Game): Promise<string> {
  await game.p1.cast("mirror", { targets: "rex" });
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    if (d?.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
      continue;
    }
    break;
  }
  const token = game.p1.units("base")[0];
  expect(token).toBeDefined();
  return token!;
}

describe("Ruling bd80a7c2854932ef — a Reflection token copying a unit takes that unit's Energy and Power costs", () => {
  test("the token really is a copy: it carries the copied unit's name, Might and abilities", async () => {
    const game = await board().build();
    const token = await makeReflection(game);
    expect(game.state(token)).toMatchObject({ baseMight: 6, isToken: true, name: "Ruined Rex" });
    expect(game.state(token).keywords).toContain("Deathknell");
  });

  test("ruling: its Energy cost is the copied card's [6], not the token's own nothing", async () => {
    const game = await board().build();
    const token = await makeReflection(game);
    expect(game.state(token).energyCost).toBe(6);
  });

  test("…and its Power cost is the copied card's [mind] too", async () => {
    const game = await board().build();
    const token = await makeReflection(game);
    expect(game.state(token).powerCost).toEqual(["mind"]);
    expect(game.state("rex").powerCost).toEqual(["mind"]); // same as the original
    expect(game.violations()).toEqual([]);
  });

  test("Mirror Image's own rider still applies on top of the copy: the token has [Temporary]", async () => {
    const game = await board().build();
    const token = await makeReflection(game);
    expect(game.state(token).keywords).toContain("Temporary");
  });
});
