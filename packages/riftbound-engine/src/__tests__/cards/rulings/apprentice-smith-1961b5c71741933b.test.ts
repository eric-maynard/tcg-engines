/**
 * Ruling 1961b5c71741933b — Apprentice Smith (SFD-041 → sfd-041-221) · Unit · Calm · [2] · 2 Might
 *     "When I move, reveal the top card of your Main Deck. If it's a gear, draw it. Otherwise, recycle it."
 *   × Nocturne, Horrifying (OGN-194 → ogn-194-298) · Champion Unit · Chaos · [4][chaos] · 4 Might · Ganking
 *     "As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me for [rainbow]."
 *
 * Q: Does REVEALING a card with Apprentice Smith count for triggering Nocturne?
 * A: Yes. After Nocturne's errata both "look" and "reveal" work; Smith's reveal of Nocturne from the top of the
 *    deck lets you banish him and then play him for [rainbow].
 * Rules: 424.1 (reveal), 369.1/370.1 ("as you …" on the reveal event), Nocturne errata (look OR reveal).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const APPRENTICE_SMITH = "sfd-041-221";
const NOCTURNE = "ogn-194-298";
const SKULKER = "ogn-175-298";

/** P1's turn. Smith ready in base; bf1 empty & uncontrolled; Nocturne on top of P1's deck; P1 has exactly one [rainbow]. */
function board() {
  return scenario()
    .resources(P1, { energy: 0, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", APPRENTICE_SMITH, "smith")
    .deck(P1, [NOCTURNE, SKULKER, SKULKER], ["noc", "second", "third"]);
}

function isNocturneOffer(d: Decision | null): boolean {
  if (!d || d.seat !== P1) {
    return false;
  }
  if (d.kind === "yes-no") {
    return d.source?.cardId === "noc" || /nocturne|banish/i.test(`${d.prompt} ${d.consequence ?? ""}`);
  }
  if (d.kind === "pick") {
    return /banish/i.test(d.prompt) && d.options.some((o) => (o.card ?? o.key) === "noc");
  }
  return false;
}

/** Move Smith to bf1 and step (passing priority / accepting trigger order) until a Nocturne offer or an open state. */
async function moveSmithUntilOffer(game: Game): Promise<Decision | null> {
  await game.p1.move("smith", "bf1");
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || isNocturneOffer(d)) {
      return d;
    }
    if (d.kind === "action" && (d.context === "main")) {
      return d;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      return d;
    }
  }
  return game.decision();
}

/** Accept every Nocturne-related optional prompt (banish → play → pay/destination) until none remains. */
async function acceptNocturne(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1) {
      return;
    }
    if (d.kind === "yes-no") {
      await game.p1.yes();
    } else if (d.kind === "pick" && d.semantics === "destination") {
      await game.p1.pick(d.options.some((o) => o.key === "base") ? "base" : (d.options[0]?.key as string));
    } else if (d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "noc")) {
      await game.p1.pick("noc");
    } else if (d.kind === "action" && d.passKey && d.context !== "main") {
      await game.p1.pass();
    } else {
      return;
    }
  }
}

describe("Ruling 1961b5c71741933b — Apprentice Smith's REVEAL of Nocturne from the top of the deck triggers Nocturne", () => {
  // Expected: Smith's "reveal the top card" reveals Nocturne from the top of the deck, which is exactly Nocturne's
  // "as you … reveal me" event → P1 is offered "you may banish me". Actual: the engine reveals and immediately
  // recycles Nocturne (Smith's non-gear branch) without ever raising Nocturne's replacement/offer.
  test("ruling 1961b5c71741933b — Smith's reveal of Nocturne raises no banish offer (engine recycles it silently); expected P1 to be offered 'you may banish me'", async () => {
    const game = await board().build();
    expect(game.p1.deck()[0]).toBe("noc");
    const d = await moveSmithUntilOffer(game);
    expect(game.locationOf("smith")).toBe("bf1");
    expect(isNocturneOffer(d)).toBe(true);
    expect(d?.seat).toBe(P1);
    // Nothing has happened to Nocturne yet — it is P1's option.
    expect(game.p1.units()).not.toContain("noc");
    expect(game.p1.power("rainbow")).toBe(1);
  });

  // Same gap: with no offer there is nothing to accept, so Nocturne never reaches the board.
  test("ruling 1961b5c71741933b — accepting the offer should banish Nocturne and play him for [rainbow] (engine: no offer, Nocturne recycled)", async () => {
    const game = await board().build();
    const d = await moveSmithUntilOffer(game);
    expect(isNocturneOffer(d)).toBe(true);
    await acceptNocturne(game);
    await game.settle();
    await acceptNocturne(game);
    await game.settle();
    expect(game.p1.units()).toContain("noc");
    expect(["base", "bf1"]).toContain(game.locationOf("noc") as string);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.p1.hand()).not.toContain("noc"); // not "drawn" (not a gear anyway)
    expect(game.p1.deck()).not.toContain("noc"); // not recycled
    expect(game.state("noc")).toMatchObject({ controller: P1, might: 4 });
  });

  test("declining the banish (the option is a 'may'): Smith's own instruction applies — Nocturne is not a gear, so it is recycled to the bottom of the deck, nothing drawn, [rainbow] kept", async () => {
    const game = await board().build();
    const d = await moveSmithUntilOffer(game);
    if (isNocturneOffer(d)) {
      if (d?.kind === "yes-no") {
        await game.p1.no();
      } else {
        await game.p1.decline();
      }
    }
    await game.settle();
    expect(game.locationOf("smith")).toBe("bf1");
    expect(game.zoneOf("noc")).toBe("mainDeck");
    expect(game.p1.deck()[0]).toBe("second");
    expect(game.p1.deck().at(-1)).toBe("noc");
    expect(game.p1.hand()).not.toContain("noc");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
