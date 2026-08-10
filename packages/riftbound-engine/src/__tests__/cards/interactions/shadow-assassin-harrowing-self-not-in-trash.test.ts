/**
 * Interaction: Shadow Assassin (ven-013-166) · Unit · Fury · 5 · 5 Might
 *     "I enter ready if you have a card with my name in your trash."
 *   × The Harrowing (ogn-198-298) · Spell · Chaos · 6 + [chaos][chaos] · Action
 *     "Play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)"
 *
 * Rules: 354 / 419.1 (playing a card — from ANY zone — first moves it to the Chain, a non-board zone),
 * 366.1 (a self-describing "I enter ready if …" modifier works from whatever zone the card is played from
 * and is checked AS the unit enters), 143.4 (a played unit enters exhausted by default), 355.10.a /
 * 355.10.a.1 (the trash is Public — The Harrowing targets the trash card on cast), 124 / 124.1 (a card that
 * changes zones trash → chain → board is a NEW object: damage, buffs and temporary modifications are gone).
 * RiftJudge ruling: "It enters ready only if a DIFFERENT copy of it is still there."
 *
 * Question / expected:
 *  (a) P1's trash holds exactly ONE Shadow Assassin; Harrowing plays it → it has left the trash before the
 *      passive is checked, no other copy is there → enters EXHAUSTED. Trash count drops the moment it goes on
 *      the chain. Harrowing costs 6 + 2 chaos; the Assassin has no Power cost so nothing more is paid.
 *  (b) TWO copies in the trash, Harrowing plays one → the other is still there → READY.
 *  (c) Played normally from HAND with one copy in the trash → READY.
 *  (d) From hand while the only other copy is on the BOARD / in hand / in banishment → EXHAUSTED.
 *  (e) The copy in (a) died earlier this turn carrying a buff, +2 this turn and 3 damage → back on the board
 *      it is a fresh 5-Might, undamaged, unbuffed, exhausted unit.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHADOW_ASSASSIN = "ven-013-166";
const HARROWING = "ogn-198-298";

/** P1's turn, exactly 6 energy + 2 chaos (Harrowing), Harrowing in hand, `inTrash` Shadow Assassins in P1's trash. */
function board(inTrash: 0 | 1 | 2 = 1) {
  const s = scenario().resources(P1, { energy: 6, power: { chaos: 2 } }).hand(P1, HARROWING, "har");
  if (inTrash >= 1) {
    s.trash(P1, SHADOW_ASSASSIN, "sa1");
  }
  if (inTrash >= 2) {
    s.trash(P1, SHADOW_ASSASSIN, "sa2");
  }
  return s;
}

/** Cast Harrowing on `target`, let it resolve, answer the destination prompt (base) if one is asked. */
async function harrow(game: Game, target: string): Promise<void> {
  await game.p1.cast("har", { targets: target });
  await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
    await game.p1.pick("base");
    await game.settle();
  }
}

