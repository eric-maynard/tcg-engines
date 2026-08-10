/**
 * Ruling 5cb9ae3c64bbf547 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Lonely Poro (sfd-036-221) · 2 Might — "[Deathknell] — If I died alone, draw 1."
 *
 * Q: What is the difference between my Poro being killed while Zhonya's is HIDDEN — inside a combat showdown vs outside?
 * A: When your last chance to flip it is. In combat, once both players pass the showdown closes and damage is assigned
 *    and dealt with no reaction window; the Poro dies in the combat cleanup, and by the time its Deathknell opens a
 *    window the death already happened — a replacement must be face up BEFORE the death, so a still-hidden Zhonya's
 *    can't save it (flip it during the showdown's Open state instead; flipping in the Deathknell window only rescues the
 *    gear itself). Outside a showdown a kill spell sits on the chain (Closed state): flip Zhonya's as a Reaction before
 *    it resolves and the death IS replaced — Zhonya's dies instead, Poro healed/exhausted/recalled, no Deathknell.
 * Rules: 465.2 (no window between showdown close and combat damage), 369.1 / 370 (replacement must pre-exist the
 *        event), 811 (Hidden → play as a Reaction for [0]), 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const LONELY_PORO = "sfd-036-221";
/** P2's out-of-combat removal: deal 3 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P2's turn 3. P1 holds bf1 with a lone Lonely Poro (2) and Zhonya's facedown there; P1 deck top = d1. P2: Brute (5), Bolt + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LONELY_PORO, "poro")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
    .hand(P2, BOLT, "bolt")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** Brute attacks; both pass Focus WITHOUT P1 flipping; combat damage kills the Poro. Stops with its Deathknell on the chain. */
async function poroDiesInCombatUnflipped(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("brute", "bf1");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus(); // last chance gone: showdown closes, damage is dealt at once
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  return game;
}

describe("Ruling 5cb9ae3c64bbf547 — IN COMBAT: a still-hidden Zhonya's is too late once both players pass", () => {
  test("both pass → no reaction window before damage: the Poro is already in the trash and its Deathknell is on the chain while Zhonya's is STILL facedown — nothing was replaced", async () => {
    const game = await poroDiesInCombatUnflipped();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.state("zh").isHidden).toBe(true);
  });

  test("flipping Zhonya's NOW (in the Deathknell window) is legal but saves only the gear: it lands face up in P1's base, the Poro stays dead, the Deathknell draws d1, and P2 conquers bf1", async () => {
    const game = await poroDiesInCombatUnflipped();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash"); // the death had already happened (369.1)
    expect(game.p1.hand()).toEqual(["d1"]); // "died alone" → draw 1
    expect(["base", "bf1"]).toContain(game.locationOf("zh") as string); // rescued from being trashed with the battlefield
    expect(game.zoneOf("zh")).not.toBe("trash");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("not flipping at all: after everything resolves P2 holds bf1 and the never-played facedown Zhonya's went to P1's trash with it", async () => {
    const game = await poroDiesInCombatUnflipped();
    await game.settle();
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("the only shot in combat — flip during the showdown's OPEN state (before passing): Zhonya's is face up when damage lands, so the death IS replaced: Zhonya's killed instead, Poro healed/exhausted/recalled to base, NO Deathknell draw; Brute takes the empty bf1", async () => {
    const game = await board().build();
    await game.p2.move("brute", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh"); // revealed to the opponent, who now assigns damage knowing it
    expect(game.state("zh")).toMatchObject({ isHidden: false });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash"); // "kill this instead"
    expect(game.state("poro")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.hand()).toEqual([]); // no Deathknell — it never died
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 5cb9ae3c64bbf547 — OUTSIDE a showdown: the kill spell's Closed state gives P1 a window to flip first", () => {
  test("P2 Bolts the Poro; with the Bolt on the chain P1 flips the hidden Zhonya's as a Reaction; the Bolt then resolves into a REPLACED death — Zhonya's killed instead, Poro healed/exhausted/recalled, no Deathknell draw", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "poro" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bolt"]);
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    expect(game.state("zh").isHidden).toBe(false); // face up and active BEFORE the kill lands
    await game.settle();
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P1 lets the Bolt resolve unflipped: the Poro dies (Deathknell pending); flipping Zhonya's only then is again too late for the Poro (stays in trash, d1 drawn)", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "poro" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Bolt resolves, Poro dies
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", triggered: true })]);
    if (game.p1.can("reveal", "zh")) {
      await game.p1.reveal("zh");
    }
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
  });
});
