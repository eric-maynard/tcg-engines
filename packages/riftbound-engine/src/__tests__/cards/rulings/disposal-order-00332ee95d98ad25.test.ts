/**
 * Ruling 00332ee95d98ad25 — Disposal Order (UNL-103 → unl-103-219) · Reaction · Body · [2]
 *     "Choose one — Choose up to 3 cards from opponents' trashes. Their owners recycle them. / Draw 1."
 *   × Fizz, Trickster (SFD-140 → sfd-140-221) · Unit · Chaos · [3]+[chaos] · 3 Might
 *     "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its
 *      Energy cost. Recycle that spell after you play it."
 *
 * Q: Can an opponent Disposal Order my trash before I choose what to play from it with Fizz?
 * A: They can't make you choose "blind" first — you name the trash spell AS Fizz's trigger goes on the chain, so
 *    the choice is locked in before they get a window. But responding to the trigger with Disposal Order to
 *    recycle the named spell makes Fizz's ability do nothing (no valid target ⇒ the play instruction is ignored;
 *    you don't get to switch). Casting it earlier, while Fizz himself is pending, is legal but a guess.
 * Rules: 383/355.5 (a triggered ability's choices are made as it is put on the chain), 359.3.e.7 (invalid target ⇒
 *        instruction ignored), 340 (Reaction window before the trigger resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISPOSAL_ORDER = "unl-103-219";
const FIZZ = "sfd-140-221";
const CLEAVE = "ogn-004-298"; // [1] Action spell — a legal Fizz pick (≤3)
const DISCIPLINE = "ogn-058-298"; // [2] Reaction spell — the other legal Fizz pick

/**
 * P1's turn with exactly [3]+[chaos] for Fizz. P1's trash: Cleave and Discipline. P1's 2-Might Pal at bf1 (a Cleave
 * target). P2 holds Disposal Order with exactly [2].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
    .trash(P1, CLEAVE, "cleave")
    .trash(P1, DISCIPLINE, "discipline")
    .hand(P1, FIZZ, "fizz")
    .hand(P2, DISPOSAL_ORDER, "disposal");
}

function isTrashSpellPick(d: Decision | null): boolean {
  return d?.kind === "pick" && d.seat === P1 && d.options.some((o) => o.card === "cleave" || o.card === "discipline");
}

/** P1 plays Fizz to base and opts into the trigger; if the engine asks which trash spell right away, name Cleave. */
async function fizzTriggerPending(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("fizz", { to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.zoneOf("fizz")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" } });
  await game.p1.yes();
  if (isTrashSpellPick(game.decision())) {
    await game.p1.pick("cleave");
  }
  return game;
}

describe("Ruling 00332ee95d98ad25 — Disposal Order vs Fizz's play-from-trash trigger", () => {
  test("control: unanswered, Fizz plays Cleave from trash ignoring its Energy cost (P1 has 0 energy left), and Cleave is RECYCLED afterwards instead of trashed", async () => {
    const game = await fizzTriggerPending();
    // Drain: pass priority; answer P1's picks (spell → Cleave, Cleave's target → Pal).
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (isTrashSpellPick(d)) {
        await game.p1.pick("cleave");
      } else if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick("pal");
      } else {
        throw new Error(`unexpected prompt: ${d.kind} for ${d.seat}: ${d.prompt}`);
      }
    }
    expect(game.state("pal").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.zoneOf("cleave")).toBe("mainDeck"); // "Recycle that spell after you play it"
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });

  // The trash spell is named as the trigger is put on the chain — right after opting in, and BEFORE any player
  // gets priority, P1 is asked to pick Cleave/Discipline (seat P1).
  test("ruling 00332ee95d98ad25 — the spell is chosen when Fizz's trigger goes on the chain, before P2's window", async () => {
    const game = await board().build();
    await game.p1.play("fizz", { to: "base" });
    await game.p1.yes();
    // The very next decision must be P1 naming the trash spell — not a priority pass.
    const d = game.decision();
    expect(isTrashSpellPick(d)).toBe(true);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("cleave");
    // Only now does anyone get priority, with the choice already public on the chain item.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.chain()[0]).toMatchObject({ cardId: "fizz", targets: ["cleave"] });
  });

  test("Disposal Order IS a legal Reaction while Fizz's trigger is pending, and it can name cards in P1's trash", async () => {
    const game = await fizzTriggerPending();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disposal")).toBe(true);
    const fields = game.p2.option("cast", "disposal")?.fields ?? [];
    expect(fields.find((f) => f.arg === "mode")?.labels).toEqual(["Recycle up to 3 from opponents' trashes", "Draw 1"]);
    const offered = new Set((fields.find((f) => f.name === "targets")?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : []) as string[]));
    expect([...offered].sort()).toEqual(["cleave", "discipline"]);
    await game.p2.cast("disposal", { mode: 0, targets: ["cleave"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fizz", "disposal"]);
  });

  // P1 named Cleave; P2 recycles exactly Cleave in response; when Fizz's trigger resolves its target is gone, so
  // "play that spell" is ignored (359.3.e.7) — NOTHING is played (Discipline stays in the trash untouched, Pal gets
  // no Assault) and P1 is never asked to pick a replacement.
  test("ruling 00332ee95d98ad25 — recycling the NAMED spell in response makes Fizz do nothing", async () => {
    const game = await fizzTriggerPending();
    await game.p1.passPriority();
    await game.p2.cast("disposal", { mode: 0, targets: ["cleave"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Disposal Order resolves: Cleave recycled
    expect(game.zoneOf("cleave")).toBe("mainDeck");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fizz"]);
    // Resolve Fizz's trigger: both pass; no pick may surface for P1.
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(isTrashSpellPick(d)).toBe(false);
      expect(d?.kind).toBe("action");
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("discipline")).toBe("trash"); // not played, not recycled
    expect(game.state("pal").grantedKeywords).toEqual([]);
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("practical upshot holds either way: if P2's Disposal Order recycles every ≤3 spell in P1's trash before the trigger resolves, Fizz's ability finds nothing and is simply ignored (359.3.e.7) — Fizz stays, nothing is played", async () => {
    const game = await fizzTriggerPending();
    await game.p1.passPriority();
    await game.p2.cast("disposal", { mode: 0, targets: ["cleave", "discipline"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Disposal Order resolves
    expect(game.zoneOf("disposal")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("mainDeck");
    expect(game.zoneOf("discipline")).toBe("mainDeck");
    expect(game.p1.trash()).toEqual([]);
    await game.settle(); // Fizz's trigger resolves with no legal spell
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.state("pal").grantedKeywords).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
