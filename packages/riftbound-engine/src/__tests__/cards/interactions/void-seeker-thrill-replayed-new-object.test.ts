/**
 * Interaction: Void Seeker (ogn-024-298) — Fury Action spell, 3 + [fury]
 *     "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Thrill of the Hunt (unl-184-219) — Fury/Body Reaction spell, 2 + 1 power
 *     "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *
 * Question: P1 plays Void Seeker on P2's 3-Might unit at bf1. P2 responds with Thrill of the Hunt on
 * that unit, banishing it and replaying it to the SAME battlefield. When Void Seeker resolves the
 * unit is again "a unit at a battlefield" at the very spot it was chosen — does it take 4? Does P1
 * still draw 1? Contrast (b) no response, (c) replayed to a different battlefield.
 *
 * Rules: 359.3.e.1 (the spell resolves even with illegal targets), 359.3.e.2 / 359.3.e.4 (a target
 * that went to a non-board zone and came back is a NEW object → illegal, unlike a mere on-board
 * move-and-return, 359.3.e.3), 359.3.e.5 (Void Seeker is the printed example: no damage, but the
 * unlinked "Draw 1" still happens), 354.2 / 354.3 (the replay is a pending item finalized inside
 * Thrill's resolution, before Void Seeker continues).
 *
 * Expected: (a) Thrill resolves first (LIFO); the unit is banished and replayed to bf1 as a fresh
 * object; Void Seeker then resolves: NO damage to it, P1 draws 1, Void Seeker → trash. (b) No
 * response: 4 damage kills the 3-Might unit, P1 draws 1. (c) Replayed to bf2: same as (a).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const THRILL_OF_THE_HUNT = "unl-184-219";
const FILLER = "ogn-175-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Prey" }, "prey", { damage: 1 }) // pre-scuffed: a fresh object forgets this
    .unit(P2, "bf1", { might: 5, name: "Packmate" }, "packmate")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"])
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P2, THRILL_OF_THE_HUNT, "thrill");
}

/** P1 casts Void Seeker on prey and passes; P2 answers with Thrill of the Hunt and replays prey to `dest`. */
async function seekerThenThrill(dest: "bf1" | "bf2"): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("vs", { targets: "prey" });
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  expect(game.p2.can("cast", "thrill")).toBe(true);
  await game.p2.cast("thrill", { targets: "prey" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "thrill"]);
  const r = await game.settle(); // both pass → Thrill (top of chain) resolves and asks the owner where to replay
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  await game.p2.pick(`battlefield-${dest}`);
  return game;
}

describe("Void Seeker × Thrill of the Hunt — target banished and replayed before resolution", () => {
  // ---- (b) baseline ---------------------------------------------------------------------------------

  test("(b) no response: Void Seeker deals 4 to the 3-Might unit — it dies — and P1 draws 1; spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "prey" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("prey")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("packmate").damage).toBe(0);
  });

  // ---- (a) replayed to the SAME battlefield ----------------------------------------------------------

  test("(a) Thrill of the Hunt resolves first (LIFO): prey is banished and its owner replays it to bf1 — back on the board as a fresh, undamaged object while Void Seeker still waits on the chain (354.2/354.3)", async () => {
    const game = await seekerThenThrill("bf1");
    expect(game.zoneOf("prey")).toBe("battlefield-bf1");
    expect(game.state("prey").damage).toBe(0); // the pre-existing 1 damage is gone: new object
    expect(game.state("prey").controller).toBe(P2);
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // 2 + [fury] paid; the replay itself was free
  });

  // Expected: the replayed unit left the board (banishment) and returned → it is a NEW object and no
  // longer Void Seeker's target even though it is "a unit at a battlefield" at bf1 again (359.3.e.2,
  // 359.3.e.4). The "Deal 4" instruction is ignored: prey survives at bf1 with 0 damage.
  // Actual: the engine still deals 4 to the replayed unit and it dies.
  test("(a) when Void Seeker resolves the replayed unit is a new object — it takes NO damage and stays at bf1 (359.3.e.2, 359.3.e.4)", async () => {
    const game = await seekerThenThrill("bf1");
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("prey")).toBe("battlefield-bf1");
    expect(game.state("prey").damage).toBe(0);
    expect(game.p2.trash()).not.toContain("prey");
  });

  test("(a) 'Draw 1' is not linked to the damage: P1 still draws exactly 1 and Void Seeker goes to P1's trash as a played spell (359.3.e.1, 359.3.e.5)", async () => {
    const game = await seekerThenThrill("bf1");
    const deck = game.p1.deck().length;
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.p1.trash()).toContain("vs");
    expect(game.chain()).toEqual([]);
    expect(game.state("packmate").damage).toBe(0); // no retarget onto the other unit there
  });

  // ---- (c) replayed to a DIFFERENT battlefield --------------------------------------------------------

  test("(c) the owner may replay it to ANY battlefield — bf2 (uncontrolled) is offered and taken; prey sits at bf2 undamaged", async () => {
    const game = await seekerThenThrill("bf2");
    expect(game.zoneOf("prey")).toBe("battlefield-bf2");
    expect(game.state("prey").damage).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]);
  });

  // Expected: illegal twice over (new object AND no longer where it was chosen — though "at a
  // battlefield" is still literally true at bf2, 359.3.e.4 alone suffices) → no damage.
  // Actual: the engine deals 4 and prey dies.
  test("(c) replayed to bf2 the unit is likewise a new object — Void Seeker deals it no damage (359.3.e.4)", async () => {
    const game = await seekerThenThrill("bf2");
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("prey")).toBe("battlefield-bf2");
    expect(game.state("prey").damage).toBe(0);
  });

  test("(c) P1 still draws 1 off Void Seeker when the target was replayed elsewhere (359.3.e.5)", async () => {
    const game = await seekerThenThrill("bf2");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("vs")).toBe("trash");
  });

  // ---- scope of the dodge: Thrill of the Hunt is "a friendly unit" ---------------------------------

  test("Thrill of the Hunt only offers P2's own (friendly) units — it cannot be used on an enemy unit to dodge on their behalf", async () => {
    const game = await board().unit(P1, "bf1", { might: 2, name: "Intruder" }, "intruder").build();
    await game.p1.cast("vs", { targets: "prey" });
    await game.p1.passPriority();
    const offeredTargets = (game.p2.option("cast", "thrill")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offeredTargets).toEqual(expect.arrayContaining(["prey", "packmate"]));
    expect(offeredTargets).not.toContain("intruder");
    await expect(game.p2.cast("thrill", { targets: "intruder" })).rejects.toThrow();
  });
});
