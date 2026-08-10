/**
 * Ruling c261ef7de7154ab0 — Disposal Order (UNL-103 → unl-103-219) Reaction [2] "Choose one — Choose up to 3 cards from opponents'
 *   trashes. Their owners recycle them. / Draw 1." × Fizz, Trickster (SFD-140 → sfd-140-221) [3][chaos] "When you play me, you may
 *   play a spell from your trash with Energy cost no more than [3], ignoring its Energy cost. Recycle that spell after you play it."
 *
 * Q: Can I play Disposal Order in response to Fizz to recycle the spell they were targeting?
 * A: Yes. Fizz enters, his trigger goes on the chain with the trash spell already named; you respond with Disposal Order and recycle
 *    that spell; when Fizz's trigger resolves its target is gone from the trash, so the play instruction is ignored — the spell is
 *    not played at all (they don't get to switch to another).
 * Rules: 383 / 355.5 (trigger choices made as it is put on the chain), 359.3.e.7 (unavailable target ⇒ ignored), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISPOSAL_ORDER = "unl-103-219";
const FIZZ = "sfd-140-221";
const CLEAVE = "ogn-004-298"; // [1] "Give a unit [Assault 3] this turn." — the spell Fizz names
const DISCIPLINE = "ogn-058-298"; // [2] Reaction — another ≤3 spell left in the trash (must NOT be swapped in)

/** P2's turn (the Fizz player) with exactly [3][chaos]; P2's trash: Cleave + Discipline; P2's Pal at bf1. P1 (me): Disposal Order + [2]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Pal" }, "pal")
    .trash(P2, CLEAVE, "cleave")
    .trash(P2, DISCIPLINE, "discipline")
    .hand(P2, FIZZ, "fizz")
    .hand(P1, DISPOSAL_ORDER, "disposal");
}

const isTrashSpellPick = (d: Decision | null) =>
  d?.kind === "pick" && d.seat === P2 && d.options.some((o) => o.card === "cleave" || o.card === "discipline");

/** P2 plays Fizz, opts in and names Cleave; P2 passes priority → my (P1's) response window. */
async function fizzNamesCleave(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("fizz", { to: "base" });
  expect(game.zoneOf("fizz")).toBe("base"); // Fizz himself is already on the board
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", controller: P2, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
  await game.p2.yes();
  expect(isTrashSpellPick(game.decision())).toBe(true); // named NOW, as the trigger is put on the chain
  await game.p2.pick("cleave");
  expect(game.chain()[0]).toMatchObject({ cardId: "fizz", targets: ["cleave"] });
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling c261ef7de7154ab0 — Disposal Order in response to Fizz recycles the named spell and blanks his trigger", () => {
  test("with Fizz's trigger (naming Cleave) on the chain, Disposal Order is a legal Reaction for me and offers the cards in P2's trash; I recycle Cleave", async () => {
    const game = await fizzNamesCleave();
    expect(game.p1.can("cast", "disposal")).toBe(true);
    const targets = game.p1.option("cast", "disposal")?.fields.find((f) => f.name === "targets");
    const offered = new Set((targets?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : []) as string[]));
    expect([...offered].sort()).toEqual(["cleave", "discipline"]);
    await game.p1.cast("disposal", { mode: 0, targets: ["cleave"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fizz", "disposal"]);
    expect(game.p1.energy()).toBe(0);
  });

  test("Disposal Order resolves first: Cleave is recycled into P2's deck while Fizz's trigger still waits", async () => {
    const game = await fizzNamesCleave();
    await game.p1.cast("disposal", { mode: 0, targets: ["cleave"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("disposal")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("mainDeck");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fizz"]);
  });

  test("Fizz's trigger then resolves with its target unavailable: NOTHING is played (no re-pick offered, Discipline untouched in the trash, Pal gets no Assault); P2's turn continues", async () => {
    const game = await fizzNamesCleave();
    await game.p1.cast("disposal", { mode: 0, targets: ["cleave"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Disposal Order
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(isTrashSpellPick(d)).toBe(false);
      expect(d?.kind).toBe("action");
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("mainDeck");
    expect(game.state("pal").grantedKeywords).toEqual([]);
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, Fizz DOES play Cleave from the trash for free (Pal gains Assault 3) and Cleave is recycled afterwards", async () => {
    const game = await fizzNamesCleave();
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.seat === P2) {
        await game.p2.pick(d.options.some((o) => (o.card ?? o.key) === "pal") ? "pal" : (d.options[0]?.key as string));
      } else {
        break;
      }
    }
    expect(game.state("pal").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.zoneOf("cleave")).toBe("mainDeck");
  });
});
