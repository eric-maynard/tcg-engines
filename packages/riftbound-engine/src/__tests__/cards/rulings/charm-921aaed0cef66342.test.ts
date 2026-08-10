/**
 * Ruling 921aaed0cef66342 — Charm (OGN-043 → ogn-043-298) · 1 + [calm] · "Move an enemy unit." (no timing keyword)
 *   × Fight or Flight (OGN-168 → ogn-168-298) [Action] "Move a unit from a battlefield to its base."
 *   × Gust (OGN-169 → ogn-169-298) [Reaction] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: I move a unit onto an empty battlefield; can my opponent Charm it back to base to stop the conquer?
 * A: No — Charm has neither [Action] nor [Reaction], so it is only playable on its controller's own turn outside
 *    showdowns. The conquer only happens after the showdown; Action/Reaction spells (Fight or Flight, Gust) played
 *    there DO stop it. The opponent can't respond to the move itself — they wait for Focus in the showdown.
 * Rules: 330–333 (speed/timing classes), 341/345 (showdown after moving to an empty bf), 441–444 (conquer at its end).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const GUST = "ogn-169-298";

/** P1's turn. bf1 uncontrolled & empty. P1's Scout (3) in base. P2 holds Charm, Fight or Flight and Gust, amply funded. */
function board() {
  return scenario()
    .resources(P2, { energy: 4, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P2, CHARM, "charm")
    .hand(P2, FIGHT_OR_FLIGHT, "fof")
    .hand(P2, GUST, "gust");
}

/** P1's Scout walks onto bf1; P1 passes Focus so P2 holds it. */
async function p2HasFocus(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 921aaed0cef66342 — Charm can't answer a move onto an empty battlefield; showdown-speed spells can", () => {
  test("the move itself can't be responded to: it opens a showdown with P1 (the mover) holding Focus — P2 is not acting and nothing is on the chain; no conquer yet", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.legal().filter((o) => o.verb === "cast")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
  });

  test("ruling 921aaed0cef66342 — with Focus in the showdown (P1's turn) P2 CANNOT cast Charm (base speed): not on the menu, forced attempt rejected, nothing spent", async () => {
    const game = await p2HasFocus();
    expect(game.p2.can("cast", "charm")).toBe(false);
    const r = await game.p2.try((p) => p.cast("charm", { targets: "scout" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("charm")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 4, power: { calm: 1 } });
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
  });

  test("…whereas the [Action] Fight or Flight and the [Reaction] Gust ARE playable there", async () => {
    const game = await p2HasFocus();
    expect(game.p2.can("cast", "fof")).toBe(true);
    expect(game.p2.can("cast", "gust")).toBe(true);
  });

  test("if both simply pass, the showdown completes and only THEN does P1 conquer bf1 (+1)", async () => {
    const game = await p2HasFocus();
    expect(game.p1.points()).toBe(0);
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.hand().sort()).toEqual(["charm", "fof", "gust"]);
  });

  test("P2 Gusts the 3-Might Scout during the showdown → it returns to P1's hand; bf1 stays uncontrolled and P1 scores nothing", async () => {
    const game = await p2HasFocus();
    await game.p2.cast("gust", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.hand()).toContain("scout");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("P2 plays Fight or Flight instead → Scout is moved back to P1's base; again no conquer", async () => {
    const game = await p2HasFocus();
    await game.p2.cast("fof", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
  });

  test("contrast: on P2's OWN turn, outside any showdown, Charm is playable on the Scout", async () => {
    const game = await board().active(P2).unit(P1, "bf1", { might: 1, name: "Placeholder" }, "ph").build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.can("cast", "charm")).toBe(true);
  });
});
