/**
 * rule 144.3 — MULTI-UNIT Standard Move in the UI (public/js/gameplay/group-move.js).
 *
 * The engine enumerates `standardMove` with a `unitIds` group for every legal bundle
 * (144.3.a one shared destination, 144.3.b origins may differ, 144.3.c costs paid
 * together). The UI must offer ONLY those bundles, so an illegal one — a non-[Ganking]
 * unit at a battlefield heading to another battlefield (legal routes: base->bf 144.4.a,
 * bf->base 144.4.b, bf->bf only with [Ganking] 144.4.c.1 / 810) — is never selectable.
 *
 * These are the pure helpers; the DOM handlers on top of them are wired in
 * interactions.js (onCardClick / showActionBar) and drag-drop.js (onZoneClick),
 * asserted at the bottom of this file.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "bun:test";

type Move = { moveId: string; playerId?: string; params?: Record<string, unknown> };
type GM = {
  groupMoves: (m: Move[]) => Move[];
  canGroup: (m: Move[], unitId: string) => boolean;
  companions: (m: Move[], selected: string[]) => string[];
  destinations: (m: Move[], selected: string[]) => string[];
  exactMove: (m: Move[], selected: string[], destination: string) => Move | null;
  joinBlockReason: (m: Move[], selected: string[], unitId: string) => string | null;
  zoneIdFor: (d: string) => string;
};
let GroupMove: GM;

beforeAll(async () => {
  await import("../../public/js/gameplay/group-move.js");
  GroupMove = (globalThis as unknown as { GroupMove: GM }).GroupMove;
});

/**
 * Board: "a" and "b" are in base; "g" has [Ganking] at bf1; "x" is at bf1 without it.
 * The engine therefore enumerates bf2 groups over {a,b,g} in every subset, and for "x"
 * only the bf->base route (144.4.b).
 */
const sm = (unitIds: string[], destination: string): Move => ({
  moveId: "standardMove",
  playerId: "player-1",
  params: { unitIds, destination },
});
const MOVES: Move[] = [
  sm(["a"], "bf2"), sm(["b"], "bf2"), sm(["g"], "bf2"),
  sm(["a", "b"], "bf2"), sm(["a", "g"], "bf2"), sm(["b", "g"], "bf2"),
  sm(["a", "b", "g"], "bf2"),
  sm(["a"], "bf1"), sm(["b"], "bf1"), sm(["a", "b"], "bf1"),
  sm(["x"], "base"),
  { moveId: "playUnit", playerId: "player-1", params: { cardId: "c" } },
];

describe("GroupMove — reads bundles back out of the engine's enumeration (144.3)", () => {
  test("only movement moves carrying a unit group are considered", () => {
    expect(GroupMove.groupMoves(MOVES).every(m => m.moveId === "standardMove")).toBe(true);
    expect(GroupMove.groupMoves(MOVES)).toHaveLength(MOVES.length - 1);
  });

  test("a unit with a multi-unit bundle on offer gets the group affordance; a solo-only one does not", () => {
    expect(GroupMove.canGroup(MOVES, "a")).toBe(true);
    expect(GroupMove.canGroup(MOVES, "g")).toBe(true);
    expect(GroupMove.canGroup(MOVES, "x")).toBe(false); // only its own bf->base move exists
  });

  test("companions are exactly the units some enumerated superset admits (144.3.b mixed origins)", () => {
    expect(GroupMove.companions(MOVES, ["a"])).toEqual(["b", "g"]);
    // Once the Ganking unit at bf1 has joined, "b" still can (a,b,g -> bf2 is enumerated).
    expect(GroupMove.companions(MOVES, ["a", "g"])).toEqual(["b"]);
    expect(GroupMove.companions(MOVES, ["a", "b", "g"])).toEqual([]);
    // "x" is never offered: no bundle contains it, so an illegal bf->bf bundle
    // (144.4.c.1 needs [Ganking]) cannot be assembled at all.
    expect(GroupMove.companions(MOVES, ["a"])).not.toContain("x");
  });

  test("destinations are only those the WHOLE group shares (144.3.a)", () => {
    expect(GroupMove.destinations(MOVES, ["a", "b"]).sort()).toEqual(["bf1", "bf2"]);
    // Adding the Ganking unit at bf1 drops bf1 — it cannot move to where it already is.
    expect(GroupMove.destinations(MOVES, ["a", "b", "g"])).toEqual(["bf2"]);
    expect(GroupMove.destinations(MOVES, ["a", "x"])).toEqual([]);
  });

  test("order of selection does not matter — the exact enumerated move is found either way", () => {
    const m1 = GroupMove.exactMove(MOVES, ["g", "a", "b"], "bf2");
    expect(m1?.params?.unitIds).toEqual(["a", "b", "g"]);
    // the base row's element id maps back to the "base" destination
    expect(GroupMove.exactMove(MOVES, ["x"], "player-base")?.params?.destination).toBe("base");
    expect(GroupMove.exactMove(MOVES, ["a", "b", "g"], "bf1")).toBeNull();
  });

  test("a unit that can't join says why, instead of the click being swallowed", () => {
    // no enumerated move at all for it (414.1.b exhausted / already moved)
    expect(GroupMove.joinBlockReason(MOVES, ["a"], "zzz")).toMatch(/no Standard Move available/);
    // moves on its own, but shares no legal route with this group
    expect(GroupMove.joinBlockReason(MOVES, ["a"], "x")).toMatch(/same route/);
    expect(GroupMove.joinBlockReason(MOVES, ["a"], "a")).toBeNull();
  });

  test("zoneIdFor maps the base destination onto the base row element", () => {
    expect(GroupMove.zoneIdFor("base")).toBe("player-base");
    expect(GroupMove.zoneIdFor("bf2")).toBe("bf2");
  });
});

describe("group-move is wired into the click paths", () => {
  const read = (p: string) => readFileSync(path.resolve(import.meta.dir, "../../public", p), "utf8");

  test("onCardClick routes clicks to the group picker while it is armed", () => {
    expect(read("js/gameplay/interactions.js")).toContain("handleGroupMoveCardClick(cardId)");
  });
  test("onZoneClick picks the shared destination for the group", () => {
    expect(read("js/gameplay/drag-drop.js")).toContain("onGroupMoveZoneClick(targetId)");
  });
  test("the action bar offers the group entry point without displacing the solo move", () => {
    const src = read("js/gameplay/interactions.js");
    expect(src).toContain("data-group-move-start");
    expect(src).toContain(`onZoneClick("${"${esc(bfId)}"}")`); // solo one-click path still there
  });
  test("the module is loaded by the gameplay page", () => {
    expect(read("gameplay.html")).toContain("/js/gameplay/group-move.js");
  });
});
