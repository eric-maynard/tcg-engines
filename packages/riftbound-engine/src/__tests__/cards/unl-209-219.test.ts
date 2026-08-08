/**
 * Dusk Rose Lab — unl-209-219 · Battlefield
 *
 *   At the start of your Beginning Phase, you may kill a unit you control here to draw 1.
 *   (This happens before scoring.)
 *
 * Rules: 190.6.d ("you"/"your" = the battlefield's controller); 315.2.a → 315.2.b (Beginning Step
 * effects resolve BEFORE the Scoring Step's Hold); 190.4.a/c + 467 (Hold needs control at the
 * Scoring Step — kill your last unit here and control lapses in the cleanup, so no Hold point);
 * "you may … A to B" (optional; the kill is the price of the draw — no unit here ⇒ no draw);
 * targeting "a unit you control HERE" (units in base / elsewhere are never candidates);
 * Deathknell (808) still fires on the sacrificed unit.
 *
 * Head-judge corner cases for THIS card:
 *   1. THE trade-off the reminder text warns about: with ONE unit here, accepting draws a card but
 *      forfeits the Hold point (and control); declining keeps the unit and scores the Hold.
 *   2. With TWO units here you get both: kill one, still hold with the other (+1 card, +1 point).
 *   3. Only units HERE are offered — never the unit in my base.
 *   4. Only MY Beginning Phase — the opponent's turn start does nothing, and an opponent who does
 *      not control the Lab never gets the option.
 *   5. Every Beginning Phase, not once: over two of my turns I can feed it twice; the turn I feed it
 *      my last unit is the turn I stop holding.
 *   6. Partner: Watchful Sentry ([Deathknell] — Draw 1) as the offering → 2 cards from one trigger.
 *   7. Controller with no unit here (control seeded without occupants): nothing to kill → no draw,
 *      base unit untouched.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-209-219";
const WATCHFUL_SENTRY = "ogn-096-298"; // 2 Might, [Deathknell] — Draw 1

/** P2 is about to end turn 2; P1 controls Dusk Rose Lab with `here` units on it and one unit home. */
function lab(here: (string | { might: number; name: string })[], aliases: string[]) {
  const b = scenario().turn(2).active(P2).battlefield("lab", { controller: P1, def: CARD, inert: false, owner: P1 });
  here.forEach((def, i) => b.unit(P1, "lab", def, aliases[i]));
  return b.unit(P1, "base", { might: 2, name: "Homebody" }, "home");
}

describe("Dusk Rose Lab (unl-209-219)", () => {
  test("registry payload: optional Beginning-Phase trigger for the controller — kill a friendly unit HERE, then draw 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Dusk Rose Lab" });
    expect(def?.abilities).toEqual([
      {
        effect: {
          effects: [
            { target: { controller: "friendly", location: "here", type: "unit" }, type: "kill" },
            { amount: 1, type: "draw" },
          ],
          type: "sequence",
        },
        optional: true,
        trigger: { event: "beginning-phase", on: "controller", timing: "at" },
        type: "triggered",
      },
    ]);
  });

  test("at the start of MY Beginning Phase a triggered item goes on the chain and I am asked 'you may' — phase holds at beginning, no Hold point yet", async () => {
    const game = await lab([{ might: 2, name: "Lab Rat" }], ["rat"]).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lab", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "lab" } });
    expect(game.p1.points()).toBe(0); // "(This happens before scoring.)"
  });

  test("ONE unit here + accept: the unit dies, I draw 1 (2 in hand after the draw phase) — and I do NOT hold: 0 points, the Lab becomes uncontrolled", async () => {
    const game = await lab([{ might: 2, name: "Lab Rat" }], ["rat"]).build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("rat")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.lab?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("ONE unit here + decline: nothing dies, only the draw-phase card (1 in hand), and I HOLD for 1 point", async () => {
    const game = await lab([{ might: 2, name: "Lab Rat" }], ["rat"]).build();
    await game.p2.endTurn();
    await game.p1.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("rat")).toBe("battlefield-lab");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.lab?.controller).toBe(P1);
  });

  test("TWO units here: accept, choose which one dies (only units HERE are offered — not the base unit), still hold with the survivor → +1 card AND +1 point", async () => {
    const game = await lab([{ might: 2, name: "Lab Rat" }, { might: 3, name: "Assistant" }], ["rat", "assistant"]).build();
    await game.p2.endTurn();
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["assistant", "rat"]);
    await game.p1.pick("rat");
    await game.settle();
    expect(game.zoneOf("rat")).toBe("trash");
    expect(game.zoneOf("assistant")).toBe("battlefield-lab");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.lab?.controller).toBe(P1);
  });

  test("partner — Watchful Sentry as the offering: Lab draw + [Deathknell] draw + draw phase = 3 cards, and the other unit still holds", async () => {
    const game = await lab([{ might: 2, name: "Lab Rat" }, WATCHFUL_SENTRY], ["rat", "sentry"]).build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.p1.pick("sentry");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space — only MY Beginning Phase: when the opponent's turn starts nothing triggers and my unit here is safe", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("lab", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "lab", { might: 2, name: "Lab Rat" }, "rat")
      .build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("rat")).toBe("battlefield-lab");
    expect(game.decision()?.seat).toBe(P2);
  });

  test("negative space — 'your' means the CONTROLLER: P2 owns the Lab card but P1 controls it → P2's Beginning Phase offers P2 nothing (P2's units elsewhere are safe)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("lab", { controller: P1, def: CARD, inert: false, owner: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "lab", { might: 2, name: "Lab Rat" }, "rat")
      .unit(P2, "bf2", { might: 2, name: "Bystander" }, "bystander")
      .build();
    await game.p1.endTurn();
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.zoneOf("bystander")).toBe("battlefield-bf2");
    expect(game.zoneOf("rat")).toBe("battlefield-lab");
    expect(game.p2.hand()).toHaveLength(1); // draw phase only
  });

  test("controller with NO unit here (control seeded unoccupied): nothing to kill → no prompt that could kill the base unit, no extra card", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("lab", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .build();
    await game.p2.endTurn();
    const d = game.decision();
    if (d?.kind === "yes-no") {
      // If asked at all, accepting must not be able to reach the base unit.
      expect(d.canAccept).toBe(false);
      await game.p1.no();
    }
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("every Beginning Phase, not once (multi-turn): turn A feed the Rat (+1 card, still hold via Assistant); next time feed the Assistant — that turn draws again but scores NO Hold", async () => {
    const game = await lab([{ might: 2, name: "Lab Rat" }, { might: 3, name: "Assistant" }], ["rat", "assistant"]).build();
    // P1's turn A
    await game.p2.endTurn();
    await game.p1.yes();
    await game.p1.pick("rat");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(2);
    // → P2 → P1's turn B: the trigger fires again; one candidate left.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lab", triggered: true })]);
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("assistant")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(4); // 2 + Lab draw + draw phase
    expect(game.p1.points()).toBe(1); // no Hold on turn B
    expect(game.gameState.battlefields.lab?.controller).toBeNull();
  });
});
