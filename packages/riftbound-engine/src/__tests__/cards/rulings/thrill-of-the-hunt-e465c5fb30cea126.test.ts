/**
 * Ruling e465c5fb30cea126 — Thrill of the Hunt (UNL-184 → unl-184-219) · [Reaction] · 2+[fury/body]
 *     "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *   × Akshan, Mischievous (SFD-109 → sfd-109-221) · 4 (+[body][body]) · "When you play me, if you paid the additional
 *     cost, move an enemy gear to your base. You control it until I leave the board. …"
 *   × Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · "At the end of your turn, reveal cards from the top of your Main
 *     Deck until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *
 * Q: In response to my opponent's Aurora end-of-turn trigger I Thrill of the Hunt my Akshan (paying [body][body] on the
 *    replay) and steal their Aurora. Do they still get to play a unit off the trigger?
 * A: Yes. The trigger is already on the chain; stealing (or removing) its source afterwards does not stop it. It
 *    resolves normally for the opponent even though I now control the Aurora.
 * Rules: 383 / 340 (a triggered ability on the chain resolves independently of its source), 356.4 (optional additional
 *        costs may still be paid on an "ignoring its cost" play), 124 (replayed Akshan is a new object ⇒ new play trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THRILL = "unl-184-219";
const AKSHAN = "sfd-109-221";
const DAZZLING_AURORA = "ogn-160-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — the unit Aurora reveals

/**
 * End of P2's turn. P2: Dazzling Aurora in base, deck top = Shipyard Skulker; a Guard holds bf2. P1: Akshan already on
 * the board (base), a Sentry holding bf1, Thrill in hand, [2] + 3 body (Thrill 2+[body], then [body][body] for Akshan).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { body: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", AKSHAN, "akshan")
    .gear(P2, DAZZLING_AURORA, "aurora")
    .deck(P2, [SKULKER, SKULKER], ["revealed", "p2next"])
    .hand(P1, THRILL, "thrill");
}

/** P2 ends the turn → Aurora's trigger is on the chain; P2 passes; P1 Thrills Akshan on top of it. */
async function thrillOnAuroraTrigger(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P2, triggered: true })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.p1.can("cast", "thrill")).toBe(true);
  await game.p1.cast("thrill", { targets: "akshan" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["aurora", "thrill"]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 2 } });
  return game;
}

/** Thrill resolves: Akshan banished, P1 picks bf1, pays [body][body]; his play trigger steals the Aurora. Aurora's trigger still waits. */
async function stealAurora(game: Game): Promise<void> {
  let r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // "to any battlefield" — the owner chooses
  expect(game.zoneOf("akshan")).toBe("banishment");
  await game.p1.pick("battlefield-bf1");
  r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 }); // pay [body][body]?
  expect(game.decision()?.source?.cardId).toBe("akshan");
  await game.p1.yes();
  expect(game.p1.power("body")).toBe(0);
}

describe("Ruling e465c5fb30cea126 — stealing Dazzling Aurora in response to its trigger does not stop the trigger", () => {
  test("Thrill resolves first (LIFO): Akshan is banished and replayed to bf1; paying [body][body] his trigger moves the enemy Aurora to P1's base under P1's control — while Aurora's end-of-turn item is STILL on the chain, controlled by P2", async () => {
    const game = await thrillOnAuroraTrigger();
    await stealAurora(game);
    // Drain P1's trigger only (pass until the Aurora item is alone or a P2 prompt appears).
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || d.kind !== "action" || d.context !== "chain" || game.chain().length <= 1) {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.zoneOf("akshan")).toBe("battlefield-bf1");
    expect(game.state("aurora")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
    expect(game.p1.gear()).toContain("aurora");
    // The source changed hands, but its trigger is untouched (or has just begun resolving for P2).
    const auroraItem = game.chain().find((c) => c.cardId === "aurora");
    if (auroraItem) {
      expect(auroraItem).toMatchObject({ controller: P2, countered: false, triggered: true });
    } else {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    }
  });

  test("the Aurora trigger then resolves NORMALLY for P2: P2 reveals the Skulker, chooses where to play it (P2's decision), and it enters under P2's control for free — even though P1 now controls the Aurora", async () => {
    const game = await thrillOnAuroraTrigger();
    await stealAurora(game);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    expect(game.actingSeat()).toBe(P2);
    const dests = game.decision()?.kind === "pick" ? (game.decision() as { options: { key: string }[] }).options.map((o) => o.key) : [];
    expect(dests).toContain("base");
    await game.p2.pick("base");
    await game.settle();
    expect(game.zoneOf("revealed")).toBe("base");
    expect(game.state("revealed")).toMatchObject({ cardType: "unit", controller: P2, owner: P2 });
    expect(game.p2.units("base")).toContain("revealed");
    expect(game.state("aurora").controller).toBe(P1); // still stolen
    expect(game.zoneOf("akshan")).toBe("battlefield-bf1");
    // The turn then passes to P1 as usual.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });
});
