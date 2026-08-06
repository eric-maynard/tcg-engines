/**
 * Interaction: Kennen, Storm of Shuriken (ven-113-166) "When I conquer, give a spell in your trash
 *                [Flow] equal to its cost this turn. (You may play it from your trash for its Flow
 *                cost. Then banish it.)"
 *   × Drag Under (sfd-164-221) Action, [5][order] "I cost [2] less to play from anywhere other than
 *                your hand. Kill a unit at a battlefield."
 *   × Stargazer (ven-098-166) "Spells with [Flow] you play from your trash cost [2] less, to a
 *                minimum of [1]."
 *
 * Question: Kennen conquers and grants Drag Under (in trash) Flow equal to its cost; Stargazer is
 * on board. What is the Flow cost, what is actually paid from trash, do both discounts stack, and
 * where does Drag Under go? Contrast: cast from hand the same turn; Stargazer without the grant.
 *
 * Rules: 206 (an effect reading "its cost" uses the printed cost → Flow [5][order]); 829.1.b /
 * 829.1.c.1 / 356.1.a (Flow cost is an alternate cost replacing the base cost); 829.1.b.2 (timing
 * unchanged); 356.4 (discounts apply after the base is set) → own -2 (not from hand) → [3][order],
 * Stargazer -2 min [1] (356.4.e) → [1][order]; 829.1.b.1 (banished when it leaves the chain);
 * 829.2 (Flow is a checkable characteristic). From hand: full [5][order], goes to trash. No grant:
 * no Flow → cannot be played from trash at all (Stargazer is a discount, not a permission).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KENNEN = "ven-113-166";
const DRAG_UNDER = "sfd-164-221";
const STARGAZER = "ven-098-166";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function board(opts: { stargazer?: boolean; energy?: number; order?: number } = {}) {
  const s = scenario()
    .resources(P1, { energy: opts.energy ?? 6, power: { order: opts.order ?? 1 } })
    .battlefield("bf1", { controller: null }) // open battlefield for Kennen to conquer
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", KENNEN, "kennen")
    .unit(P2, "bf2", { might: 2 }, "victim")
    .trash(P1, DRAG_UNDER, "duTrash")
    .hand(P1, DRAG_UNDER, "duHand");
  return opts.stargazer === false ? s : s.unit(P1, "base", STARGAZER, "stargazer");
}

/** Kennen walks into the open battlefield, conquers, and (once implemented) grants Drag Under Flow. */
async function conquerAndGrant(game: G): Promise<void> {
  await game.p1.move("kennen", "bf1");
  await game.settle();
  const d = game.decision();
  if (d && d.seat === P1 && d.kind === "pick") {
    await game.p1.pick("duTrash");
    await game.settle();
  } else if (d && d.seat === P1 && d.kind === "yes-no") {
    await game.p1.yes();
    await game.settle();
  }
}

