/**
 * Ruling 824d7d52bd87ad37 — Drag Under (SFD-164 → sfd-164-221) · Action · [5]+[order] · "Kill a unit at a battlefield."
 *   × Tideturner (OGN-199 → ogn-199-298) · Hidden · 2 Might · "When you play me, you may choose a unit you control at
 *     another location. Move me to its location and it to my original location."
 *
 * Q: Drag Under targets my unit at battlefield 1; I react with Tideturner (from hidden at battlefield 2) and swap my
 *    unit over to battlefield 2. Does the unit still die?
 * A: Yes. Drag Under only requires "a unit at a battlefield"; the unit is still at A battlefield (bf2) when Drag
 *    Under resolves, so it remains a legal target and is killed.
 * Rules: 359.3.e (target legality re-checked on resolution against the requirement as written), 811 (Hidden →
 *        play as a Reaction for [0]), 446 (move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAG_UNDER = "sfd-164-221";
const TIDETURNER = "ogn-199-298";

/**
 * P2's turn (turn 3). P1 controls bf1 (Victim, 3) and bf2 (Holder, 2 + Tideturner face down since an earlier turn).
 * P2 holds Drag Under with exactly [5]+[order].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 5, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .facedown(P1, "bf2", TIDETURNER, "tide")
    .hand(P2, DRAG_UNDER, "drag");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** P2 casts Drag Under at the Victim (bf1) and passes; P1 reveals Tideturner at bf2 and swaps it with the Victim. */
async function dragThenTideturnerSwap(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("drag", { targets: "victim" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } }); // full [5] from hand
  expect(chainIds(game)).toEqual(["drag"]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "tide")).toBe(true);
  await game.p1.reveal("tide");
  // "you may choose a unit you control at another location" — P1 opts in; the Victim at bf1 is the only unit P1
  // controls at another location, so it is either offered as a pick or locked in as the sole legal choice.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tide" } });
  await game.p1.yes();
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("victim");
      await game.p1.pick("victim");
    } else {
      break;
    }
  }
  expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "tide", targets: ["victim"], triggered: true }));
  expect(chainIds(game)[0]).toBe("drag"); // Drag Under still waiting underneath
  // Resolve Tideturner's swap, leaving Drag Under as the last item.
  for (let i = 0; i < 10 && game.chain().length > 1; i++) {
    const d = game.decision();
    if (d?.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(chainIds(game)).toEqual(["drag"]);
  return game;
}

describe("Ruling 824d7d52bd87ad37 — swapping the target to another battlefield with Tideturner does not save it from Drag Under", () => {
  test("the swap happens first: Tideturner is now at bf1 and the Victim at bf2 (still a battlefield), with Drag Under still on the chain aimed at the Victim", async () => {
    const game = await dragThenTideturnerSwap();
    expect(game.state("tide")).toMatchObject({ isHidden: false, zone: "battlefield-bf1" });
    expect(game.locationOf("victim")).toBe("bf2");
    expect(game.locationOf("holder")).toBe("bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drag", controller: P2, targets: ["victim"] })]);
  });

  test("Drag Under then resolves and STILL kills the Victim at bf2 — 'a unit at a battlefield' is re-checked as written, not 'at bf1'", async () => {
    const game = await dragThenTideturnerSwap();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("drag")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.locationOf("tide")).toBe("bf1");
    expect(game.locationOf("holder")).toBe("bf2");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Tideturner holds it now
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: with no response Drag Under kills the Victim at bf1 and P1, left with nothing there, loses bf1", async () => {
    const game = await board().build();
    await game.p2.cast("drag", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("tide")).toBe("facedown-bf2");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });
});
