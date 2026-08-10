/**
 * Ruling 678069c72cf4193e — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Tasty Faefolk (ogn-075-298) · 6 Might — "[Deathknell] — Channel 2 runes exhausted and draw 1."
 *
 * Q: Tasty dies OUTSIDE a showdown and it was my only unit at that battlefield. Can I still reveal my hidden Zhonya's in
 *    response to Tasty's Deathknell trigger?
 * A (riftjudge): No — the cleanup that kills Tasty also notices you no longer control the battlefield and removes the
 *    hidden card before anyone gets priority; you had to flip it before the death. In a showdown control doesn't change
 *    until the showdown ends, so there you CAN flip it after the death (saving only the hidden card).
 * Rules: 808.1.d.2 (Deathknell is a Pending Item before the unit hits the trash), 401.1 (Pending Item ⇒ Closed State),
 *        323.6 / 190.4 (control lapses only in an Open-State Cleanup), 190.4.b (frozen during a showdown), 369.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const TASTY_FAEFOLK = "ogn-075-298";
/** P2's out-of-combat removal: deal 6 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P2's turn 3. P1 holds bf1 with a LONE Tasty Faefolk (6) and Zhonya's facedown there. P2: Brute (7) in base, Bolt + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TASTY_FAEFOLK, "tasty")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .unit(P2, "base", { might: 7, name: "Brute" }, "brute")
    .hand(P2, BOLT, "bolt");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** Bolt kills Tasty outside any showdown; stop with its Deathknell on the chain and P1 holding priority. */
async function tastyDiesToBolt(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("bolt", { targets: "tasty" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Bolt resolves — the Cleanup kills Tasty
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  expect(game.zoneOf("bolt")).toBe("trash");
  expect(game.zoneOf("tasty")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tasty", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling 678069c72cf4193e — hidden Zhonya's after my lone Tasty Faefolk dies outside a showdown", () => {
  test("sequence: Tasty takes lethal 6, the Cleanup kills it, and its Deathknell is put on the chain — players get priority with the Deathknell pending (P1 first)", async () => {
    const game = await tastyDiesToBolt();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // RULING-CONFLICT: riftjudge 678069c72cf4193e (with 8470eb7c4a1c301d / 070fc7a3b21bd0b1 / b43c764cfdfe5b69) says the same
  // Cleanup that kills the lone Tasty flips bf1 to uncontrolled and trashes the hidden Zhonya's BEFORE anyone gets
  // priority, so it can't be revealed in response to the Deathknell. CR 808.1.d.2 (the Deathknell is a Pending Item
  // before Tasty reaches the trash) + 401.1 (Pending Item ⇒ Closed State) + 323.6 / 190.4 (control lapses only in an
  // OPEN-State Cleanup), plus the official clarification 9a32c2cc829f221a, say P1 KEEPS bf1 — and the facedown card —
  // while the Deathknell is on the chain; both lapse at the first Open Cleanup after the chain empties. Engine follows CR
  // (battlefield-control timing model, operations/battlefield-control.ts).
  test("ruling 678069c72cf4193e (rewritten to CR 808.1.d.2 / 323.6): with the Deathknell pending bf1 is STILL P1's, the hidden Zhonya's is still facedown there and MAY be revealed in response", async () => {
    const game = await tastyDiesToBolt();
    expect(bf1(game)?.controller).toBe(P1);
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    expect(["base", "bf1"]).toContain(game.locationOf("zh") as string);
    expect(game.state("zh").isHidden).toBe(false);
  });

  test("…which (as the ruling's nuance agrees) does nothing for Tasty: it had to be flipped BEFORE the death — Tasty stays in the trash, the Deathknell pays out (2 runes exhausted + draw 1), Zhonya's survives face up, and bf1 lapses to nobody once the chain empties", async () => {
    const game = await tastyDiesToBolt();
    const runes0 = game.p1.runes().length;
    const hand0 = game.p1.hand().length;
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.zoneOf("tasty")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(runes0 + 2);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.zoneOf("zh")).not.toBe("trash"); // not "killed instead" — nothing was replaced
    expect(bf1(game)).toMatchObject({ contested: false, controller: null }); // 323.6 — lapsed in the first Open Cleanup
    expect(game.violations()).toEqual([]);
  });

  test("not revealing it: once the Deathknell has resolved and the state opens, bf1 lapses AND the unplayed facedown Zhonya's is trashed with it", async () => {
    const game = await tastyDiesToBolt();
    await game.p1.passPriority();
    await game.settle();
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["tasty", "zh"]));
  });

  test("nuance — the way to make Zhonya's DO something: activate it before Tasty dies (in response to the Bolt) → the death is replaced: Zhonya's killed instead, Tasty healed/exhausted/recalled, no Deathknell", async () => {
    const game = await board().build();
    const runes0 = game.p1.runes().length;
    const hand0 = game.p1.hand().length;
    await game.p2.cast("bolt", { targets: "tasty" });
    await game.p2.passPriority();
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("tasty")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.runes()).toHaveLength(runes0);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("nuance — in a SHOWDOWN control is frozen until it ends: Brute attacks, Tasty dies to combat damage, and with its Deathknell on the chain bf1 is still contested AND P1's, so the hidden Zhonya's can be played then (saving the card, not Tasty)", async () => {
    const game = await board().build();
    await game.p2.move("brute", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("tasty")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tasty", triggered: true })]);
    expect(bf1(game)).toMatchObject({ contested: true, controller: P1 });
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.zoneOf("tasty")).toBe("trash");
    expect(game.zoneOf("zh")).not.toBe("trash");
    expect(["base", "bf1"]).toContain(game.locationOf("zh") as string);
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
  });
});
