/**
 * Ruling abbbc8493d12077c — Deathgrip (SFD-163 → sfd-163-221) · Spell · Order · [2] · Reaction
 *     "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this turn. Draw 1."
 *   × Tactical Retreat (UNL-175 → unl-175-219) · Spell · Order · [2] · Reaction · "Choose a friendly unit. The next time it would
 *     die this turn, heal it, exhaust it, and recall it instead."
 *   × (Retreat OGN-104 → ogn-104-298 is the other card named; the ruling is about Tactical Retreat.)
 *
 * Q: Can I play Deathgrip and then save the chosen unit with Tactical Retreat?
 * A: Yes. Tactical Retreat (played in response) resolves first and sets up its replacement; Deathgrip then tries to kill the unit
 *    and the death is replaced — healed, exhausted, recalled. Because the unit was not actually killed, "If you do" fails: no Might
 *    bonus is given to another unit. "Draw 1" is not contingent and still happens.
 * Rules: 366–373 (replacement effects; "instead"), 359.3.c ("if you do" checks the instruction was performed), 383 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATHGRIP = "sfd-163-221";
const TACTICAL_RETREAT = "unl-175-219";

/** P1's turn with exactly [4] (2 + 2). Victim (3, 1 damage) at P1's bf1; Recipient (2) + Other (1) in base; Deathgrip + Tactical Retreat in hand; deck top known. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim", { damage: 1 })
    .unit(P1, "base", { might: 2, name: "Recipient" }, "rec")
    .unit(P1, "base", { might: 1, name: "Other" }, "other")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, DEATHGRIP, "grip")
    .hand(P1, TACTICAL_RETREAT, "tr")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Deathgrip on the Victim, then — still holding priority — Tactical Retreat on the same Victim in response. */
async function gripThenRetreat(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("grip", { targets: "victim" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grip", controller: P1, targets: ["victim"] })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "tr")).toBe(true);
  await game.p1.cast("tr", { targets: "victim" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["grip", "tr"]);
  return game;
}

describe("Ruling abbbc8493d12077c — Tactical Retreat saves the Deathgrip victim: no 'If you do' bonus, but still Draw 1", () => {
  test("Tactical Retreat resolves first (LIFO) and does nothing visible yet — the Victim is still at bf1, damaged, ready; Deathgrip still pending", async () => {
    const game = await gripThenRetreat();
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "tr"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("tr")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["grip"]);
    expect(game.state("victim")).toMatchObject({ damage: 1, isReady: true, location: "bf1" });
  });

  test("Deathgrip then 'kills' the Victim → replaced: it is healed (0 damage), exhausted and recalled to base — NOT in the trash", async () => {
    const game = await gripThenRetreat();
    await game.settle();
    expect(game.zoneOf("grip")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.p1.trash()).not.toContain("victim");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true, location: "base", might: 3 });
  });

  test("'If you do' is NOT satisfied: P1 is never asked to pick 'another friendly unit' and nobody gains Might; but 'Draw 1' still happens (d1 drawn)", async () => {
    const game = await gripThenRetreat();
    const prompts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      prompts.push(`${d.seat}:${d.kind}:${d.prompt}`);
      // If the engine wrongly asks for a recipient, answer it so the assertion below reports the real symptom (a Might change).
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.answer({ keys: [d.options[0]!.key], kind: "pick" });
      } else {
        break;
      }
    }
    expect(prompts).toEqual([]);
    expect(game.state("rec")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.state("other")).toMatchObject({ might: 1, mightModifier: 0 });
    expect(game.state("victim")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.p1.hand()).toEqual(["d1"]); // both spells gone from hand, one card drawn
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — Deathgrip alone: the Victim dies, P1 picks the Recipient for +3 (→ 5) and draws 1", async () => {
    const game = await board().build();
    await game.p1.cast("grip", { targets: "victim" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("rec");
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("rec")).toMatchObject({ might: 5, mightModifier: 3 });
    expect(game.p1.hand().toSorted()).toEqual(["d1", "tr"]);
  });
});
