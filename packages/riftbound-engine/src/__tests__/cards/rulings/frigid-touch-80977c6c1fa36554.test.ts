/**
 * Ruling 80977c6c1fa36554 — Frigid Touch (SFD-066 → sfd-066-221) · Reaction · [2] "[Repeat][2] Give a unit -2 [Might] this turn."
 *   × Fizz, Trickster (SFD-140 → sfd-140-221) · [3][chaos] · 3 Might "When you play me, you may play a spell from your trash with
 *     Energy cost no more than [3], ignoring its Energy cost. Recycle that spell after you play it."
 *
 * Q: How does Fizz resolve if I want to target Frigid Touch in my trash — walk the chain.
 * A: Play Fizz → he enters the board (356.2) → his WYPM trigger goes on the chain and the trash spell is chosen NOW, as the
 *    trigger is put on the chain (a valid one must exist then) → on resolution you PLAY that spell from trash (paying any
 *    non-energy costs) → after the spell resolves it is recycled to the bottom of your deck.
 * Rules: 356.2 (unit finalizes and leaves the chain), 383 / 355 (trigger on chain, choice made on finalization), Fizz text (recycle after).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const FRIGID_TOUCH = "sfd-066-221";
const PRIMAL_STRENGTH = "ogn-154-298"; // [4] spell in trash — over Fizz's [3] limit, must not be offered
const DISCIPLINE = "ogn-058-298"; // [2] — a second eligible spell so the choice is a real prompt

const chainView = (game: Game) => game.chain().map((c) => ({ id: c.cardId, targets: c.targets, trig: c.triggered }));

/** P1's turn: exactly [3][chaos] for Fizz (nothing left for Frigid Touch's [2] — proving the energy cost is ignored). P2's Brute (5) at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .hand(P1, FIZZ, "fizz")
    .trash(P1, FRIGID_TOUCH, "ft")
    .trash(P1, DISCIPLINE, "disc")
    .trash(P1, PRIMAL_STRENGTH, "primal");
}

/** Play Fizz and accept the "you may"; return the trash-spell choice prompt. */
async function fizzToTrashChoice(): Promise<{ game: Game; pick: Extract<Decision, { kind: "pick" }> }> {
  const game = await board().build();
  await game.p1.play("fizz");
  // 1–2. Fizz is already a game object on the board — never lingering on the chain as a unit.
  expect(game.zoneOf("fizz")).toBe("base");
  expect(game.p1.energy()).toBe(0);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" } });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return { game, pick: d as Extract<Decision, { kind: "pick" }> };
}

/** …choose Frigid Touch; the trigger is now on the chain naming it. */
async function triggerNamingFrigidTouch(): Promise<Game> {
  const { game } = await fizzToTrashChoice();
  await game.p1.pick("ft");
  return game;
}

describe("Ruling 80977c6c1fa36554 — Fizz → Frigid Touch from trash: choose on the chain, play on resolution, recycle after", () => {
  test("3–4. targeting happens as the WYPM trigger is put on the chain: P1 is asked for the trash spell BEFORE anyone has priority; only ≤[3] spells are offered (Frigid Touch yes, Primal Strength [4] no)", async () => {
    const { pick } = await fizzToTrashChoice();
    const offered = pick.options.map((o) => o.card ?? o.key).toSorted();
    expect(offered).toEqual(["disc", "ft"]);
    expect(offered).not.toContain("primal");
  });

  test("the finalized trigger sits on the chain naming Frigid Touch, which is STILL in the trash (not yet played); now priority opens", async () => {
    const game = await triggerNamingFrigidTouch();
    expect(chainView(game)).toEqual([{ id: "fizz", targets: ["ft"], trig: true }]);
    expect(game.zoneOf("ft")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("5. on resolution Frigid Touch is PLAYED from trash for no energy (P1 has 0): it becomes a real spell on the chain aimed at the Brute", async () => {
    const game = await triggerNamingFrigidTouch();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Fizz's trigger resolves
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "brute") ? "brute" : (d.options[0]!.key as string));
      } else if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no(); // no Repeat (couldn't pay [2] anyway)
      } else if (d?.kind === "integer" && d.seat === P1) {
        await game.p1.chooseX(0);
      } else {
        break;
      }
    }
    expect(game.zoneOf("ft")).toBe("chain");
    expect(chainView(game)).toEqual([{ id: "ft", targets: ["brute"], trig: false }]);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("brute").might).toBe(5); // the spell itself hasn't resolved yet
  });

  test("Frigid Touch resolves (Brute 5 → 3 this turn) and is then RECYCLED to the bottom of P1's deck — not back to the trash", async () => {
    const game = await triggerNamingFrigidTouch();
    game.script(P1, [(d) => (d.kind === "pick" ? "brute" : d.kind === "yes-no" ? "no" : undefined)]);
    await game.settle();
    for (let i = 0; i < 3 && game.decision()?.kind !== "action"; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.p1.pick("brute");
      } else if (d?.kind === "yes-no") {
        await game.p1.no();
      }
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("brute")).toMatchObject({ might: 3, mightModifier: -2 });
    expect(game.zoneOf("ft")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("ft");
    expect(game.p1.trash()).not.toContain("ft");
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("a valid target must exist when the trigger goes on the chain: with NO eligible spell in the trash the 'you may' cannot pick anything and nothing is played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
      .hand(P1, FIZZ, "fizz")
      .trash(P1, PRIMAL_STRENGTH, "primal")
      .build();
    await game.p1.play("fizz");
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      // Either "yes" is not acceptable, or accepting finds nothing to choose.
      if (d.canAccept === false) {
        await game.p1.no();
      } else {
        await game.p1.yes();
        const p = game.decision();
        expect(p?.kind === "pick" ? p.options.map((o) => o.card ?? o.key) : []).not.toContain("primal");
        if (p?.kind === "pick") {
          await game.p1.decline();
        }
      }
    }
    await game.settle();
    expect(game.zoneOf("primal")).toBe("trash");
    expect(game.state("brute").might).toBe(5);
    expect(game.chain()).toEqual([]);
  });
});
