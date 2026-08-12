/**
 * Ruling fab2613f6ffd71ae — Piercing Light (SFD-023 → sfd-023-221) · Fury · [2][fury] · [Repeat] [2][fury]
 *     "Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit."
 *   × Flash (OGS-011 → ogs-011-024) · [Reaction] · Chaos · [2][chaos] "Move up to 2 friendly units to base."
 *
 * Q: If the FIRST target of Piercing Light leaves the battlefield, does the second target still take damage?
 * A: Yes. "then" only sequences the two instructions, it does not make the second depend on the first. (A
 *    templating with "to" — "deal 2 to a unit TO deal 2 to another" — would make the first a cost and create
 *    that dependency; Piercing Light is not templated that way.)
 * Rules: 359.3.e.5 / 355.15 (an object that no longer matches its descriptor is skipped at resolution),
 *        359.3.e.14 ("if you do" / "to" is what links instructions), 426.2 (the rest of the spell still happens).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";
const FLASH = "ogs-011-024";

/** P1's turn with [2][fury]. P2 holds bf1 with Front (5 Might); a second unit Home (5) sits in P2's base. P2 has Flash. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Front" }, "front")
    .unit(P2, "base", { might: 5, name: "Home" }, "home")
    .hand(P1, PIERCING_LIGHT, "pl")
    .hand(P2, FLASH, "flash");
}

/** P2 Flashes the FIRST target (Front) back to base while Piercing Light waits on the chain. */
async function flashFrontHome(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.cast("flash", { targets: ["front"] });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.locationOf("front")).toBe("base");
  expect(game.chain().map((c) => c.cardId)).toEqual(["pl"]);
}

describe("Ruling fab2613f6ffd71ae — Piercing Light's second target is hit even when the first has left the battlefield", () => {
  test("control: unopposed, both named units take 2", async () => {
    const game = await board().build();
    await game.p1.cast("pl", { targets: ["front", "home"] });
    await game.settle();
    expect(game.state("front").damage).toBe(2);
    expect(game.state("home").damage).toBe(2);
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: with Front Flashed to base it is no longer 'a unit at a battlefield' — it takes nothing, and Home still takes its 2", async () => {
    const game = await board().build();
    await game.p1.cast("pl", { targets: ["front", "home"] });
    await flashFrontHome(game);
    await game.settle();
    expect(game.state("front").damage).toBe(0); // first instruction is skipped …
    expect(game.state("home").damage).toBe(2); // … "then" still runs the second
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the caster is not asked to re-aim either half when the first target leaves", async () => {
    const game = await board().build();
    let reAimed = false;
    game.script(P1, [
      (d) => {
        if (d.kind === "pick") {
          reAimed = true;
        }
        return undefined;
      },
    ]);
    await game.p1.cast("pl", { targets: ["front", "home"] });
    await flashFrontHome(game);
    await game.settle();
    expect(reAimed).toBe(false);
    expect(game.state("home").damage).toBe(2);
  });

  test("the second target is optional ('up to one other unit'): naming only Front is legal, and Flashing it away leaves the spell doing nothing at all", async () => {
    const game = await board().build();
    await game.p1.cast("pl", { targets: "front" });
    await flashFrontHome(game);
    await game.settle();
    expect(game.state("front").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
