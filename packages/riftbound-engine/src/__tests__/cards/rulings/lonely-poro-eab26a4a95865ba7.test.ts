/**
 * Ruling eab26a4a95865ba7 — Lonely Poro (SFD-036 → sfd-036-221) · [2] · 2 Might
 *     "[Deathknell] — If I died alone, draw 1. (I'm alone if there are no other friendly units here.)"
 *   × Rengar, Trophy Hunter (UNL-120 → unl-120-219) · [5]+[body] · 6 Might
 *     "[Ambush] … I can be played to a battlefield where there are enemy units (even if you don't have units there)."
 *
 * Q: My Lonely Poro dies alone to an enemy unit at a battlefield; I react to its Deathknell by playing Rengar there.
 *    Do I still draw?
 * A: Yes. "Died alone" is checked at the moment of death (it was alone ⇒ the trigger is on the chain). Rengar, played as
 *    a Reaction on top, resolves/enters first; then the Deathknell resolves and you draw 1 — Rengar's later arrival does
 *    not retroactively undo the condition.
 * Rules: 808 (Deathknell), 383.2 (trigger condition evaluated when the event happens), 340 (LIFO), 811 (Ambush).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LONELY_PORO = "sfd-036-221";
const RENGAR = "unl-120-219";

/** P2's turn. P1 holds bf1 with a LONE Lonely Poro, has Rengar + [5]+[body] and a known top card. P2's Raider (4) attacks. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LONELY_PORO, "poro")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, RENGAR, "rengar")
    .deck(P1, ["ogn-175-298"], ["drawn"]);
}

/** 1. Death event: Raider attacks, both pass, 4 combat damage kills the lone Poro → its Deathknell waits on the chain. */
async function poroDiesAlone(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.units("bf1")).toEqual(["poro"]); // alone
  await game.p2.move("raider", "bf1");
  await game.p2.pass();
  await game.p1.pass();
  for (let i = 0; i < 4 && game.decision()?.kind === "distribute"; i++) {
    const d = game.decision();
    if (d?.kind === "distribute") {
      await game.seat(d.seat).distribute(d.defaultAllocation ?? {});
    }
  }
  expect(game.zoneOf("poro")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.hand()).toEqual(["rengar"]);
  return game;
}

describe("Ruling eab26a4a95865ba7 — Lonely Poro's 'died alone' is fixed at death; Rengar arriving in response doesn't cancel the draw", () => {
  test("control: with no response the Deathknell resolves and P1 draws 1", async () => {
    const game = await poroDiesAlone();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand().sort()).toEqual(["drawn", "rengar"]);
  });

  test("2. Reaction: P1 plays Rengar to bf1 (enemy units there) on top of the Deathknell; 3. LIFO — Rengar enters bf1 first, THEN the Deathknell resolves and P1 still draws 1", async () => {
    const game = await poroDiesAlone();
    expect(game.p1.can("play", "rengar")).toBe(true);
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.locationOf("rengar")).toBe("bf1"); // Rengar is at the battlefield …
    expect(game.chain().map((c) => c.cardId)).toContain("poro"); // … while the Deathknell is still waiting
    expect(game.p1.hand()).toEqual([]);
    // Resolve the Deathknell now that a friendly unit stands where the Poro died.
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "poro"); i++) {
      await game.acting().passPriority();
    }
    expect(game.chain().some((c) => c.cardId === "poro")).toBe(false);
    expect(game.p1.hand()).toEqual(["drawn"]); // drew anyway
    await game.settle();
    expect(game.locationOf("rengar")).toBe("bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // 6 vs 4
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a Poro that dies NOT alone (a Buddy beside it) draws nothing", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LONELY_PORO, "poro")
      .unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy")
      .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
      .deck(P1, ["ogn-175-298"], ["drawn"])
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
  });
});
