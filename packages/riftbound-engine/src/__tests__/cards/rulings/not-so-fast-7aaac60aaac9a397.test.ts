/**
 * Ruling 7aaac60aaac9a397 — Not So Fast (SFD-045 → sfd-045-221) · Reaction · 2 + [calm] · "Counter an enemy spell or ability that
 *   chooses a friendly unit or gear."   × Mirror Image (UNL-200 → unl-200-219) · Action · 3 + [rainbow][rainbow] · "Choose a unit.
 *   Play a ready Reflection unit token to your base. It becomes a copy of that unit. Give it [Temporary]."
 *
 * Q: Can Not So Fast counter Mirror Image?
 * A: Only if the opponent chose one of MY units with it (enemy spell + chooses a unit friendly to me). If they Mirror Image
 *    their own unit, that unit is an enemy from my side and Not So Fast has no legal object.
 * Rules: 355.9.b ("enemy"/"friendly" are relative to the spell's controller), 425 (counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const MIRROR_IMAGE = "unl-200-219";

/** P2's turn 3. P2: Mirror Image + 3 + [mind][order], own 4-Might Model in base. P1: Not So Fast + 2 + [calm], own 3-Might Mine in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { mind: 1, order: 1 } })
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .unit(P2, "base", { might: 4, name: "Model" }, "theirs")
    .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
    .hand(P2, MIRROR_IMAGE, "mirror")
    .hand(P1, NOT_SO_FAST, "nsf");
}

function nsfOffered(game: Game): string[] {
  const opt = game.p1.option("cast", "nsf");
  return (opt?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];
}

const reflections = (game: Game) => game.findAll({ name: "Mine" }).concat(game.findAll({ name: "Model" })).filter((id) => game.state(id).isToken && game.zoneOf(id) !== "gone");

async function mirrorAt(game: Game, target: "mine" | "theirs"): Promise<void> {
  await game.p2.cast("mirror", { targets: target });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mirror", controller: P2, targets: [target] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling 7aaac60aaac9a397 — Not So Fast vs Mirror Image depends on whose unit was chosen", () => {
  test("Mirror Image choosing MY unit: enemy spell + friendly chosen unit → Not So Fast is legal, counters it, and no Reflection is made", async () => {
    const game = await board().build();
    await mirrorAt(game, "mine");
    expect(game.p1.can("cast", "nsf")).toBe(true);
    expect(nsfOffered(game)).toContain("mirror");
    await game.p1.cast("nsf", { targets: "mirror" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("mirror")).toBe("trash"); // countered
    expect(reflections(game)).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } }); // no refund
    expect(game.violations()).toEqual([]);
  });

  test("Mirror Image choosing THEIR OWN unit: that unit is an enemy to me → Not So Fast has no legal object (not castable, attempt refused) and the Reflection is made", async () => {
    const game = await board().build();
    await mirrorAt(game, "theirs");
    expect(nsfOffered(game)).not.toContain("mirror");
    expect(game.p1.can("cast", "nsf")).toBe(false);
    const r = await game.p1.try((p) => p.cast("nsf", { targets: "mirror" }));
    expect(r.ok).toBe(false);
    await game.settle();
    expect(game.zoneOf("mirror")).toBe("trash"); // resolved normally
    expect(game.zoneOf("nsf")).toBe("hand");
    const toks = reflections(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ controller: P2, isToken: true, name: "Model", zone: "base" });
  });
});
