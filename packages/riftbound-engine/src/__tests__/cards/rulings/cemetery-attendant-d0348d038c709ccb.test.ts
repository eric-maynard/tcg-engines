/**
 * Ruling d0348d038c709ccb — Cemetery Attendant (OGN-165 → ogn-165-298) · Unit · Chaos · 3 + [chaos] · 3 Might
 *     "When you play me, return a unit from your trash to your hand."
 *   × Hallowed Tomb (OGN-281 → ogn-281-298, Battlefield) "When you hold here, you may return your Chosen Champion from your
 *     trash to your Champion Zone if it is empty."
 *
 * Q: When Cemetery Attendant targets a champion unit in the trash, does it go back to the Champion Zone or to hand?
 * A: To your HAND. A chosen champion is an ordinary card once it has left the Champion Zone; Hallowed Tomb is the only
 *    card that puts a chosen champion back into the Champion Zone.
 * Rules: 108.3.b–d (Chosen Champion starts in the Champion Zone; it is not returned there by normal means), 355.10.a
 *        (returning a card from the trash), 141.1.b (a unit in the trash is just a card).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CEMETERY_ATTENDANT = "ogn-165-298";
const HALLOWED_TOMB = "ogn-281-298";
const THE_BOSS = "ogn-269-298"; // Sett legend
const SETT_BRAWLER = "ogn-164-298"; // P1's Chosen Champion (Sett), already dead in the trash

describe("Ruling d0348d038c709ccb — Cemetery Attendant returns a champion from the trash to HAND, not the Champion Zone", () => {
  test("P1 (Sett legend, Champion Zone empty, Sett, Brawler in the trash) plays the Attendant: the trigger offers Sett among the trash units; picking him puts him in P1's HAND and the Champion Zone stays empty", async () => {
    const game = await scenario()
      .legend(P1, THE_BOSS, "boss")
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .trash(P1, SETT_BRAWLER, "sett")
      .trash(P1, { might: 1, name: "Dead Recruit" }, "corpse")
      .hand(P1, CEMETERY_ATTENDANT, "attendant")
      .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
      .build();
    expect(game.p1.champion()).toBeUndefined(); // Champion Zone empty
    expect(game.state("sett").cardType).toBe("unit");
    await game.p1.play("attendant");
    expect(game.zoneOf("attendant")).toBe("base");
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const offered = (game.decision() as Extract<ReturnType<typeof game.decision>, { kind: "pick" }>).options.map((o) => o.card ?? o.key).sort();
    expect(offered).toEqual(["corpse", "sett"]);
    await game.p1.pick("sett");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sett")).toBe("hand");
    expect(game.p1.hand()).toEqual(["sett"]);
    expect(game.p1.champion()).toBeUndefined(); // NOT back in the Champion Zone
    expect(game.zoneOf("corpse")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Hallowed Tomb is the card that does return it to the Champion Zone: P1 holds the Tomb at the start of their turn, opts in, and Sett goes trash → Champion Zone", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .legend(P1, THE_BOSS, "boss")
      .battlefield("tomb", { controller: P1, def: HALLOWED_TOMB, inert: false })
      .unit(P1, "tomb", { might: 3, name: "Holder" }, "holder")
      .trash(P1, SETT_BRAWLER, "sett")
      .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
      .build();
    expect(game.p1.champion()).toBeUndefined();
    await game.p2.endTurn(); // → P1's Beginning Phase: hold the Tomb
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tomb" } });
    await game.p1.yes();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("sett")).toBe("championZone");
    expect(game.p1.champion()).toBe("sett");
    expect(game.p1.points()).toBe(1); // the hold itself
  });
});