describe("(a) ONE Shadow Assassin in the trash, The Harrowing plays it → it does not see itself", () => {
  test("Harrowing offers exactly the trash Assassin as its target (355.10.a) and costs 6 + [chaos][chaos]", async () => {
    const game = await board(1).build();
    const field = game.p1.option("cast", "har")?.fields.find((f) => f.arg === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toEqual(["sa1"]);
    await game.p1.cast("har", { targets: "sa1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "har", controller: P1, targets: ["sa1"], triggered: false })]);
    expect(game.zoneOf("sa1")).toBe("trash"); // targeted, not yet played
  });

  test("it lands in P1's base EXHAUSTED (354/419.1: trash → chain first, so 'a card with my name in your trash' is false; 143.4 default)", async () => {
    const game = await board(1).build();
    await harrow(game, "sa1");
    expect(game.zoneOf("sa1")).toBe("base");
    expect(game.state("sa1")).toMatchObject({ controller: P1, isExhausted: true, isReady: false, might: 5 });
    expect(game.p1.trash()).toEqual(["har"]); // only the spent Harrowing — no Shadow Assassin left there
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // no Power cost on the Assassin → nothing more paid
    expect(game.violations()).toEqual([]);
  });

  test("the trash count drops the moment the Assassin is put on the chain (Pending), not when it reaches the board", async () => {
    const game = await board(1).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 1, name: "Holder" }, "holder").build();
    await game.p1.cast("har", { targets: "sa1" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Harrowing resolves → the Assassin's play begins; two legal locations → P1 is asked
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "sa1" } });
    expect(game.zoneOf("sa1")).toBe("chain");
    expect(game.p1.trash()).not.toContain("sa1");
    await game.p1.pick("bf1");
    await game.settle();
    expect(game.state("sa1")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
  });
});

describe("(b) TWO Shadow Assassins in the trash, Harrowing plays one → the other is still there → READY", () => {
  test("sa1 played, sa2 remains in the trash when sa1 enters → sa1 enters READY", async () => {
    const game = await board(2).build();
    await harrow(game, "sa1");
    expect(game.zoneOf("sa1")).toBe("base");
    expect(game.zoneOf("sa2")).toBe("trash");
    expect(game.state("sa1")).toMatchObject({ isExhausted: false, isReady: true, might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("symmetry: playing sa2 instead leaves sa1 behind → sa2 READY", async () => {
    const game = await board(2).build();
    await harrow(game, "sa2");
    expect(game.state("sa2")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.zoneOf("sa1")).toBe("trash");
  });
});

describe("(c) played from HAND while one copy is in the trash → READY (366.1: the modifier works from any origin zone and reads the Public trash)", () => {
  test("hand copy enters ready; the trash copy is only looked at", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).trash(P1, SHADOW_ASSASSIN, "dead").hand(P1, SHADOW_ASSASSIN, "sa").build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.state("sa")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.zoneOf("dead")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });
});

describe("(d) played from hand while the only other copy is NOT in the trash → EXHAUSTED", () => {
  test("other copy on the BOARD → exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).unit(P1, "base", SHADOW_ASSASSIN, "onboard").hand(P1, SHADOW_ASSASSIN, "sa").build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.state("sa").isExhausted).toBe(true);
  });

  test("other copy in HAND → exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, SHADOW_ASSASSIN, "spare").hand(P1, SHADOW_ASSASSIN, "sa").build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.state("sa").isExhausted).toBe(true);
    expect(game.zoneOf("spare")).toBe("hand");
  });

  test("other copy in BANISHMENT → exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).banishment(P1, SHADOW_ASSASSIN, "banished").hand(P1, SHADOW_ASSASSIN, "sa").build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.state("sa").isExhausted).toBe(true);
  });

  test("a copy in the OPPONENT's trash is not 'your trash' → exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).trash(P2, SHADOW_ASSASSIN, "theirs").hand(P1, SHADOW_ASSASSIN, "sa").build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.state("sa").isExhausted).toBe(true);
  });
});

describe("(e) the copy Harrowing returns died earlier this turn buffed, +2 this turn, 3 damage → nothing carries over (124 / 124.1)", () => {
  /** Buffed (+1) Assassin with +2 this turn and 3 damage attacks an unbeatable 9-Might defender, dies, then is Harrowed back. */
  async function dieThenHarrow(): Promise<Game> {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", SHADOW_ASSASSIN, "sa1", { buffed: true, damage: 3, mightModifier: 2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .hand(P1, HARROWING, "har")
      .build();
    expect(game.state("sa1")).toMatchObject({ damage: 3, isBuffed: true, might: 5 + 1 + 2, mightModifier: 2 });
    await game.p1.move("sa1", "bf1");
    await game.settle(); // showdown passes out, combat: 8 into the 9-Might Wall (survives), 9 into the Assassin (dies)
    expect(game.zoneOf("sa1")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    await harrow(game, "sa1");
    return game;
  }

  test("back on the board it is a fresh object: 5 Might, 0 damage, not buffed, no +2 modifier — and EXHAUSTED (it was the only copy in the trash)", async () => {
    const game = await dieThenHarrow();
    expect(game.zoneOf("sa1")).toBe("base");
    expect(game.state("sa1")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 5, mightModifier: 0 });
    expect(game.p1.trash()).toEqual(["har"]);
    expect(game.violations()).toEqual([]);
  });

  test("nothing resurfaces at end of turn either: after the turn passes it is still a plain 5-Might unit", async () => {
    const game = await dieThenHarrow();
    await game.advanceTurn();
    expect(game.state("sa1")).toMatchObject({ damage: 0, isBuffed: false, might: 5, zone: "base" });
  });
});
