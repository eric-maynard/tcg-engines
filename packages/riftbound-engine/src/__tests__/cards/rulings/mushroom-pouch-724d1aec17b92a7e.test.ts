/**
 * Ruling 724d1aec17b92a7e — Mushroom Pouch (OGN-101 → ogn-101-298) · Gear · 2 "At the start of your Beginning Phase, if you
 *     control a facedown card at a battlefield, draw 1."
 *   × Sprite (OGN-274 → ogn-274-298) · 3 Might · [Temporary] ("Kill me at the start of your Beginning Phase, before scoring.")
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] "Kill a unit at a battlefield. Its controller draws 2."
 *   × Shen, Kinkou (OGN-241 → ogn-241-298) · [Reaction] unit · 3+[order] · 3 Might
 *
 * Q: Can you respond to a Temporary trigger in the Beginning Phase, and is Temporary's "before scoring" a different timing
 *    window from other start-of-Beginning-Phase triggers like Mushroom Pouch?
 * A: All "at the start of Beginning Phase" triggers (Temporary, Mushroom Pouch, …) trigger together in the Beginning Step,
 *    before the Scoring Step; "before scoring" is reminder text, not a separate window. They go on the chain and can be
 *    responded to (e.g. Hidden Blade from hidden on your own Sprite → you draw 2; or play Shen, who is then there in time to
 *    hold at the Scoring Step); then the triggers resolve; then Scoring happens.
 * Rules: 315.1 (Beginning Step → Scoring Step), 816 (Temporary), 811 (Hidden → Reaction), 340 (LIFO), 450 (hold).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MUSHROOM_POUCH = "ogn-101-298";
const SPRITE = "ogn-274-298";
const HIDDEN_BLADE = "ogn-213-298";
const WAGES_OF_PAIN = "sfd-070-221"; // just "a facedown card" at bf2 so the Pouch condition holds throughout
const SHEN = "ogn-241-298";

/**
 * End of P2's turn 3. P1: Mushroom Pouch in base; bf1 (P1) holds only a Sprite [Temporary] with Hidden Blade facedown there;
 * bf2 (P1) holds a Holder (2) with another facedown card. P2 has a bystander in base.
 */
function viktorBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .gear(P1, MUSHROOM_POUCH, "pouch")
    .unit(P1, "bf1", SPRITE, "sprite")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .facedown(P1, "bf2", WAGES_OF_PAIN, "other")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander");
}

/** P2 ends the turn → P1's Beginning Step; accept any "order your simultaneous triggers" offer as listed. */
async function intoP1Beginning(game: Game): Promise<void> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  if (game.decision()?.kind === "order") {
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 }); // P1 orders ITS simultaneous triggers
    await game.acceptTriggerOrder();
  }
}

const triggeredIds = (game: Game) =>
  game
    .chain()
    .filter((c) => c.triggered)
    .map((c) => c.cardId)
    .toSorted();

describe("Ruling 724d1aec17b92a7e — Temporary and Mushroom Pouch share the Beginning Step; both are on the chain (respondable) before Scoring", () => {
  test("Beginning Step: the Sprite's Temporary trigger AND Mushroom Pouch's trigger are on the chain together, the phase is 'beginning', nothing has been scored and the Sprite is still alive", async () => {
    const game = await viktorBoard().build();
    await intoP1Beginning(game);
    expect(game.phase()).toBe("beginning");
    expect(triggeredIds(game)).toEqual(["pouch", "sprite"]);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(0); // Scoring Step has not happened yet
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "blade")).toBe(true); // a Reaction window exists
  });

  test("the Viktor line: P1 flips Hidden Blade onto its OWN Sprite in response — Blade resolves first (Sprite killed, P1 draws 2) while both triggers still wait, still before Scoring", async () => {
    const game = await viktorBoard().build();
    await intoP1Beginning(game);
    const hand0 = game.p1.hand().length;
    await game.p1.reveal("blade", { answers: ["sprite"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("sprite");
    }
    expect(game.chain().at(-1)).toMatchObject({ cardId: "blade", controller: P1, targets: ["sprite"], triggered: false });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Hidden Blade resolves (LIFO)
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("sprite")).toBe("gone"); // a Sprite is a token: it ceases to exist once killed
    expect(game.p1.hand()).toHaveLength(hand0 + 2); // "Its controller draws 2" — P1
    expect(triggeredIds(game)).toEqual(["pouch", "sprite"]); // the Beginning-Step triggers are still pending
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(0);
  });

  test("…then the triggers resolve (Pouch draws 1; Temporary finds its Sprite already dead) and only THEN the Scoring Step runs: P1 holds bf2 (+1) but not the now-empty bf1", async () => {
    const game = await viktorBoard().build();
    await intoP1Beginning(game);
    await game.p1.reveal("blade", { answers: ["sprite"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("sprite");
    }
    await game.p1.passPriority();
    await game.p2.passPriority();
    const handAfterBlade = game.p1.hand().length;
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sprite")).toBe("gone"); // a Sprite is a token: it ceases to exist once killed
    // Pouch's draw (facedown card still at bf2) + the normal Draw Step card.
    expect(game.p1.hand().length).toBe(handAfterBlade + 2);
    expect(game.p1.points()).toBe(1); // bf2 held; bf1 had no unit at the Scoring Step
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the Shen line: responding to the Temporary trigger by playing Shen (Reaction) to that battlefield puts him there BEFORE the Scoring Step — the Sprite dies, Shen holds bf1 and P1 scores it", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SPRITE, "sprite")
      .runes(P1, "order", 4)
      .hand(P1, SHEN, "shen")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .build();
    await intoP1Beginning(game);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(0);
    // Pay for Shen with rune [Add] abilities during the Reaction window, then play him to bf1.
    await game.p1.tapRunes(3);
    await game.p1.recycleRune({ domain: "order" });
    expect(game.p1.can("play", "shen")).toBe(true);
    await game.p1.play("shen", { to: "bf1" });
    expect(game.locationOf("shen")).toBe("bf1"); // a unit enters play at once
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1"); // Temporary has not resolved yet
    expect(game.p1.points()).toBe(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("sprite")).toBe("gone"); // a Sprite is a token: it ceases to exist once killed
    expect(game.locationOf("shen")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // Shen was there in time to hold at the Scoring Step
    expect(game.violations()).toEqual([]);
  });
});