describe("Kennen, Storm of Shuriken × Drag Under × Stargazer — granted Flow from trash", () => {
  test("control: Kennen moving alone into the open battlefield conquers it (the trigger condition)", async () => {
    const game = await board().build();
    await conquerAndGrant(game);
    expect(game.zoneOf("kennen")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // Expected: the conquer trigger gives Drag Under (in trash) Flow [5][order] this turn, which is a
  // permission to play it from trash (829.1.b). Actual: Kennen's conquer ability is unimplemented
  // (raw text) — nothing is granted and the trash copy is never offered as a play.
  test("after Kennen conquers, Drag Under in the trash gains Flow and becomes castable from trash (829.1.b, 206)", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "duTrash")).toBe(false); // no Flow before the grant
    await conquerAndGrant(game);
    expect(game.zoneOf("duTrash")).toBe("trash");
    expect(game.p1.can("cast", "duTrash")).toBe(true);
  });

  // Expected: Flow base [5][order] → own "not from hand" -2 → [3] → Stargazer -2 (min 1) → [1][order].
  // Actual: not castable from trash at all.
  test("with Stargazer, playing Drag Under from trash via the granted Flow costs exactly [1] + one order power (356.4, 356.4.e)", async () => {
    const game = await board({ energy: 1, order: 1 }).build();
    await conquerAndGrant(game);
    expect(game.p1.can("cast", "duTrash")).toBe(true);
    await game.p1.cast("duTrash", { flow: true, targets: "victim" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("order")).toBe(0);

    const broke = await board({ energy: 0, order: 1 }).build();
    await conquerAndGrant(broke);
    expect(broke.p1.can("cast", "duTrash")).toBe(false); // Stargazer's minimum of [1] still applies
  });

  // Expected: without Stargazer only Drag Under's own -2 applies on top of the Flow cost → [3][order].
  // Actual: not castable from trash at all.
  test("without Stargazer the granted-Flow play from trash costs [3] + order (Flow [5] minus its own 'not from hand' [2])", async () => {
    const enough = await board({ energy: 3, order: 1, stargazer: false }).build();
    await conquerAndGrant(enough);
    expect(enough.p1.can("cast", "duTrash")).toBe(true);
    await enough.p1.cast("duTrash", { flow: true, targets: "victim" });
    expect(enough.p1.energy()).toBe(0);

    const short = await board({ energy: 2, order: 1, stargazer: false }).build();
    await conquerAndGrant(short);
    expect(short.p1.can("cast", "duTrash")).toBe(false);
  });

  // Expected: resolves normally (kill a unit at a battlefield), then is banished instead of going
  // back to the trash (829.1.b.1). Actual: cannot be played from trash.
  test("Drag Under played from trash via Flow kills its target and is then banished, not trashed (829.1.b.1)", async () => {
    const game = await board().build();
    await conquerAndGrant(game);
    await game.p1.cast("duTrash", { flow: true, targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("duTrash")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("duTrash");
  });

  // Expected: the grant lasts "this turn"; on P1's next turn the trash copy has no Flow again.
  // Actual: never castable (first assertion fails).
  test("the granted Flow expires at end of turn — castable from trash this turn, not on P1's next turn", async () => {
    const game = await board().build();
    await conquerAndGrant(game);
    expect(game.p1.can("cast", "duTrash")).toBe(true);
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.zoneOf("duTrash")).toBe("trash");
    expect(game.p1.can("cast", "duTrash")).toBe(false);
  });

  // ---- Contrast: from hand the same turn -------------------------------------------------------

  test("from hand the same turn: full [5][order] — neither its own 'not from hand' discount nor Stargazer applies", async () => {
    const game = await board({ energy: 5, order: 1 }).build();
    await conquerAndGrant(game);
    expect(game.p1.can("cast", "duHand")).toBe(true);
    await game.p1.cast("duHand", { targets: "victim" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("order")).toBe(0);

    const four = await board({ energy: 4, order: 1 }).build();
    await conquerAndGrant(four);
    expect(four.p1.can("cast", "duHand")).toBe(false); // 4 < 5: no discount from hand

    const noOrder = await board({ energy: 5, order: 0 }).build();
    await conquerAndGrant(noOrder);
    expect(noOrder.p1.can("cast", "duHand")).toBe(false); // still needs the order power
  });

  test("from hand: kills the unit at a battlefield and goes to the trash normally (no banish)", async () => {
    const game = await board({ energy: 5, order: 1 }).build();
    await conquerAndGrant(game);
    await game.p1.cast("duHand", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("duHand")).toBe("trash");
    expect(game.p1.banishment()).not.toContain("duHand");
  });

  test("from hand: only units at a battlefield are offered — Kennen (now at bf1) and the enemy at bf2, not Stargazer in base", async () => {
    const game = await board({ energy: 5, order: 1 }).build();
    await conquerAndGrant(game);
    const field = game.p1.option("cast", "duHand")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered.sort()).toEqual(["kennen", "victim"]);
    await expect(game.p1.cast("duHand", { targets: "stargazer" })).rejects.toThrow();
  });

  // ---- Contrast: Stargazer without the Kennen grant --------------------------------------------

  test("Stargazer on board but no Kennen grant: Drag Under has no Flow, so it cannot be played from trash at all — Stargazer is a discount, not a permission", async () => {
    const game = await board({ energy: 10, order: 2 }).build(); // plenty of resources, no conquer
    expect(game.zoneOf("duTrash")).toBe("trash");
    expect(game.p1.can("cast", "duTrash")).toBe(false);
    expect(game.p1.option("cast", "duTrash")).toBeUndefined();
    await expect(game.p1.cast("duTrash", { flow: true, targets: "victim" })).rejects.toThrow();
    expect(game.zoneOf("duTrash")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("battlefield-bf2");
  });
});
