/**
 * Ruling ed5aaa555ca3945a — Switcheroo (SFD-145 → sfd-145-221) · [Hidden] [Action] · Chaos · 2 + [chaos][chaos]
 *     "Swap the Might of two units at the same battlefield this turn."
 *   × Thrill of the Hunt (UNL-184 → unl-184-219) · [Reaction] · 2 + [rainbow] · "Banish a friendly unit, then its owner plays it to
 *     any battlefield, ignoring its cost."
 *
 * Q: I play a hidden Switcheroo; my opponent reacts with Thrill of the Hunt on one of the two units, replaying it to the SAME
 *    battlefield. Does Switcheroo still resolve (both are "at the same battlefield" again)?
 * A: It resolves, but the swap does nothing: Thrill (LIFO first) banished the unit to a non-board zone and replayed it, so it is a
 *    NEW object and no longer a legal target (359.3.e.4) — even at the same battlefield. With only one legal target a Swap can't be
 *    performed (433 → 359.3.e.6). Switcheroo still counts as a played spell ("when you play a spell" triggers fire).
 * Rules: 331 (LIFO), 359.3.e.4 (zone change → new object → illegal), 359.3.e.8 / 359.3.e.6, 433 (Swap), 359.3.e.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const THRILL_OF_THE_HUNT = "unl-184-219";
const RAVENBLOOM_STUDENT = "ogn-103-298"; // "When you play a spell, give me +1 [Might] this turn." — observes 'played a spell'

/**
 * Turn 3, P2 active. P1 holds bf1 with Small (2) and hid Switcheroo there earlier; Ravenbloom Student (2) in P1's base.
 * P2: Big (5) in base attacks bf1; Thrill of the Hunt in hand + 2 + [rainbow]; also holds bf2 (Holder 2).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Small" }, "small")
    .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
    .facedown(P1, "bf1", SWITCHEROO, "roo")
    .unit(P2, "base", { might: 5, name: "Big" }, "big")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .hand(P2, THRILL_OF_THE_HUNT, "thrill");
}

/** Big attacks bf1; P1 (defender, with Focus) flips Switcheroo on {Small, Big}; P1 passes → P2 to respond. */
async function switcherooOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("big", "bf1");
  await game.p2.passFocus();
  expect(game.p1.can("reveal", "roo")).toBe(true);
  await game.p1.reveal("roo");
  for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    await game.p1.pick(keys.includes("small") ? "small" : "big");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "roo", controller: P1, targets: ["small", "big"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** …P2 Thrills Big and replays it to bf1; leaves Switcheroo alone on the chain with P1 holding priority. */
async function thrillBigBackToBf1(game: Game): Promise<void> {
  expect(game.p2.can("cast", "thrill")).toBe(true);
  await game.p2.cast("thrill", { targets: "big" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["roo", "thrill"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Thrill resolves first (LIFO)
  // "its owner plays it to any battlefield" — P2 (owner) chooses; both battlefields offered.
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["battlefield-bf1", "battlefield-bf2"]);
  await game.p2.pick("battlefield-bf1");
  expect(game.zoneOf("thrill")).toBe("trash");
  expect(game.zoneOf("big")).toBe("battlefield-bf1"); // back at the SAME battlefield…
  expect(game.state("big").isExhausted).toBe(true); // …as a freshly played (exhausted) unit
  expect(game.chain().map((c) => c.cardId)).toEqual(["roo"]);
}

describe("Ruling ed5aaa555ca3945a — a Thrill-replayed unit is a new object: Switcheroo resolves but swaps nothing", () => {
  test("setup: hidden Switcheroo flipped mid-showdown targets {Small 2, Big 5}; P2 answers with Thrill of the Hunt on Big and replays it to the same bf1 before Switcheroo resolves", async () => {
    const game = await switcherooOnChain();
    await thrillBigBackToBf1(game);
    expect(game.state("small").might).toBe(2);
    expect(game.state("big").might).toBe(5);
  });

  // Expected (ruling / 359.3.e.4): Big left the board (banishment) and came back as a NEW object, so it is no longer one of
  // Switcheroo's targets; with a single legal target the Swap is not performed — Small stays 2, Big stays 5.
  test("ruling ed5aaa555ca3945a — no swap with the banished-and-replayed unit (it is a new, illegal object)", async () => {
    const game = await switcherooOnChain();
    await thrillBigBackToBf1(game);
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "roo"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("roo")).toBe("trash");
    expect(game.state("small")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.state("big")).toMatchObject({ might: 5, mightModifier: 0 });
  });

  test("Switcheroo nevertheless RESOLVES as a played spell: it goes to P1's trash and P1's Ravenbloom Student ('When you play a spell') triggers and gets +1", async () => {
    const game = await switcherooOnChain();
    await thrillBigBackToBf1(game);
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("roo")).toBe("trash");
    expect(game.p1.trash()).toContain("roo");
    expect(game.state("student")).toMatchObject({ might: 3, mightModifier: 1 });
  });

  test("contrast — no Thrill: Switcheroo swaps for real (Small 5, Big 2) and the Student still gets +1", async () => {
    const game = await switcherooOnChain();
    await game.p2.passPriority();
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("small").might).toBe(5);
    expect(game.state("big").might).toBe(2);
    expect(game.state("student").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
