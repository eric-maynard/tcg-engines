/**
 * Ruling e273cd59930f15f6 — Diana, Lunari (UNL-079 → unl-079-219) · Unit · Mind · 3 · 3 Might
 *   "When a showdown begins here, you may pay [1]. If you do, [Predict], then reveal the top card of
 *    your Main Deck. If it's a spell, draw it."
 *
 * Q: Does Diana's ability resolve before or after attack / defend abilities at the start of combat?
 * A: After all of them. "When a showdown begins here" is a start-of-showdown effect processed as the
 *    first step of opening combat (464.2.b) — before attacker/defender designations produce their
 *    attack/defend triggers (464.2.c.3, 383.4.e/f, 464.2.e). Being lowest on the chain, it resolves
 *    last (340.1).
 *
 * The attack / defend triggers are modelled with inline units whose triggers simply draw a card, so
 * the resolution order is observable from whose hand grows when.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIANA_LUNARI = "unl-079-219";

const RAIDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  might: 4,
  name: "Raider", // "When I attack, draw 1."
};
const GUARD = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "defend", on: "self" }, type: "triggered" }],
  might: 2,
  name: "Guard", // "When I defend, draw 1."
};

/** Pass priority once for whoever holds it. */
async function passOnce(game: Game): Promise<void> {
  const d = game.decision();
  expect(d?.kind).toBe("action");
  await game.seat(d!.seat).pass();
}

/** Pass until the chain shrinks by one item (one resolution). */
async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 4 && game.chain().length >= before; i++) {
    await passOnce(game);
  }
  expect(game.chain().length).toBe(before - 1);
}

describe("Ruling e273cd59930f15f6 — Diana's showdown-begin trigger sits UNDER the attack/defend triggers and resolves last", () => {
  test("Diana defending: chain (bottom→top) = [Diana, attacker's attack trigger, defender's defend trigger]", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", DIANA_LUNARI, "diana")
      .unit(P2, "bf1", GUARD, "guard")
      .unit(P1, "base", RAIDER, "raider")
      .deck(P1, ["ogn-175-298"], ["p1top"])
      .deck(P2, ["ogn-175-298"], ["p2top"])
      .build();
    await game.p1.move("raider", "bf1");

    // Designations were assigned as combat opened (464.2.c.3).
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.state("diana").combatRole).toBe("defender");
    // 464.2.b then 464.2.e.1: start-of-showdown first, then attacker's triggers, then defender's.
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "diana", controller: P2, triggered: true }),
      expect.objectContaining({ cardId: "raider", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "guard", controller: P2, triggered: true }),
    ]);

    // rule 383.3.b.1 / 402 (finalization): Diana's "you may pay [1]" is asked of P2 as the item is
    // finalized onto the chain, before any priority — her chain POSITION (bottom) is unchanged.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(game.decision()?.prompt).toMatch(/Diana/);
    await game.p2.no();
    expect(game.p2.energy()).toBe(1); // declined → nothing paid
    // rule 383.3.a: "no" removes the unfinalized item at once; the other two triggers remain.
    expect(game.chain().map((i) => i.cardId)).toEqual(["raider", "guard"]);

    // 340.1 — newest first: Guard's defend trigger resolves (P2 draws) …
    await resolveTop(game);
    expect(game.p2.hand()).toEqual(["p2top"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain().map((i) => i.cardId)).toEqual(["raider"]);
    // … then Raider's attack trigger (P1 draws).
    await resolveTop(game);
    expect(game.p1.hand()).toEqual(["p1top"]);
    expect(game.chain()).toEqual([]);
  });

  test("Diana attacking (she moves in with the Raider): still bottom of the chain, under her own side's attack trigger and the enemy defend trigger", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", GUARD, "guard")
      .unit(P1, "base", DIANA_LUNARI, "diana")
      .unit(P1, "base", RAIDER, "raider")
      .deck(P1, ["ogn-175-298", "ogn-043-298"], ["p1top", "p1spell"]) // Charm (a spell) will be on top for Diana
      .deck(P2, ["ogn-175-298"], ["p2top"])
      .build();
    await game.p1.move(["diana", "raider"], "bf1");

    expect(game.state("diana").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "diana", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "raider", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "guard", controller: P2, triggered: true }),
    ]);

    // rule 383.3.b.1: the "you may pay [1]" is asked — and the energy paid — at finalization.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt).toMatch(/Diana/);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0); // paid [1]

    await resolveTop(game); // Guard → P2 draws
    expect(game.p2.hand()).toEqual(["p2top"]);
    await resolveTop(game); // Raider → P1 draws p1top; p1spell is now on top
    expect(game.p1.hand()).toEqual(["p1top"]);
    expect(game.chain().map((i) => i.cardId)).toEqual(["diana"]);
    await resolveTop(game); // Diana last
    // Predict (may recycle the top card) then reveal: answer any remaining Diana prompts by keeping the card.
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (!d || d.seat !== P1 || d.kind === "action") {
        break;
      }
      if (d.kind === "yes-no") {
        await game.p1.no();
      } else if (d.kind === "pick") {
        await game.p1.decline();
      } else if (d.kind === "deck-arrange") {
        await game.p1.answer({ kind: "deck-arrange", recycle: [], top: d.cards.map((c) => c.key) });
      } else {
        break;
      }
    }
    // The revealed top card was a spell (Charm) → drawn.
    expect(game.p1.hand()).toContain("p1spell");
  });
});
