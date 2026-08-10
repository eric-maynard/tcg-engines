/**
 * Ruling 0ea79e9706535992 — Hall of Legends (SFD-210 → sfd-210-221, Battlefield) "When you conquer here, you may pay [1] to ready your
 *     legend."
 *   × Void Burrower (sfd-187-221, Rek'Sai legend) "When you conquer, you may exhaust me to reveal the top 2 cards of your Main Deck. You may
 *     banish one, then play it. Recycle the rest."
 *
 * Q: On conquering, if both a legend/unit ability and the battlefield's ability trigger, which resolves first?
 * A: They trigger simultaneously and their controller CHOOSES the order. (Nuance given: "ready Rek'Sai first via the Hall, then use her
 *    ability, or vice versa" — see the RULING-CONFLICT note on the exhausted-legend reading.)
 * Rules: 383.3.d (simultaneous triggers: controller orders them on the chain), 340 (LIFO), 383.3.b / 383.3.b.1 (a leading "you may
 *        [cost] to" is the trigger's base cost, paid at finalization; unpayable ⇒ the trigger is not taken).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const HALL_OF_LEGENDS = "sfd-210-221";
const VOID_BURROWER = "sfd-187-221";

/** P1's turn, [3]. Void Burrower legend (ready unless stated); the live Hall is empty/uncontrolled; Runner (3) walks in. Known deck top. */
function board(legendExhausted = false) {
  return scenario()
    .resources(P1, { energy: 3 })
    .card("reksai", { def: VOID_BURROWER, meta: legendExhausted ? { exhausted: true } : undefined, owner: P1, zone: "legendZone" })
    .battlefield("hall", { controller: null, def: HALL_OF_LEGENDS, inert: false })
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 1, might: 1, name: "Top A" },
        { cardType: "unit", energyCost: 1, might: 1, name: "Top B" },
      ],
      ["topA", "topB"],
    );
}

type OrderDecision = Extract<Decision, { kind: "order" }>;

/** Runner takes the empty Hall (both pass focus) → conquer; stops at the trigger-order offer. */
async function conquerToOrderOffer(game: Game): Promise<OrderDecision> {
  await game.p1.move("runner", "hall");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.hall?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  const d = game.decision();
  expect(d).toMatchObject({ kind: "order", seat: P1 });
  return d as OrderDecision;
}

/** After ordering: accept both opt-ins, pass priority, decline the optional "play a revealed card". Returns the resolution order seen. */
async function playOut(game: Game): Promise<string[]> {
  const resolved: string[] = [];
  let last = game.chain().map((c) => c.cardId);
  for (let i = 0; i < 24; i++) {
    const now = game.chain().map((c) => c.cardId);
    for (const gone of last.filter((id) => !now.includes(id))) {
      resolved.push(gone);
    }
    last = now;
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "pick") {
      await (d.allowDecline ? game.seat(d.seat).decline() : game.seat(d.seat).pick(d.options[0]?.key as string));
    } else if (d.kind === "action") {
      await game.acting().pass();
    } else {
      break;
    }
  }
  return resolved;
}

describe("Ruling 0ea79e9706535992 — simultaneous conquer triggers (Hall of Legends + Void Burrower): the controller orders them", () => {
  test("conquering the Hall with the legend READY: BOTH abilities trigger together and P1 is offered their ORDER (an `order` decision for P1 listing hall + reksai) before anything resolves", async () => {
    const game = await board().build();
    const d = await conquerToOrderOffer(game);
    expect(d.items.map((it) => it.card).sort()).toEqual(["hall", "reksai"]);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["hall", "reksai"]);
    expect(game.state("reksai").isExhausted).toBe(false); // nothing paid/resolved yet
    expect(game.p1.energy()).toBe(3);
  });

  test("choice A — Rek'Sai's ability on top: it resolves FIRST (legend exhausted, top 2 revealed, play declined → recycled), THEN the Hall: [1] readies the legend again", async () => {
    const game = await board().build();
    const d = await conquerToOrderOffer(game);
    const hall = d.items.find((it) => it.card === "hall")?.key as string;
    const reksai = d.items.find((it) => it.card === "reksai")?.key as string;
    await game.p1.order([hall, reksai]); // first = bottom … last = top
    expect(game.chain().map((c) => c.cardId)).toEqual(["hall", "reksai"]);
    const resolved = await playOut(game);
    expect(resolved).toEqual(["reksai", "hall"]);
    expect(game.p1.energy()).toBe(2);
    expect(game.state("reksai").isExhausted).toBe(false);
    expect(game.p1.deck().slice(-2).sort()).toEqual(["topA", "topB"]);
    expect(game.violations()).toEqual([]);
  });

  test("choice B — the Hall on top ('ready first'): the Hall resolves FIRST and readies the legend (exhausted moments earlier to finalize Rek'Sai's trigger), THEN Rek'Sai's reveal resolves; same end state", async () => {
    const game = await board().build();
    const d = await conquerToOrderOffer(game);
    const hall = d.items.find((it) => it.card === "hall")?.key as string;
    const reksai = d.items.find((it) => it.card === "reksai")?.key as string;
    await game.p1.order([reksai, hall]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["reksai", "hall"]);
    const resolved = await playOut(game);
    expect(resolved).toEqual(["hall", "reksai"]);
    expect(game.p1.energy()).toBe(2);
    expect(game.state("reksai").isExhausted).toBe(false);
    expect(game.p1.deck().slice(-2).sort()).toEqual(["topA", "topB"]);
  });

  // RULING-CONFLICT: riftjudge 0ea79e9706535992's nuance can be read as "with Rek'Sai already EXHAUSTED, order the Hall first to ready her,
  // then use her ability off the same conquer". CR 383.3.b / 383.3.b.1 (the "exhaust me to" is the trigger's base cost, paid as the item is
  // FINALIZED — before any item resolves; unpayable ⇒ the trigger is not taken) — and riftjudge 907426e298be8e3e on this exact pair — say
  // no: an exhausted Void Burrower never makes it onto the chain, so there is nothing to order. Engine follows CR.
  test("legend already EXHAUSTED at the conquer: only the Hall triggers (no order offer, no Rek'Sai item); the Hall readies her afterwards but her ability does not fire off this conquer", async () => {
    const game = await board(true).build();
    await game.p1.move("runner", "hall");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.hall?.controller).toBe(P1);
    expect(game.decision()?.kind).not.toBe("order");
    expect(game.chain().map((c) => c.cardId)).toEqual(["hall"]);
    const deckBefore = [...game.p1.deck()];
    const resolved = await playOut(game);
    expect(resolved).toEqual(["hall"]);
    expect(game.state("reksai").isExhausted).toBe(false);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.deck()).toEqual(deckBefore);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
