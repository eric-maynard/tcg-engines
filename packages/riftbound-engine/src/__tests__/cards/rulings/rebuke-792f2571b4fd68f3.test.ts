/**
 * Ruling 792f2571b4fd68f3 — Rebuke (OGN-172 → ogn-172-298) · Action · 2 + [chaos][chaos] · "Return a unit at a battlefield to its
 *   owner's hand."   × Ride the Wind (OGN-173 → ogn-173-298) · Action · 2 + [chaos] · "Move a friendly unit and ready it."
 *
 * Q: The opponent contests my battlefield (held by one unit) and Rebukes my lone defender back to hand. Does the combat
 *    showdown just end with them conquering, or does it continue?
 * A (riftjudge): It continues to its conclusion; "I lose control of the battlefield" but remain the defender; Riding the Wind
 *    another unit in and winning would CONQUER for a point. RULING-CONFLICT on the control half: CR 190.4.b/.c (control cannot
 *    change while a Combat is ongoing there) and riftjudge cd9356416a0b87e4 on the same card — the showdown continues, but P1
 *    never loses control, so the win is a defence with no point. Facets below follow the CR.
 * Rules: 340–345 (showdown runs until all Relevant Players pass in sequence), 465–467 (combat resolution; winner takes
 *        control = conquer), 444 (conquer scoring), 187.4 (control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUKE = "ogn-172-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P2's turn 3. P1 controls bf1 with a lone 2-Might Defender; a 4-Might Helper waits in P1's base with Ride the Wind
 * (2 + [chaos]) in hand. P2: a 3-Might Raider in base and Rebuke with 2 + [chaos][chaos]. Nobody has points.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .points(P1, 0)
    .points(P2, 0)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Defender" }, "defender")
    .unit(P1, "base", { might: 4, name: "Helper" }, "helper")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, REBUKE, "rebuke");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Raider attacks bf1; P2 (Focus) Rebukes the Defender; it resolves → Defender back in P1's hand. */
async function defenderRebuked(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("rebuke", { targets: "defender" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("rebuke")).toBe("trash");
  expect(game.zoneOf("defender")).toBe("hand");
  expect(game.p1.hand()).toContain("defender");
  expect(game.p1.units("bf1")).toEqual([]);
}

describe("Ruling 792f2571b4fd68f3 — Rebuking the lone defender does not end the combat showdown", () => {
  test("after Rebuke resolves the Defender is in P1's hand, yet the showdown at bf1 is STILL open (P2 has not conquered, no point scored) and P1 is still the defending player", async () => {
    const game = await board().build();
    await defenderRebuked(game);
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", defendingPlayer: P1 });
    expect(bf1(game)?.contested).toBe(true);
    expect(bf1(game)?.controller).not.toBe(P2);
    expect(game.p2.points()).toBe(0);
    // Focus keeps moving: somebody is being asked for a showdown action, not a main-phase one.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("players keep passing Focus and may still play Actions: P1 takes Focus and Rides the Wind the Helper (readied) into bf1", async () => {
    const game = await board().build();
    await defenderRebuked(game);
    for (let i = 0; i < 4 && game.actingSeat() !== P1; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { targets: "helper" });
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("battlefield-bf1");
    }
    for (let i = 0; i < 6 && game.zoneOf("rtw") !== "trash"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("battlefield-bf1");
      } else {
        await game.acting().passPriority();
      }
    }
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("helper")).toBe("bf1");
    expect(game.state("helper").isReady).toBe(true);
    expect(game.state("helper").combatRole).toBe("defender"); // P1 remains the defender
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1" }); // still going
  });

  /** P1 takes Focus, Rides the Wind the Helper into bf1 and everyone passes → combat resolves. */
  async function helperRidesInAndFights(game: Game): Promise<void> {
    for (let i = 0; i < 4 && game.actingSeat() !== P1; i++) {
      await game.acting().pass();
    }
    await game.p1.cast("rtw", { targets: "helper" });
    game.script(P1, [(d) => (d.kind === "pick" ? "battlefield-bf1" : undefined)]);
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf1");
    }
    await game.settle();
    expect(showdown(game)).toBeUndefined();
  }

  test("the combat then resolves Helper 4 vs Raider 3: the Raider dies, P1 (the defender) wins and holds bf1; P2 scores nothing and its turn resumes", async () => {
    const game = await board().build();
    await defenderRebuked(game);
    await helperRidesInAndFights(game);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("helper")).toBe("battlefield-bf1");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 792f2571b4fd68f3 says P1 LOSES control of bf1 when its lone Defender is Rebuked mid-combat, so
  // winning afterwards is a Conquer worth a point. CR 190.4.b / 190.4.c / 323.6 ("…unless there is a Combat or Showdown ongoing
  // there") and riftjudge cd9356416a0b87e4 on the SAME card ("You cannot lose control of a battlefield while a combat is
  // happening"), plus 144a43c3a845800b / 3e4999ac60026bdb / 4c23871af3d48982 / a0658bc35ab1df0b, say control never leaves P1
  // during the combat: the defender's win keeps bf1 and scores NOTHING. Engine follows CR — battlefield control timing model,
  // operations/battlefield-control.ts.
  test("ruling 792f2571b4fd68f3 (rewritten to CR 190.4.b) — P1 keeps control of bf1 through the combat even with no unit there; the defender's win is not a conquer and scores no point", async () => {
    const game = await board().build();
    await defenderRebuked(game);
    expect(bf1(game)?.controller).toBe(P1); // rule 190.4.b — frozen while the combat is ongoing here
    await helperRidesInAndFights(game);
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toEqual([]);
  });

  test("contrast: if P1 does nothing after the Rebuke, the showdown still runs to its end (everyone passes) and only THEN does the Raider conquer the empty bf1 for P2's point", async () => {
    const game = await board().build();
    await defenderRebuked(game);
    expect(game.p2.points()).toBe(0);
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });
});
