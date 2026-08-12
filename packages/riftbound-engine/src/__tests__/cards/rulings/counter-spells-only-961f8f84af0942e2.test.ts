/**
 * Ruling 961f8f84af0942e2 — (general countering; exercised with)
 *   Hidden Blade (OGN-213 → ogn-213-298) · "[Hidden] [Action] Kill a unit at a battlefield." — a hidden SPELL
 *   × Windsinger (SFD-138 → sfd-138-221) · 1 Might · "[Hidden] When you play me, you may return another unit at a
 *     battlefield with 3 [Might] or less to its owner's hand." — a hidden UNIT
 *
 * Q: Can I counter my opponent's hidden card when they reveal it?
 * A: Only if it is a spell. A spell sits on the chain and can be countered there, flipped from Hidden or not.
 *    Units and gear enter and leave the chain in one step, so there is nothing to counter; a "counter a spell"
 *    effect never offers a permanent — or a triggered ability — as a target.
 * Rules: 425.1 (countering removes a chain item), 355.8 (a counter is only offered legal targets),
 *        337 / 340 (permanents finalize and enter the board without lingering on the chain), 811.1.c.3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const WINDSINGER = "sfd-138-221";

/** [Reaction] "Counter a spell." */
const COUNTERSPELL = {
  abilities: [{ effect: { target: { type: "spell" }, type: "counter" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Test Counterspell",
  rulesText: "[Reaction] Counter a spell.",
  timing: "reaction",
} as const;

/** [Action] "Deal 1 to a unit." — P1's slow spell, only there to open a chain on P1's turn. */
const POKE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Poke",
  rulesText: "[Action] Deal 1 to a unit.",
  timing: "action",
} as const;

/** Turn 3, P1 active. P2 holds bf2 with a hidden card there (hidden on an earlier turn) and P1 has a counter. */
function board(hiddenDef: string) {
  return scenario()
    .turn(3)
    .active(P1)
    .resources(P1, { energy: 4, power: { calm: 2, fury: 2 } })
    .resources(P2, { energy: 4, power: { chaos: 2, order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 2, name: "Scout" }, "scout")
    .facedown(P2, "bf2", hiddenDef, "flip")
    .hand(P1, COUNTERSPELL, "counter")
    .hand(P1, POKE, "poke");
}

/** P1 casts a slow spell; P2 flips their hidden card in response; P1 is on priority with it on the chain. */
async function flipInResponse(hiddenDef: string): Promise<Game> {
  const game = await board(hiddenDef).build();
  await game.p1.cast("poke", { targets: "guard" });
  await game.p1.passPriority();
  expect(game.p2.can("reveal", "flip")).toBe(true);
  return game;
}

describe("Ruling 961f8f84af0942e2 — only spells can be countered, hidden or not", () => {
  test("a hidden SPELL flipped in response is a chain item, and the counter offers it as a target", async () => {
    const game = await flipInResponse(HIDDEN_BLADE);
    await game.p2.reveal("flip");
    await game.p2.pick("scout"); // its "here" target, asked at finalization
    expect(game.chain().map((c) => c.cardId)).toEqual(["poke", "flip"]);
    await game.p2.passPriority(); // P2 kept priority after flipping; now it is P1's window
    const targets = game.p1.option("cast", "counter")?.fields.find((f) => f.name === "targets");
    expect((targets?.options ?? []).flat()).toContain("flip");
  });

  test("countering it removes it from the chain — it hits the trash and the Scout it named survives", async () => {
    const game = await flipInResponse(HIDDEN_BLADE);
    await game.p2.reveal("flip");
    await game.p2.pick("scout");
    await game.p2.passPriority();
    await game.p1.cast("counter", { targets: "flip" });
    await game.settle();
    expect(game.zoneOf("flip")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("battlefield-bf2"); // never killed
    expect(game.zoneOf("counter")).toBe("trash");
  });

  test("a hidden UNIT flipped in response is already ON THE BOARD — it never lingers on the chain, so there is nothing to counter", async () => {
    const game = await flipInResponse(WINDSINGER);
    await game.p2.reveal("flip");
    expect(game.zoneOf("flip")).toBe("battlefield-bf2"); // the permanent entered at once
    await game.p2.no(); // decline its play trigger — the item leaves the chain (383.3.a.2)
    expect(game.chain().map((c) => c.cardId)).toEqual(["poke"]);
    const targets = game.p1.option("cast", "counter")?.fields.find((f) => f.name === "targets");
    const options = (targets?.options ?? []).flat();
    expect(options).toContain("poke"); // the spell still on the chain IS counterable
    expect(options).not.toContain("flip"); // the Windsinger is not
  });

  test("its play TRIGGER on the chain is not a spell either: 'counter a spell' does not name the triggered item", async () => {
    const game = await flipInResponse(WINDSINGER);
    await game.p2.reveal("flip");
    await game.p2.yes(); // keep the play trigger on the chain
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("scout");
    }
    const triggered = game.chain().filter((c) => c.triggered);
    expect(triggered.map((c) => c.cardId)).toEqual(["flip"]);
    expect(triggered[0]?.type).toBe("ability");
    await game.p2.passPriority();
    const targets = game.p1.option("cast", "counter")?.fields.find((f) => f.name === "targets");
    expect((targets?.options ?? []).flat()).not.toContain("flip");
    expect(game.violations()).toEqual([]);
  });
});
