/**
 * Ruling 98b6e24391f9590f — Heedless Resurrection (UNL-142 → unl-142-219) × Lunar Boon (UNL-125 → unl-125-219)
 *   × Fizz, Trickster (SFD-140 → sfd-140-221)
 *
 *   Heedless Resurrection — Reaction 2+[chaos]: "As an additional cost to play this, kill a friendly unit. Play a unit from
 *     your trash that costs no more Energy and no more Power than the killed unit, ignoring its cost."
 *   Lunar Boon — Reaction 3: "Discard 1, then draw 2."
 *   Fizz, Trickster — Unit 3+[chaos] · 3: "When you play me, you may play a spell from your trash with Energy cost no more
 *     than [3], ignoring its Energy cost. Recycle that spell after you play it."
 *
 * Q: Heedless Resurrection is my only card in hand after playing Fizz; Fizz plays Lunar Boon from my trash. Can I chain
 *    Heedless Resurrection to it and still draw 2?
 * A: Yes. Heedless (a Reaction) goes on top of Lunar Boon and resolves first (kill paid, unit returned). Lunar Boon then
 *    resolves with an empty hand: the discard is an effect, not a cost — discard 0, still draw 2. Then Fizz's ability is done.
 * Rules: 813 (Reaction in a Closed state), 340.1 (LIFO), 359.3 "do as much as you can", 356 (additional cost paid up front).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEEDLESS = "unl-142-219";
const LUNAR_BOON = "unl-125-219";
const FIZZ = "sfd-140-221";

/**
 * P1's turn with 5 energy + 2 chaos (Fizz 3+[chaos], Heedless 2+[chaos]; Lunar Boon's Energy is ignored, no Power).
 * P1: Victim (2-cost) in base to kill, Corpse (2-cost) + Lunar Boon in trash, Fizz + Heedless in hand, known top cards d1, d2.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { chaos: 2 } })
    .unit(P1, "base", { energyCost: 2, might: 2, name: "Victim" }, "victim")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .trash(P1, { energyCost: 2, might: 2, name: "Corpse" }, "corpse")
    .trash(P1, LUNAR_BOON, "boon")
    .hand(P1, FIZZ, "fizz")
    .hand(P1, HEEDLESS, "hr")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Play Fizz, opt in (Lunar Boon is the only ≤3 spell), let the trigger resolve → Lunar Boon is on the chain; P1 has priority. */
async function fizzPlaysBoon(game: Game): Promise<void> {
  await game.p1.play("fizz");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("boon");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["fizz"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Fizz's trigger resolves: Lunar Boon is played from the trash
  expect(game.chain().map((c) => c.cardId)).toEqual(["boon"]);
  expect(game.zoneOf("boon")).toBe("chain");
  expect(game.p1.hand()).toEqual(["hr"]); // Heedless is the only card in hand
  expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } }); // Boon's 3 Energy ignored
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling 98b6e24391f9590f — Heedless Resurrection chained onto a Fizz-played Lunar Boon still nets the 2 draws", () => {
  test("with Lunar Boon on the chain (Closed state) Heedless Resurrection — a Reaction — is legal; casting it kills Victim up front and stacks it on top", async () => {
    const game = await board().build();
    await fizzPlaysBoon(game);
    expect(game.p1.can("cast", "hr")).toBe(true);
    expect(game.p1.option("cast", "hr")?.fields.find((f) => f.arg === "sacrifice")?.options).toEqual(expect.arrayContaining(["victim"]));
    await game.p1.cast("hr", { sacrifice: "victim" });
    expect(game.zoneOf("victim")).toBe("trash"); // additional cost paid now
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["boon", "hr"]);
    expect(game.p1.hand()).toEqual([]); // hand now empty
  });

  test("LIFO: Heedless resolves first (Corpse returns from the trash) while Lunar Boon still waits", async () => {
    const game = await board().build();
    await fizzPlaysBoon(game);
    await game.p1.cast("hr", { sacrifice: "victim" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Heedless resolves
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("corpse");
    }
    expect(game.zoneOf("corpse")).toBe("base");
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["boon"]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("Lunar Boon then resolves on an EMPTY hand: discard 0 (an effect, not a cost), draw 2 — P1 holds d1 + d2; Boon is recycled per Fizz", async () => {
    const game = await board().build();
    await fizzPlaysBoon(game);
    await game.p1.cast("hr", { sacrifice: "victim" });
    game.script(P1, ["corpse"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.zoneOf("boon")).toBe("mainDeck"); // recycled, not trashed
    expect(game.zoneOf("corpse")).toBe("base");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
