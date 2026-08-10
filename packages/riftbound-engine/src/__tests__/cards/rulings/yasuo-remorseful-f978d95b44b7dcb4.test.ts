/**
 * Ruling f978d95b44b7dcb4 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Calm · [6] · 6 Might · "When I attack, deal damage equal to
 *     my Might to an enemy unit here."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · [2][chaos] · "Move a friendly unit and ready it."
 *   × Mindsplitter (OGN-192 → ogn-192-298) · Chaos · 7 Might.
 *
 * Q: Yasuo attacks a battlefield held by a Poro; during the combat the defender Ride-the-Winds Mindsplitter in. Does
 *    Mindsplitter survive, and does the defender score?
 * A: Yasuo's attack trigger targets the Poro (the unit already there). The defender may then Ride the Wind Mindsplitter to
 *    the battlefield during the showdown; in combat Mindsplitter (7) kills Yasuo (6) and survives. The defender scores NOTHING:
 *    their control of the battlefield never dropped, so holding it off is a defence, not a conquer.
 * Rules: 383/402 (trigger target fixed at finalization), 344–347 (Focus/Action timing in a showdown), 466.5 / 190.4.b (control
 *        is frozen during the combat; defender remaining = no conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const RIDE_THE_WIND = "ogn-173-298";
const MINDSPLITTER = "ogn-192-298";

/** P1's turn. P2 holds bf1 with a lone 2-Might Poro; Mindsplitter ready in P2's base; Ride the Wind + [2][chaos]. Yasuo in P1's base. */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Poro", tags: ["Poro"] }, "poro")
    .unit(P2, "base", MINDSPLITTER, "mind")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Yasuo attacks bf1; his trigger is locked on the Poro (only enemy unit here). */
async function yasuoAttacks(game: Game): Promise<void> {
  await game.p1.move("yasuo", "bf1");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("poro");
  }
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["poro"], triggered: true })]);
}

/** …the trigger resolves (6 to the Poro → dies); P1 then passes Focus and P2 Ride-the-Winds Mindsplitter to bf1. */
async function mindsplitterRidesIn(game: Game): Promise<void> {
  await yasuoAttacks(game);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("poro")).toBe("trash");
  // Combat is still ongoing at bf1: control is frozen with P2 (190.4.b), the showdown stays open, P1 (attacker) has Focus.
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1 });
  expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "rtw")).toBe(true);
  await game.p2.cast("rtw", { targets: "mind" });
  for (let i = 0; i < 6 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick(d.options.find((o) => o.key === "battlefield-bf1" || o.key === "bf1")?.key ?? "battlefield-bf1");
    } else if (d?.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("mind")).toBe("bf1");
  expect(game.state("mind")).toMatchObject({ combatRole: "defender", isReady: true });
}

describe("Ruling f978d95b44b7dcb4 — Ride the Wind brings Mindsplitter into Yasuo's combat: Yasuo dies, but the defender scores nothing", () => {
  test("Yasuo's 'when I attack' target is the unit already at the battlefield (the Poro) — Mindsplitter, still in base, is not even offered", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["poro"]);
      await game.p1.pick("poro");
    }
    expect(game.chain()[0]).toMatchObject({ cardId: "yasuo", targets: ["poro"] });
  });

  // RULING-CONFLICT: riftjudge f978d95b44b7dcb4's sequence has the defender Ride the Wind "with priority" while Yasuo's trigger is
  // still on the chain; CR 347 / 151.2 make an [Action] spell playable in a showdown only in the Open state with FOCUS — so the
  // engine lets P2 cast it once the trigger has resolved and Focus reaches P2. The ruling's outcome is unchanged (below).
  test("timing per CR: with Yasuo's trigger on the chain Ride the Wind ([Action]) is NOT castable on mere priority; after the trigger resolves and P1 passes Focus, it is", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "rtw")).toBe(false);
    await game.p2.passPriority(); // trigger resolves: 6 to the Poro
    expect(game.zoneOf("poro")).toBe("trash");
    await game.p1.passFocus();
    expect(game.p2.can("cast", "rtw")).toBe(true);
  });

  test("Mindsplitter rides in as a defender; combat: 7 vs 6 — Yasuo dies, Mindsplitter survives (6 < 7, healed afterwards)", async () => {
    const game = await board().build();
    await mindsplitterRidesIn(game);
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.state("mind")).toMatchObject({ damage: 0, location: "bf1" });
  });

  test("…and P2 scores NO point: control of bf1 never left P2 during the combat, so keeping it is a defence, not a conquer", async () => {
    const game = await board().build();
    await mindsplitterRidesIn(game);
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
