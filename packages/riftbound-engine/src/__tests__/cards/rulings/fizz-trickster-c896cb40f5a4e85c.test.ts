/**
 * Ruling c896cb40f5a4e85c — Fizz, Trickster (sfd-140-221) × Disposal Order (unl-103-219)
 *   Fizz — Unit · Chaos · [3] · 3 Might: "When you play me, you may play a spell from your trash with Energy cost no
 *   more than [3], ignoring its Energy cost. Recycle that spell after you play it."
 *   Disposal Order — [Reaction] · [2]: "Choose one — Choose up to 3 cards from opponents' trashes. Their owners recycle
 *   them. / Draw 1."   (Hextech Ray ogn-009-298 and Cleave ogn-004-298 are the ≤[3] spells in the Fizz player's trash.)
 *
 * Q: Opponent plays Fizz — when do I respond with Disposal Order, and can they then pick another spell?
 * A: Respond when Fizz's "When you play me" trigger goes on the chain — that is when the trash spell is declared
 *    (a locked target). Disposal Order resolves first; ITS controller picks the cards; the named spell is recycled, so
 *    Fizz's trigger finds no valid target and plays nothing (359.3.e.7). No swapping to a different spell.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const DISPOSAL_ORDER = "unl-103-219";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury] Deal 3 to a unit at a battlefield
const CLEAVE = "ogn-004-298"; // [1] fury spell — a second legal ≤[3] spell in the trash

/** P1's turn. P1: Fizz in hand, Ray + Cleave in trash, [3] + chaos (Fizz) + fury (the Ray's power). P2: Wall at bf1, Disposal Order + exactly [2]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .hand(P1, FIZZ, "fizz")
    .trash(P1, HEXTECH_RAY, "ray")
    .trash(P1, CLEAVE, "cleave")
    .resources(P1, { energy: 3, power: { chaos: 1, fury: 1 } })
    .hand(P2, DISPOSAL_ORDER, "disposal")
    .resources(P2, { energy: 2 });
}

/** P1 plays Fizz, accepts the trigger and names the Ray; stop once the trigger (target locked) is on the chain. */
async function fizzNamesRay(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("fizz");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" } });
  await game.p1.yes();
  // The spell is CHOSEN NOW, as the trigger goes on the chain (public-zone target, 355.5.b).
  const d: Decision | null = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
  expect(offered).toContain("ray");
  expect(offered).toContain("cleave");
  await game.p1.pick("ray");
  for (let i = 0; i < 3; i++) {
    const next: Decision | null = game.decision();
    if (next?.kind === "pick" && next.seat === P1) {
      const o = next.options.find((x) => (x.card ?? x.key) === "wall") ?? next.options[0]!;
      await game.p1.pick(o.card ?? o.key);
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", controller: P1, targets: ["ray"], triggered: true })]);
  expect(game.zoneOf("fizz")).toBe("base");
  return game;
}

describe("Ruling c896cb40f5a4e85c — Disposal Order answers Fizz's trigger; the recycled spell can't be played or swapped", () => {
  test("control: unanswered, Fizz's trigger plays the Ray from trash (free of energy), it hits the Wall for 3 and is then recycled", async () => {
    const game = await fizzNamesRay();
    for (let i = 0; i < 10 && (game.chain().length > 0 || game.decision()?.kind !== "action"); i++) {
      const d: Decision | null = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        const o = d.options.find((x) => (x.card ?? x.key) === "wall") ?? d.options[0]!;
        await game.p1.pick(o.card ?? o.key);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("ray")).toBe("mainDeck");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } }); // Fizz [3][chaos]; Ray's [fury] still paid
  });

  test("the response window: with Fizz's trigger (Ray named) on the chain, P1 passes and P2 — in Closed state — may cast the [Reaction] Disposal Order choosing the Ray from P1's trash", async () => {
    const game = await fizzNamesRay();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disposal")).toBe(true);
    await game.p2.cast("disposal", { mode: 0, targets: ["ray"] }); // P2 (its controller) picks — just the Ray
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fizz", "disposal"]);
  });

  test("LIFO: Disposal Order recycles the Ray to the bottom of P1's deck; Fizz's trigger then has no valid target — nothing is played, the Wall is unhurt, Cleave is NOT swapped in, P1's fury is unspent", async () => {
    const game = await fizzNamesRay();
    await game.p1.passPriority();
    await game.p2.cast("disposal", { mode: 0, targets: ["ray"] });
    for (let i = 0; i < 12 && game.chain().length > 0; i++) {
      const d: Decision | null = game.decision();
      // P1 must never be offered a replacement spell for the locked target.
      expect(d?.kind === "pick" && d.seat === P1).toBe(false);
      if (d?.kind === "action" && d.passKey) {
        await game.acting().pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("disposal")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("ray");
    expect(game.zoneOf("cleave")).toBe("trash"); // untouched, not played instead
    expect(game.state("wall").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 1 } }); // only Fizz's [3] spent
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
