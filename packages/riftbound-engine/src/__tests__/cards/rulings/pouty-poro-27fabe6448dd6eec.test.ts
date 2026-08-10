/**
 * Ruling 27fabe6448dd6eec — Pouty Poro (OGN-013 → ogn-013-298) · 2 Might · Deflect
 *   × Sacred Shears (SFD-172 → sfd-172-221) · Equipment · +1 · Effect text "[Deathknell] — Draw 1."
 *   × Baited Hook (OGN-242 → ogn-242-298) · Gear · "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of
 *     your Main Deck. You may banish a unit … and play it, ignoring its cost. Then recycle the rest."
 *   × Altar of Memories (SFD-169 → sfd-169-221) · Gear · "When a friendly unit dies, you may exhaust me to draw 1, then put a
 *     card from your hand on the top or bottom of your Main Deck."
 *
 * Q: Hook kills the Shears-equipped Poro. Can I "respond" to the Deathknell with Altar of Memories before Hook finishes?
 * A: No. Baited Hook resolves completely (kill, look at 5, optional play, recycle) before any triggered ability can
 *    resolve. The death produces two triggers — Deathknell (Shears) and Altar — that go on the chain together with Altar
 *    on top; Altar resolves first (exhaust, draw, put a card on top/bottom), then Deathknell draws — so Altar CAN set up
 *    the Shears draw. Altar is a trigger, not an activated ability.
 * Rules: 359 (an item resolves entirely), 383.2.c (triggers created mid-resolution wait on the chain), 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const POUTY_PORO = "ogn-013-298";
const SACRED_SHEARS = "sfd-172-221";
const BAITED_HOOK = "ogn-242-298";
const ALTAR_OF_MEMORIES = "sfd-169-221";
const SKULKER = "ogn-175-298";
const DECK_TWO = { cardType: "unit", energyCost: 2, might: 2, name: "Deck Two" } as const; // Hook's legal replay (≤ Poro's Might + 1)
const DECK_FIVE = { cardType: "unit", energyCost: 5, might: 5, name: "Deck Five" } as const; // too big for Hook

/**
 * P1's turn. Poro in base; Sacred Shears, Baited Hook and Altar of Memories in base (all ready). P1 has [1] + [order][order]:
 * one [order] to Equip the Shears onto the Poro, then [1][order] for the Hook. Hand: one known card ("keep"). Deck (top→):
 * Deck Two, 4× Deck Five, then two Skulkers (d6, d7).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 2 } })
    .unit(P1, "base", POUTY_PORO, "poro")
    .gear(P1, SACRED_SHEARS, "shears")
    .gear(P1, BAITED_HOOK, "hook")
    .gear(P1, ALTAR_OF_MEMORIES, "altar")
    .hand(P1, SKULKER, "keep")
    .deck(P1, [DECK_TWO, DECK_FIVE, DECK_FIVE, DECK_FIVE, DECK_FIVE, SKULKER, SKULKER], ["two", "f1", "f2", "f3", "f4", "d6", "d7"]);
}

const isHookLook = (d: Decision | null) => d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "hook" && d.semantics === "from-revealed";

/** Equip the Shears on the Poro, activate Hook (Poro is the only friendly unit), both pass → Hook starts resolving; stop at its look-at-5 prompt. */
async function hookKillsPoroUpToLook(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("activate", "altar")).toBe(false); // Altar has no activated ability
  await game.p1.do("equipCard", { equipmentId: "shears", unitId: "poro" });
  await game.settle();
  expect(game.state("shears").attachedTo).toBe("poro");
  expect(game.state("poro").might).toBe(3);
  expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } });
  await game.p1.activate("hook");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.state("hook").isExhausted).toBe(true);
  for (let i = 0; i < 6 && !isHookLook(game.decision()); i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "poro")) {
      await game.p1.pick("poro");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(isHookLook(game.decision())).toBe(true);
  return game;
}

/** From Hook's look prompt: play Deck Two (to base), then handle Altar's opt-in (yes) and put Altar on TOP of the trigger order. */
async function finishHookThenOrderAltarOnTop(game: Game): Promise<void> {
  await game.p1.pick("two");
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "destination" && d.source?.cardId === "two") {
      await game.p1.pick("base");
    } else if (d?.kind === "yes-no" && d.source?.cardId === "altar") {
      expect(d.seat).toBe(P1);
      await game.p1.yes();
    } else if (d?.kind === "order") {
      expect(d.seat).toBe(P1);
      const altarKey = d.items.find((it) => /altar/i.test(it.label))?.key as string;
      const knellKey = d.items.find((it) => !/altar/i.test(it.label))?.key as string;
      expect(altarKey).toBeDefined();
      expect(knellKey).toBeDefined();
      await game.p1.order([knellKey, altarKey]); // first = bottom, last = top → Altar resolves first
    } else if (d?.kind === "action" && d.context === "chain" && game.chain().some((c) => c.cardId === "two")) {
      await game.seat(d.seat).passPriority(); // let the replayed unit settle in, if it sits on the chain
    } else {
      break;
    }
  }
}

