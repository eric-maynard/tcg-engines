/**
 * Ruling 183dfbe5ecb64f9f — Monastery of Hirana (OGN-282 → ogn-282-298) · Battlefield
 *   "When you conquer here, you may spend a buff to draw 1."
 *   × Sett, Brawler (OGN-164 → ogn-164-298) · 4 Might "When I'm played and when I conquer, buff me.
 *     (If I don't have a buff, I get a +1 [Might] buff.)"
 *
 * Q: Sett already has a buff and conquers the Monastery. Can I stack the triggers so the Monastery
 *    draws a card (spending his buff) and Sett's trigger then hands the buff back?
 * A: Yes. Both conquer triggers are simultaneous and their controller orders them; with the Monastery
 *    resolving first, P1 draws 1 off Sett's buff and Sett's trigger then re-buffs the now-unbuffed Sett.
 *    Nuances: Sett's trigger goes on the chain even while he is buffed — it simply does nothing if he
 *    still has a buff when it resolves; buffed units are legal recipients of buff effects.
 * Rules: 383.3.c/d (simultaneous triggers, controller orders), 340 (LIFO), 702.2.b (spending removes
 *        the buff), 702.3 (a unit never carries two buffs), 383.3.b + 204.3.a (a "you may [cost] to …"
 *        cost is paid at FINALIZATION).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MONASTERY = "ogn-282-298";
const SETT_BRAWLER = "ogn-164-298";

type OrderDecision = Extract<Decision, { kind: "order" }>;

/**
 * P1's turn. P2 holds the live Monastery with a 1-Might Sentry on it. Sett (4 printed) waits in P1's
 * base ALREADY BUFFED (5). `withPal` adds a second buffed unit so the Monastery can be paid without
 * touching Sett's buff. P1's deck is known so draws are countable.
 */
function board(withPal = false) {
  const s = scenario()
    .battlefield("mona", { controller: P2, def: MONASTERY, inert: false, owner: P2 })
    .unit(P2, "mona", { might: 1, name: "Sentry" }, "sentry")
    .unit(P1, "base", SETT_BRAWLER, "sett", { buffed: true })
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
  return withPal ? s.unit(P1, "base", { might: 2, name: "Pal" }, "pal", { buffed: true }) : s;
}

/** Sett attacks the Monastery and conquers it; accept the Monastery's opt-in; stop AT the order prompt. */
async function conquerToOrderPrompt(game: Game, payWith?: string): Promise<OrderDecision> {
  await game.p1.move("sett", "mona");
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.kind === "order") {
      break;
    }
    if (d.kind === "yes-no") {
      expect(d.seat).toBe(P1); // "you MAY spend a buff" is P1's call
      await game.p1.yes();
    } else if (d.kind === "pick" && payWith) {
      expect(d.prompt).toMatch(/spend the buff/i);
      await game.p1.pick(payWith);
    } else if (d.kind === "action") {
      await game.acting().pass();
    } else {
      break;
    }
  }
  expect(game.zoneOf("sentry")).toBe("trash");
  expect(game.p1.points()).toBe(1);
  const d = game.decision();
  expect(d).toMatchObject({ kind: "order", seat: P1 });
  return d as OrderDecision;
}

/** Put `topCard`'s trigger on top of the chain (= resolves first) and drain everything after it. */
async function resolveWithTop(game: Game, d: OrderDecision, topCard: string): Promise<void> {
  const top = d.items.find((it) => it.card === topCard)?.key as string;
  const rest = d.items.filter((it) => it.card !== topCard).map((it) => it.key);
  await game.p1.order([...rest, top]);
  for (let i = 0; i < 14; i++) {
    const cur = game.decision();
    if (!cur || (cur.kind === "action" && cur.context === "main")) {
      break;
    }
    if (cur.kind === "action") {
      await game.acting().pass();
    } else if (cur.kind === "yes-no") {
      await game.seat(cur.seat).yes();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling 183dfbe5ecb64f9f — Sett + Monastery of Hirana: both conquer triggers stack, P1 orders them, and Sett ends the turn buffed with a card drawn", () => {
  test("both conquer triggers hit the chain simultaneously and P1 is asked to ORDER them (383.3.d)", async () => {
    const game = await board().build();
    const d = await conquerToOrderPrompt(game);
    expect(d.items.map((it) => it.card).sort()).toEqual(["mona", "sett"]);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["mona", "sett"]);
    for (const item of game.chain()) {
      expect(item).toMatchObject({ controller: P1, triggered: true });
    }
  });

  test("the ruling's order — Monastery first: P1 draws 1 and Sett's trigger then re-buffs him (4 printed + buff = 5), one buff only (702.3)", async () => {
    const game = await board().build();
    const d = await conquerToOrderPrompt(game);
    await resolveWithTop(game, d, "mona");
    expect(game.p1.hand()).toEqual(["d1"]); // exactly one card drawn
    expect(game.state("sett")).toMatchObject({ isBuffed: true, location: "mona", might: 5 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 183dfbe5ecb64f9f describes the spend as happening WHEN the Monastery's trigger
  // resolves (so Sett-first would leave him unbuffed); CR 383.3.b + 204.3.a make "spend a buff to draw 1" the
  // trigger's base cost, paid while the item is FINALIZED — before either trigger resolves — engine follows CR.
  // The ruling's own answer (draw 1, Sett ends buffed) is what both orders produce here.
  test("Sett's buff is gone BEFORE the ordering is even asked — the spend is the trigger's finalization cost, not part of its resolution", async () => {
    const game = await board().build();
    await conquerToOrderPrompt(game);
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4 });
    expect(game.p1.hand()).toEqual([]); // nothing drawn yet — the Monastery's item has not resolved
  });

  test("consequence of that model: the reverse order (Sett's trigger first) reaches the SAME end state — 1 card drawn, Sett buffed at 5", async () => {
    const game = await board().build();
    const d = await conquerToOrderPrompt(game);
    await resolveWithTop(game, d, "sett");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
  });

  test("nuance: with a second buffed unit P1 chooses whose buff pays — picking Pal leaves Sett buffed, so Sett's trigger is still put on the chain and resolves as a NO-OP (still exactly one buff, still 5)", async () => {
    const game = await board(true).build();
    const d = await conquerToOrderPrompt(game, "pal");
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 }); // his buff was not the payment
    expect(game.state("pal").isBuffed).toBe(false);
    expect(d.items.map((it) => it.card).sort()).toEqual(["mona", "sett"]); // Sett's trigger is on the chain anyway
    await resolveWithTop(game, d, "mona");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 }); // no second buff stacked on
    expect(game.state("pal")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: a buffed unit is a legal recipient of a buff effect — resolving Sett's 'buff me' at him while he is buffed is allowed and simply does nothing", async () => {
    const game = await board(true).build();
    const d = await conquerToOrderPrompt(game, "pal");
    await resolveWithTop(game, d, "sett"); // Sett's own trigger resolves FIRST, on a still-buffed Sett
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.p1.hand()).toEqual(["d1"]);
  });
});
