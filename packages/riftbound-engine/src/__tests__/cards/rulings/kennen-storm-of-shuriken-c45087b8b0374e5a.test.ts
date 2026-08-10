/**
 * Ruling c45087b8b0374e5a — Kennen, Storm of Shuriken (VEN-113 → ven-113-166) · 4 Might · "When you play me, [Burn 2]. When I conquer,
 *     give a spell in your trash [Flow] equal to its cost this turn. (You may play it from your trash for its Flow cost. Then banish it.)"
 *   × Star-Crossed (UNL-128 → unl-128-219) · Reaction · [3]+[chaos] · "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Kennen conquers and his trigger gives Star-Crossed in my trash Flow. Later this turn the opponent plays a spell that will kill
 *    Kennen — can I react with Star-Crossed from my trash?
 * A: Yes. The Flow grant permits playing it from the trash this turn, and Star-Crossed is a Reaction, so it can be played in the Closed
 *    state onto the opponent's spell. It resolves first (LIFO): Kennen (and an enemy unit) return to hand; the kill spell then finds no
 *    Kennen and does nothing. You do need a legal enemy unit as the second object.
 * Rules: 829 (Flow: play from trash for the Flow cost, then banish), 336–340 (Closed state, Reaction timing, LIFO), 359.3.e (an
 *        instruction whose object left the board is ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KENNEN = "ven-113-166";
const STAR_CROSSED = "unl-128-219";
/** P2's would-be Kennen killer: an inline Action spell "Kill a unit." (played with Focus in a showdown later in P1's turn). */
const KILLSHOT = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  name: "Killshot",
  timing: "action",
} as const;

/**
 * P1's turn with 3 + [chaos] (Star-Crossed's cost). P2 holds bf1 with a 1-Might Defender; bf2 is open. P2 has a Bystander (2) in base
 * (the enemy unit Star-Crossed needs) and Killshot + [2]. P1: Kennen (4) and a Scout (2) in base; Star-Crossed already in the trash.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 1, name: "Defender" }, "def")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
    .unit(P1, "base", KENNEN, "kennen")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .trash(P1, STAR_CROSSED, "sc")
    .hand(P2, KILLSHOT, "ks");
}

/** Kennen attacks bf1 and conquers; his trigger names Star-Crossed (the only spell in P1's trash). Back in P1's open main phase. */
async function kennenConquers(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("cast", "sc")).toBe(false); // not playable from the trash before the grant
  await game.p1.move("kennen", "bf1");
  await game.settle();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("sc");
    await game.settle();
  }
  expect(game.zoneOf("def")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** Later this turn: Scout steps onto open bf2 (a showdown), P1 passes Focus, and P2 — with Focus — Killshots Kennen. P1 now holds priority. */
async function p2KillshotsKennen(game: Game): Promise<void> {
  await game.p1.move("scout", "bf2");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.p2.can("cast", "ks")).toBe(true);
  await game.p2.cast("ks", { targets: "kennen" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ks", controller: P2, targets: ["kennen"] })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

/** Answer Star-Crossed's object choices (friendly = Kennen, enemy = Bystander) whenever asked; pass priority otherwise, until the chain is empty. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const want = d.options.find((o) => ["kennen", "by"].includes((o.card ?? o.key) as string)) ?? d.options[0]!;
      await game.p1.pick(want.key);
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
}

describe("Ruling c45087b8b0374e5a — Kennen's Flow grant lets Star-Crossed be played from the trash as a Reaction to save him", () => {
  test("after Kennen conquers, Star-Crossed (still in the trash) is playable this turn — as a Flow play only", async () => {
    const game = await kennenConquers();
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.p1.can("cast", "sc")).toBe(true);
    const flow = game.p1.option("cast", "sc")?.fields.find((f) => f.arg === "flow");
    expect(flow?.options).toContain(true);
    expect(flow?.options).not.toContain(false);
  });

  test("with P2's Killshot (targeting Kennen) on the chain — a Closed state — P1 may still play Star-Crossed from the trash: it is a Reaction; the Flow cost [3]+[chaos] is paid and it sits on top", async () => {
    const game = await kennenConquers();
    await p2KillshotsKennen(game);
    expect(game.p1.can("cast", "sc")).toBe(true);
    await game.p1.cast("sc", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ks", "sc"]);
  });

  test("Star-Crossed resolves first: Kennen returns to P1's hand and the enemy Bystander to P2's hand; then Killshot resolves with Kennen gone and does nothing; the Flow-played Star-Crossed is banished", async () => {
    const game = await kennenConquers();
    await p2KillshotsKennen(game);
    await game.p1.cast("sc", { flow: true });
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("kennen")).toBe("hand");
    expect(game.p1.hand()).toContain("kennen");
    expect(game.p1.trash()).not.toContain("kennen"); // saved — never killed
    expect(game.zoneOf("by")).toBe("hand");
    expect(game.p2.hand()).toContain("by");
    expect(game.zoneOf("ks")).toBe("trash");
    expect(game.zoneOf("sc")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });

  test("the catch: with NO enemy unit on the board Star-Crossed has no legal second object and cannot be played at all — Kennen dies to Killshot", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 1, name: "Defender" }, "def")
      .unit(P1, "base", KENNEN, "kennen")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .trash(P1, STAR_CROSSED, "sc")
      .hand(P2, KILLSHOT, "ks")
      .build();
    await game.p1.move("kennen", "bf1");
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("sc");
      await game.settle();
    }
    expect(game.p2.units()).toEqual([]); // the Defender died — no enemy unit anywhere
    await p2KillshotsKennen(game);
    expect(game.p1.can("cast", "sc")).toBe(false);
    await resolveChain(game);
    expect(game.zoneOf("kennen")).toBe("trash");
  });
});