describe("Ruling 27fabe6448dd6eec — Baited Hook fully resolves before the Poro's death triggers (Altar, Shears' Deathknell) can", () => {
  test("mid-resolution of Hook (its look-at-5 prompt is up): the Poro has ALREADY been killed as part of the effect, yet neither death trigger has resolved — Altar still ready, nothing drawn — and the only thing being asked is Hook's own pick", async () => {
    const game = await hookKillsPoroUpToLook();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("altar").isExhausted).toBe(false);
    expect(game.p1.hand()).toEqual(["keep"]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "hook" } });
    expect((game.decision() as Extract<Decision, { kind: "pick" }>).options.map((o) => o.key)).toEqual(["two"]); // only the ≤3+1 unit
    // The two death triggers are waiting on the chain behind the resolving Hook — not resolving, not answerable yet.
    const waiting = game.chain().filter((c) => c.triggered).map((c) => c.cardId).sort();
    expect(waiting).toEqual(["altar", "poro"]);
  });

  test("Hook completes first: Deck Two is played (free) and the other four looked-at cards are recycled — still before Altar exhausts or anyone draws", async () => {
    const game = await hookKillsPoroUpToLook();
    await game.p1.pick("two");
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "destination") {
      await game.p1.pick("base");
    }
    expect(game.zoneOf("two")).not.toBe("mainDeck"); // banished-and-being-played (lands in base — see the last test)
    expect(game.p1.deck().slice(0, 2)).toEqual(["d6", "d7"]); // f1..f4 went to the bottom
    expect(game.p1.deck().slice(-4).sort()).toEqual(["f1", "f2", "f3", "f4"]);
    expect(game.p1.hand()).toEqual(["keep"]);
    expect(game.state("altar").isExhausted).toBe(false);
    expect(game.p1.energy()).toBe(0);
  });

  test("then BOTH death triggers are on the chain under P1's control; P1 is offered their order and puts Altar on top", async () => {
    const game = await hookKillsPoroUpToLook();
    let sawOrder = false;
    await game.p1.pick("two");
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.semantics === "destination") {
        await game.p1.pick("base");
      } else if (d?.kind === "yes-no" && d.source?.cardId === "altar") {
        await game.p1.yes();
      } else if (d?.kind === "order") {
        sawOrder = true;
        expect(d.seat).toBe(P1);
        expect(d.items.map((it) => it.label).join(" | ")).toMatch(/altar/i);
        expect(d.items).toHaveLength(2);
        break;
      } else if (d?.kind === "action" && d.context === "chain" && game.chain().some((c) => c.cardId === "two")) {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(sawOrder).toBe(true);
  });

  test("Altar resolves first (exhaust → draw d6 → put 'keep' on TOP), then the Shears' Deathknell draws exactly that card — Altar set up the Shears draw; end: hand = d6 + keep, Altar exhausted, Shears back in base unattached", async () => {
    const game = await hookKillsPoroUpToLook();
    await finishHookThenOrderAltarOnTop(game);
    // Altar is now the top item.
    expect(game.chain().at(-1)).toMatchObject({ cardId: "altar", triggered: true });
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.source?.cardId === "altar") {
        // "put a card from your hand on the top or bottom": choose 'keep' …
        expect(d.seat).toBe(P1);
        expect(game.p1.hand().sort()).toEqual(["d6", "keep"]); // Altar's draw 1 already happened (d6)
        await game.p1.pick("keep");
      } else if (d.kind === "pick" && d.semantics === "destination" && d.source?.cardId === "keep") {
        expect(d.options.map((o) => o.key).sort()).toEqual(["mainDeck-bottom", "mainDeck-top"]);
        await game.p1.pick("mainDeck-top"); // … on TOP
        expect(game.p1.deck()[0]).toBe("keep");
      } else if (d.kind === "yes-no") {
        await game.p1.yes();
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    // Deathknell drew the card Altar placed on top.
    expect(game.p1.hand().sort()).toEqual(["d6", "keep"]);
    expect(game.p1.deck()[0]).toBe("d7");
    expect(game.state("altar").isExhausted).toBe(true);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("shears")).toBe("base");
    expect(game.state("shears").attachedTo).toBeUndefined();
    expect(game.zoneOf("two")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
