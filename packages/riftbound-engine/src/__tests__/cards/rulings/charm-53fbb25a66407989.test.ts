/**
 * Ruling 53fbb25a66407989 — Charm (OGN-043 → ogn-043-298) · Action · [1][calm] "Move an enemy unit."
 *   × Draven, Audacious (SFD-148 → sfd-148-221) · 6 Might · [Deflect] "The first time I win a combat each turn, you score 1 point. …"
 *
 * Q: If I "hold to 7" and then Charm a Recruit into my Draven, Audacious, would I gain a point to 8?
 * A: (The responder could not identify "Charm" and gave no ruling on the Draven line.) The only rule stated: "Hold" is the
 *    scoring action at a battlefield you control; at 7 points, performing a Hold takes you to 8 — the winning point — since a
 *    Hold satisfies the requirements for scoring the final point.
 * Rules: 315.2.b (Scoring Step: the turn player Holds each battlefield they control), 467 (scoring; the final point may be
 *        scored by holding).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const DRAVEN = "sfd-148-221";

describe("Ruling 53fbb25a66407989 — at 7 points a Hold scores the 8th, winning point", () => {
  test("P1 on 7 controls bf1 with Draven at the start of their turn: the Scoring Step's Hold takes P1 to 8 and wins the game", async () => {
    const game = await scenario()
      .turn(5)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", DRAVEN, "draven")
      .unit(P2, "bf2", { might: 1, name: "Recruit" }, "recruit")
      .build();
    expect(game.p1.points()).toBe(7);
    await game.p2.endTurn(); // → P1's Beginning Phase → Scoring Step: Hold bf1
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("control: the same Hold from 6 just scores to 7 and play continues into P1's main phase", async () => {
    const game = await scenario()
      .turn(5)
      .active(P2)
      .victoryScore(8)
      .points(P1, 6)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", DRAVEN, "draven")
      .build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
  });

  test("(premise) Charm does exist and does what the question assumes: for [1][calm] it moves an ENEMY unit — here P2's Recruit from bf2 into Draven's bf1, opening a combat on P1's turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .points(P1, 7)
      .victoryScore(8)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", DRAVEN, "draven")
      .unit(P2, "bf2", { might: 1, name: "Recruit" }, "recruit")
      .hand(P1, CHARM, "charm")
      .build();
    const targets = game.p1.option("cast", "charm")?.fields.find((f) => f.name === "targets")?.options?.flat() ?? [];
    expect(targets).toEqual(["recruit"]); // enemy units only — Draven is not offered
    await game.p1.cast("charm", { answers: ["bf1"], targets: "recruit" });
    for (let i = 0; i < 6 && game.locationOf("recruit") !== "bf1"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        const bf1 = d.options.find((o) => (o.zone ?? o.key).includes("bf1")) ?? d.options[0]!;
        await game.p1.answer({ keys: [bf1.key], kind: "pick" });
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("recruit")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true); // an enemy unit arrived where Draven stands → combat
  });
});
