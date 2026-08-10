/**
 * Ruling c817fcefe1bfc768 — Here to Help (SFD-111 → sfd-111-221) · Action · [Hidden] "You may play a unit from hand to a
 *     battlefield you control, reducing its cost by [3]."
 *   × Akshan, Mischievous (SFD-109 → sfd-109-221) · [4] (+ optional [body][body]) · 4 Might "[Weaponmaster] … When you play me,
 *     if you paid the additional cost, move an enemy gear to your base. You control it until I leave the board. …"
 *   × Dazzling Aurora (OGN-160 → ogn-160-298) · Gear "At the end of your turn, reveal cards from the top of your Main Deck until
 *     you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *   (Unchecked Power OGN-123 / Viktor are cited only as the contrasting "source dies WITH its trigger condition" case.)
 *
 * Q: In reaction to the opponent's Aurora end-of-turn trigger I Here-to-Help Akshan in and steal the Aurora. Does the
 *    trigger still resolve?
 * A: Yes. Once a triggered ability is on the chain, removing or stealing its source doesn't stop it; it resolves normally
 *    (for its original controller) unless something counters it. The source's state is only checked when it triggers.
 * Rules: 383 / 340 (a pending triggered item resolves independently of its source), 811 (Hidden → Reaction for [0]; from
 *        hidden the unit is played "here"), 419 (play via effect with reduced cost + optional additional cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HERE_TO_HELP = "sfd-111-221";
const AKSHAN = "sfd-109-221";
const DAZZLING_AURORA = "ogn-160-298";
const CLEAVE = "ogn-004-298";
const SKULKER = "ogn-175-298";

/**
 * End of P2's turn. P2 owns Dazzling Aurora (base) and holds bf2; P2's deck: Cleave, Skulker, Cleave. P1 holds bf1 with a
 * Warden, has Here to Help facedown there (hidden earlier) and Akshan in hand with [4] + [body]x3.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { body: 3 } })
    .gear(P2, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P2, "bf2", { might: 3, name: "Holder" }, "holder")
    .facedown(P1, "bf1", HERE_TO_HELP, "h2h")
    .hand(P1, AKSHAN, "akshan")
    .deck(P2, [CLEAVE, SKULKER, CLEAVE], ["s1", "unit1", "s2"]);
}

/** P2 ends turn (Aurora triggers); P1 flips Here to Help in response, plays Akshan through it paying [body][body], and Akshan's trigger steals the Aurora. */
async function stealMidTrigger(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P2, triggered: true })]);
  await game.p2.passPriority();
  expect(game.p1.can("reveal", "h2h")).toBe(true);
  await game.p1.reveal("h2h");
  expect(game.chain().map((c) => c.cardId)).toEqual(["aurora", "h2h"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Here to Help resolves
  const pick = game.decision();
  expect(pick).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "h2h" } });
  expect(pick?.kind === "pick" ? pick.options.map((o) => o.key) : []).toEqual(["akshan"]);
  await game.p1.pick("akshan");
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "akshan" } });
  await game.p1.yes(); // pay the additional [body][body]
  expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 1 } }); // [4]-[3] = [1], plus [body][body]
  expect(game.zoneOf("akshan")).toBe("battlefield-bf1"); // from hidden: played "here"
  expect(game.chain().map((c) => c.cardId)).toEqual(["aurora", "akshan"]);
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("aurora");
  }
  await game.p1.passPriority();
  await game.p2.passPriority(); // Akshan's trigger resolves → the Aurora changes hands
  return game;
}

describe("Ruling c817fcefe1bfc768 — stealing the Aurora in response to its own end-of-turn trigger doesn't stop that trigger", () => {
  test("Akshan (via the flipped Here to Help, extra cost paid) takes control of P2's Aurora while the Aurora trigger is STILL on the chain under P2's control", async () => {
    const game = await stealMidTrigger();
    expect(game.state("aurora")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
    expect(game.p1.gear()).toContain("aurora");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P2, triggered: true })]);
  });

  test("the trigger then resolves normally FOR P2: P2's deck is revealed until a unit — Cleave recycled to the bottom, the Skulker banished and played free for P2 (P2 chooses where)", async () => {
    const game = await stealMidTrigger();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Aurora's trigger resolves
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "unit1" } });
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("unit1")).toBe("banishment");
    expect(game.p2.deck()[0]).toBe("s2");
    expect(game.p2.deck().at(-1)).toBe("s1");
    await game.p2.pick("base");
    await game.settle();
    expect(game.state("unit1")).toMatchObject({ controller: P2, zone: "base" });
    expect(game.p2.units("base")).toContain("unit1");
    // …and the stolen Aurora stays with P1; the turn has passed to P1.
    expect(game.state("aurora").controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });

  test("control: with no response the same trigger does exactly the same thing (so the steal changed nothing about it)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "unit1" } });
    await game.p2.pick("base");
    await game.settle();
    expect(game.state("unit1")).toMatchObject({ controller: P2, zone: "base" });
    expect(game.p2.deck().at(-1)).toBe("s1");
    expect(game.state("aurora").controller).toBe(P2);
  });
});
