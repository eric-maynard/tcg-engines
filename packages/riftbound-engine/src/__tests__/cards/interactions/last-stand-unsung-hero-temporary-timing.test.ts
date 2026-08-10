/**
 * Interaction: Last Stand (ogn-069-298) × Unsung Hero (sfd-167-221) — when does a Temporary unit
 * die, and what does "If I was [Mighty]" look at?
 *
 *   Last Stand (Spell, Calm, 3 + [calm], Action)
 *     "Double a friendly unit's Might this turn. Give it [Temporary].
 *      (Kill it at the start of its controller's Beginning Phase, before scoring.)"
 *   Unsung Hero (Unit, Order, 2, 2 Might)
 *     "[Deathknell] — If I was [Mighty], draw 2. (… I'm Mighty while I have 5+ [Might].)"
 *
 * Rules: 816.1.b/c (Temporary = "At the start of this permanent's controller's Beginning Phase,
 * before scoring, kill this" — a triggered keyword, NOT a this-turn effect), 317.2.c (3d: all
 * "this turn" effects expire in the Expiration Step), 317.2.f (re-loop only if something FEPR'd),
 * 710 (Mighty is evaluated on current Might), 808.1.c/d + 808.1.d.3 (Deathknell notes the unit's
 * attributes as it dies).
 *
 * Board: P1's turn. Unsung Hero (2 + a buff = 3 Might) stands alone on bf1, which P1 controls.
 * P1 casts Last Stand on it: 6 Might (Mighty) + Temporary. It survives the turn.
 *
 * Expected:
 *   (a) P1's Expiration Step only expires the doubling (6 → 3); Temporary persists; nothing dies,
 *       no Deathknell, no draw. The Hero sits on bf1 at 3 Might through P2's whole turn.
 *   (b) At the start of P1's NEXT Beginning Phase, before scoring, Temporary kills it: P1 gets no
 *       Hold point for bf1 (its only unit died first) and Deathknell sees Might 3 → not Mighty →
 *       draws nothing (P1's hand grows only by the Draw Phase card).
 *   Contrast: if it dies during the Last Stand turn at 6 Might (combat), Deathknell draws 2.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LAST_STAND = "ogn-069-298";
const UNSUNG_HERO = "sfd-167-221";

/** P1's turn 2; Hero (buffed → 3 Might) at `heroAt`; P2 has a 7-Might vanilla wall on bf2. */
function board(heroAt: "bf1" | "base" = "bf1") {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .victoryScore(8)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, heroAt, UNSUNG_HERO, "hero", { buffed: true })
    .unit(P2, "bf2", { might: 7, name: "Wall" }, "wall")
    .hand(P1, LAST_STAND, "lastStand");
}

describe("Last Stand × Unsung Hero — Temporary kills at the NEXT Beginning Phase, not at end of turn", () => {
  test("Last Stand: 3 Might (2 + buff) → 6 this turn (Mighty) and the unit gains Temporary with no duration", async () => {
    const game = await board().build();
    expect(game.state("hero").might).toBe(3);
    expect(game.state("hero").isBuffed).toBe(true);
    await game.p1.cast("lastStand", { targets: "hero" });
    await game.settle();
    const s = game.state("hero");
    expect(s.might).toBe(6);
    expect(s.keywords).toContain("Temporary");
    // The keyword grant is not a "this turn" effect (only the doubling is).
    const temp = s.grantedKeywords.find((k) => k.keyword === "Temporary");
    expect(temp).toBeDefined();
    expect(temp?.duration).not.toBe("turn");
    expect(game.zoneOf("lastStand")).toBe("trash");
  });

  test("(a) P1's end of turn: doubling expires (6 → 3), Temporary stays, the Hero does NOT die, no Deathknell draw, nothing on the chain", async () => {
    const game = await board().build();
    await game.p1.cast("lastStand", { targets: "hero" });
    await game.settle();
    const hand = game.p1.hand().length;

    await game.p1.endTurn(); // Ending Phase incl. Expiration Step, then P2's turn begins
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]); // no Deathknell / no FEPR re-loop item
    expect(game.zoneOf("hero")).toBe("battlefield-bf1");
    expect(game.state("hero").might).toBe(3); // 710 — no longer Mighty
    expect(game.state("hero").keywords).toContain("Temporary");
    expect(game.state("hero").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand); // drew nothing
    expect(game.p1.trash()).toEqual(["lastStand"]);

    await game.settle(); // P2's open Main Phase — P2's own turn structure leaves P1's Temporary unit alone
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("hero")).toBe("battlefield-bf1");
    expect(game.state("hero").might).toBe(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(hand);
  });

  test("(b) start of P1's next Beginning Phase: Temporary's trigger kills the Hero BEFORE scoring — no Hold point for bf1, control lost", async () => {
    const game = await board().build();
    await game.p1.cast("lastStand", { targets: "hero" });
    await game.settle();
    await game.advanceTurn(); // → P2's main
    expect(game.p1.points()).toBe(0);

    await game.p2.endTurn(); // → P1's Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    // The Temporary kill is a triggered ability of the Hero, on the chain before the Scoring Step.
    expect(game.chain().map((i) => i.cardId)).toEqual(["hero"]);
    expect(game.chain()[0]?.triggered).toBe(true);
    expect(game.chain()[0]?.controller).toBe(P1);
    expect(game.zoneOf("hero")).toBe("battlefield-bf1"); // not dead yet — the trigger must resolve
    expect(game.p1.points()).toBe(0); // scoring has not happened (it waits behind the trigger)

    await game.p1.pass();
    await game.p2.pass(); // Temporary resolves → Hero is killed
    expect(game.zoneOf("hero")).toBe("trash");

    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(0); // bf1 was empty by the Scoring Step → no Hold
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("(b) its Deathknell checks 'was Mighty' as it died (3 Might) → draws nothing: P1's hand grows only by the Draw Phase card", async () => {
    const game = await board().build();
    await game.p1.cast("lastStand", { targets: "hero" });
    await game.settle();
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;

    await game.advanceTurn(); // P2's turn
    await game.advanceTurn(); // P1's next turn: Temporary kill → (Deathknell: not Mighty) → Channel → Draw → Main
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1); // +1 Draw Phase only, NOT +3
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.chain()).toEqual([]);
  });

  test("contrast: the Hero dies in combat during the Last Stand turn at 6 Might → Deathknell 'was Mighty' → P1 draws 2", async () => {
    const game = await board("base").build();
    await game.p1.cast("lastStand", { targets: "hero" });
    await game.settle();
    expect(game.state("hero").might).toBe(6);
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;

    await game.p1.move("hero", "bf2"); // 6 Might into a 7-Might defender → combat kills the Hero
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf2");
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.p1.deck()).toHaveLength(deck - 2);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast control: without Last Stand the 3-Might Hero dying in the same combat draws nothing", async () => {
    const game = await board("base").build();
    const hand = game.p1.hand().length;
    await game.p1.move("hero", "bf2");
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand); // Last Stand still in hand, nothing drawn
    expect(game.p1.hand()).toContain("lastStand");
  });
});
