/**
 * Ruling 20fd1da3df6a9d19 — Arcane Shift (SFD-200 → sfd-200-221) · Action spell · Mind/Chaos · [3][rainbow]
 *     "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a battlefield.
 *      Banish this."
 *   × Fizz, Trickster (SFD-140 → sfd-140-221) · Champion Unit · Chaos · [3][chaos] · 3 Might
 *     "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its Energy
 *      cost. Recycle that spell after you play it."
 *
 * Q: Arcane Shift on my own Fizz — what resolves first, the 3 damage or Fizz's "when you play me"?
 * A: The damage. Arcane Shift finishes ALL its instructions (banish Fizz → play Fizz → [Fizz's WYPM is added to the
 *    chain, pending] → deal 3 → banish itself) before Fizz's trigger, now the newest chain item, resolves and plays
 *    a spell from the trash.
 * Rules: 157.3.a / 359 (an item resolves in its entirety before anything added meanwhile), 383.2.c, FAQ #8499.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARCANE_SHIFT = "sfd-200-221";
const FIZZ = "sfd-140-221";
const DISCIPLINE = "ogn-058-298"; // [2] Reaction: +2 Might this turn, draw 1 — Fizz's replay candidate in the trash

/**
 * P1's turn. Fizz in P1's base; P2's 5-Might Wall on P2's bf1 (the enemy target); P1 also controls bf2. Discipline
 * is in P1's trash. P1 has exactly [3][rainbow] for Arcane Shift (Fizz's replay and Discipline are free).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", FIZZ, "fizz")
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .trash(P1, DISCIPLINE, "disc")
    .hand(P1, ARCANE_SHIFT, "shift");
}

const isFizzOptIn = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "fizz";

/** Cast Arcane Shift [fizz, wall], both pass; place the replayed Fizz in base when asked; stop at Fizz's opt-in. */
async function shiftResolvesToFizzOptIn(game: Game): Promise<void> {
  await game.p1.cast("shift", { targets: ["fizz", "wall"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["shift"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  for (let i = 0; i < 6 && !isFizzOptIn(game.decision()); i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "destination") {
      expect(d.seat).toBe(P1); // "its owner plays it"
      await game.p1.pick("base");
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(isFizzOptIn(game.decision())).toBe(true);
}

describe("Ruling 20fd1da3df6a9d19 — Arcane Shift's 3 damage lands before Fizz's 'when you play me' resolves", () => {
  test("Arcane Shift needs both targets as cast (friendly Fizz + enemy Wall at a battlefield) and goes on the chain alone", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "shift")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toEqual([["fizz", "wall"]]);
    await game.p1.cast("shift", { targets: ["fizz", "wall"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shift", controller: P1, triggered: false })]);
    expect(game.state("wall").damage).toBe(0);
    expect(game.zoneOf("fizz")).toBe("base");
  });

  test("by the time Fizz's WYPM trigger is asking anything, Arcane Shift has COMPLETELY resolved: Fizz was banished and replayed (in base, cost ignored), Wall already has 3 damage, and Arcane Shift is in banishment — the trigger is the only chain item", async () => {
    const game = await board().build();
    await shiftResolvesToFizzOptIn(game);
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.state("fizz")).toMatchObject({ controller: P1, owner: P1 });
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", controller: P1, triggered: true })]);
    expect(game.zoneOf("disc")).toBe("trash"); // Fizz's ability has NOT resolved yet
    expect(game.p1.energy()).toBe(0); // Fizz replayed "ignoring its cost"
  });

  test("only then does Fizz's trigger resolve: accepting plays Discipline from the trash (free), and Discipline is recycled after it resolves", async () => {
    const game = await board().build();
    await shiftResolvesToFizzOptIn(game);
    await game.p1.yes();
    // Trigger resolves after both pass; Discipline is then played from the trash and needs a target.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "disc")) {
        expect(d.seat).toBe(P1);
        await game.p1.pick("disc");
      } else if (d.kind === "pick" && d.semantics === "target") {
        expect(d.seat).toBe(P1);
        expect(d.source?.cardId).toBe("disc");
        await game.p1.pick("fizz");
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("fizz").might).toBe(5); // Discipline's +2 resolved
    expect(game.zoneOf("disc")).toBe("mainDeck"); // "Recycle that spell after you play it"
    expect(game.p1.energy()).toBe(0); // Energy cost ignored
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 20fd1da3df6a9d19's step-by-step walkthrough has "play Fizz" — including his destination
  // choice — finish before the "Deal 3" instruction; CR 354.3 says a play begun while another effect is resolving
  // pauses ("continue resolving it before proceeding with any further steps of this process"), so Arcane Shift runs
  // ALL of its own instructions first and the replay's placement is asked afterwards — engine follows CR. The ruling's
  // headline answer (the damage lands before Fizz's "when you play me" trigger resolves) is unaffected and is
  // asserted by the tests above.
  // rule 354.3: playing a card mid-resolution waits for the resolving effect to finish.
  test("ruling 20fd1da3df6a9d19 (CR-corrected) — Arcane Shift finishes its own instructions first: at Fizz's destination prompt the 3 damage is already dealt and Arcane Shift has self-banished (354.3)", async () => {
    const game = await board().build();
    await game.p1.cast("shift", { targets: ["fizz", "wall"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(game.zoneOf("fizz")).toBe("banishment");
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("shift")).toBe("banishment");
  });
});
