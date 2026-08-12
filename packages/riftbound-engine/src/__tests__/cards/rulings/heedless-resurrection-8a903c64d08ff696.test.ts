/**
 * Ruling 8a903c64d08ff696 — Heedless Resurrection (UNL-142 → unl-142-219) · [Reaction] Spell · Chaos · [2][chaos]
 *     "As an additional cost to play this, kill a friendly unit. Play a unit from your trash that costs no more Energy
 *      and no more Power than the killed unit, ignoring its cost."
 *
 * Q: Can Heedless Resurrection bring back the very unit killed to pay for it?
 * A: No. The target in the trash is chosen in step 2 of playing the card, while the unit you are about to kill is still
 *    on the board and therefore not in the trash; the additional cost is only paid in step 4, by which time the choice
 *    is locked and cannot be changed.
 * Rules: 355.9.a (targets chosen before costs are paid), 355.15 (choices are locked once made),
 *        356 (additional costs paid at step 4), 425.1.c (costs are never refunded).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEEDLESS = "unl-142-219";

/** P1's turn with exactly [2][chaos]. `victim` (3-cost) waits in base to be killed; the trash holds whatever is passed. */
function board(trash: readonly { alias: string; def: Record<string, unknown> }[]) {
  let b = scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .unit(P1, "base", { energyCost: 3, might: 3, name: "Victim" }, "victim")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, HEEDLESS, "heedless");
  for (const t of trash) {
    b = b.trash(P1, t.def, t.alias);
  }
  return b;
}

const CORPSE = { cardType: "unit", energyCost: 2, might: 2, name: "Corpse" } as const;

/** What the spell offers as the unit to play from the trash. */
const trashOptions = (game: Game): string[] =>
  ((game.p1.option("cast", "heedless")?.fields.find((f) => f.arg === "targets")?.options ?? []) as unknown[])
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .map(String);

describe("Ruling 8a903c64d08ff696 — the unit killed as the cost cannot be the unit resurrected", () => {
  test("ruling 8a903c64d08ff696 — with an EMPTY trash the spell cannot be played at all, even though a friendly unit is standing there to be killed", async () => {
    const game = await board([]).build();
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.units("base")).toContain("victim"); // the cost is payable …
    expect(game.p1.can("cast", "heedless")).toBe(false); // … but there is nothing in the trash to choose
    expect((await game.p1.try((p) => p.cast("heedless", { sacrifice: "victim" }))).ok).toBe(false);
    expect(game.zoneOf("victim")).toBe("base"); // nothing was killed
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
  });

  test("the unit that is about to be killed is never among the offered targets — only cards already in the trash are", async () => {
    const game = await board([{ alias: "corpse", def: CORPSE }]).build();
    expect(trashOptions(game)).toContain("corpse");
    expect(trashOptions(game)).not.toContain("victim");
    expect((await game.p1.try((p) => p.cast("heedless", { sacrifice: "victim", targets: "victim" }))).ok).toBe(false);
  });

  test("playing it properly: the Victim is killed as the cost and the CORPSE (already in the trash) is what comes back — the Victim stays dead", async () => {
    const game = await board([{ alias: "corpse", def: CORPSE }]).build();
    await game.p1.cast("heedless", { sacrifice: "victim", targets: "corpse" });
    expect(game.zoneOf("victim")).toBe("trash"); // the additional cost, paid on the play
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("corpse")).toBe("base");
    expect(game.zoneOf("victim")).toBe("trash"); // still dead — it was never a legal target
    expect(game.p1.trash()).toContain("victim");
    expect(game.violations()).toEqual([]);
  });
});
