/**
 * Miss Fortune, Buccaneer — ogn-193-298 · Champion Unit (Miss Fortune) · Chaos · 4 energy + [chaos] · 4 Might
 *
 *   You may play me to an open battlefield.
 *   Friendly units may be played to open battlefields.
 *
 * Rules: units may normally be played only to their controller's base or a battlefield they
 * control (806.3 / 813.3.a); 170.11.c — a battlefield is "open" when it is unoccupied and uncontrolled;
 * 190.3.a.1 — a unit PLAYED to a battlefield its controller doesn't control applies Contested,
 * 344.2 / 190.4 — a non-combat showdown follows and control is established.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-193-298";
const SKULKER = "ogn-175-298";

function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { chaos: 1 } })
    .battlefield("open", { controller: null })
    .battlefield("mine", { controller: P1 })
    .battlefield("theirs", { controller: P2 })
    .unit(P1, "mine", { might: 1 }, "holder")
    .unit(P2, "theirs", { might: 1 }, "foeHolder")
    .hand(P1, CARD, "mf")
    .hand(P1, SKULKER, "sk");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;
const destinations = (game: Built, seat: "p1" | "p2", card: string) =>
  [...((game[seat].option("play", card)?.fields.find((f) => f.arg === "to")?.options as string[]) ?? [])].sort();

describe("Miss Fortune, Buccaneer (ogn-193-298)", () => {
  test("cost: 4 energy + 1 chaos for a 4-Might unit; unaffordable short of either", async () => {
    const game = await board().build();
    await game.p1.play("mf", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("mf")).toBe("base");
    expect(game.state("mf").might).toBe(4);
    const noPower = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "mf").build();
    expect(noPower.p1.can("play", "mf")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "mf").build();
    expect(noEnergy.p1.can("play", "mf")).toBe(false);
  });

  test("'You may play me to an open battlefield': the open battlefield is offered (besides base / your battlefield), the enemy one is not", async () => {
    const game = await board().build();
    expect(destinations(game, "p1", "mf")).toEqual(["base", "battlefield-mine", "battlefield-open"]);
    await game.p1.play("mf", { to: "open" });
    await game.settle();
    expect(game.locationOf("mf")).toBe("open");
    const r = await (await board().build()).p1.try((p) => p.play("mf", { to: "theirs" }));
    expect(r.ok).toBe(false);
  });

  test.failing("BUG: 'open' means uncontrolled AND unoccupied (170.11.c) — an uncontrolled battlefield with an enemy unit on it is not offered", async () => {
    // Expected: "occupied" (no controller, but an enemy unit sits there) is not an open battlefield,
    // so it is not a legal destination. Actual: the engine treats any uncontrolled battlefield as open.
    const game = await board().battlefield("occupied", { controller: null }).unit(P2, "occupied", { might: 1 }, "squatter").build();
    expect(destinations(game, "p1", "mf")).not.toContain("battlefield-occupied");
    expect(destinations(game, "p1", "mf")).toContain("battlefield-open");
  });

  test.failing("BUG: playing her to an open battlefield contests it and, after the showdown, you control it and score (190.3.a.1, 344.2, 190.4)", async () => {
    // Expected: MF applies Contested to "open"; the next cleanup opens a non-combat showdown; when it
    // closes P1 controls "open" and scores 1 for conquering. Actual: the battlefield stays
    // uncontrolled/uncontested and no point is scored.
    const game = await board().build();
    await game.p1.play("mf", { to: "open" });
    await game.settle();
    expect(game.locationOf("mf")).toBe("open");
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("'Friendly units may be played to open battlefields': with her on the board a vanilla unit gains the open destination; without her it does not", async () => {
    const game = await board().build();
    expect(destinations(game, "p1", "sk")).toEqual(["base", "battlefield-mine"]);
    await game.p1.play("mf", { to: "base" });
    await game.settle();
    expect(destinations(game, "p1", "sk")).toEqual(["base", "battlefield-mine", "battlefield-open"]);
    await game.p1.play("sk", { to: "open" });
    await game.settle();
    expect(game.locationOf("sk")).toBe("open");
  });

  test("only FRIENDLY units: the opponent's units get no such permission from my Miss Fortune", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3 })
      .battlefield("open", { controller: null })
      .battlefield("theirs", { controller: P2 })
      .unit(P2, "theirs", { might: 1 }, "foeHolder")
      .unit(P1, "base", CARD, "mf")
      .hand(P2, SKULKER, "foe")
      .build();
    expect(destinations(game, "p2", "foe")).toEqual(["base", "battlefield-theirs"]);
  });
});
