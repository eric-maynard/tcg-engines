/**
 * Ruling 40981a744abe89f2 — Lonely Poro (SFD-036 → sfd-036-221) · 2 Might "[Deathknell] — If I died alone, draw 1."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear "[Hidden] If a friendly unit would die, kill this instead. Heal
 *     that unit, exhaust it, and recall it."   × attacker: Vex, Mocking (unl-055-219, 5 Might, Shield/Tank).
 *
 * Q: I hold a battlefield with Lonely Poro and a hidden Zhonya's there. The opponent attacks with Vex and kills the Poro.
 *    Can I react to the Deathknell with Zhonya's — or does Zhonya's "die" first because I no longer have units there?
 * A: You can flip Zhonya's in response to the Deathknell (hidden ⇒ Reaction; the trigger on the chain is a window). It
 *    will NOT save the Poro (a replacement must pre-exist the death). Zhonya's itself is fine: control of the battlefield
 *    can't change during the Combat, and gear is never killed by losing a battlefield anyway — at most recalled to base.
 * Rules: 811.6, 369-370 (replacement effects must be active before the event), 187.4.b-c (no control change during
 *        Combat), 149.3 (unattached gear at a battlefield is recalled), Deathknell (808).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LONELY_PORO = "sfd-036-221";
const ZHONYAS = "ogn-077-298";
const VEX_MOCKING = "unl-055-219";

/** Turn 3, P2's turn. P1 holds bf1 with a lone Lonely Poro and Zhonya's facedown there; P2's Vex (5) is in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LONELY_PORO, "poro")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .unit(P2, "base", VEX_MOCKING, "vex")
    .deck(P1, ["ogn-175-298"], ["topcard"]);
}

/** Vex attacks bf1; both pass Focus; combat: 5 into the 2-Might Poro kills it → its Deathknell is on the chain. */
async function poroKilledInCombat(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("vex", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  expect(game.zoneOf("poro")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling 40981a744abe89f2 — hidden Zhonya's can answer Lonely Poro's combat Deathknell; it can't save the Poro, and it doesn't die", () => {
  test("1. there IS a window: with the Deathknell on the chain (Closed state) P1 holds priority, still controls bf1 mid-Combat, and Zhonya's is still facedown and playable", async () => {
    const game = await poroKilledInCombat();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // 187.4.b — no control change during the Combat
    expect(game.zoneOf("zh")).toBe("facedown-bf1"); // it did not "die" when the Poro left
    expect(game.p1.can("reveal", "zh")).toBe(true); // 811.6 — hidden ⇒ Reaction
    await game.p1.reveal("zh");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // for [0]
    expect(game.state("zh").isHidden).toBe(false);
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("zh")); // on the board as P1's gear
  });

  test("2. it does not save the Poro: the death already happened — Poro stays in the trash (no heal/exhaust/recall), Zhonya's is not killed 'instead', and the Deathknell still draws 1 (died alone)", async () => {
    const game = await poroKilledInCombat();
    const hand = game.p1.hand().length;
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.units()).toEqual([]);
    expect(game.zoneOf("zh")).not.toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.hand()).toContain("topcard");
  });

  test("3. Zhonya's survives losing the battlefield: after the Combat P2 conquers bf1 (Vex remains), yet Zhonya's is P1's gear in P1's base — never killed", async () => {
    const game = await poroKilledInCombat();
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("vex")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("zh")).toBe("base"); // unattached gear ends up recalled to / placed in base (149.3), not the trash
    expect(game.state("zh")).toMatchObject({ controller: P1, owner: P1 });
    expect(game.p1.gear()).toContain("zh");
    expect(game.violations()).toEqual([]);
  });

  test("contrast (369): had Zhonya's been face up BEFORE the combat, the Poro's death would have been replaced — Zhonya's killed instead, Poro healed, exhausted and recalled to base; no Deathknell draw", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LONELY_PORO, "poro")
      .gear(P1, ZHONYAS, "zh")
      .unit(P2, "base", VEX_MOCKING, "vex")
      .deck(P1, ["ogn-175-298"], ["topcard"])
      .build();
    const hand = game.p1.hand().length;
    await game.p2.move("vex", "bf1");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.hand()).toHaveLength(hand); // it never died
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // Vex still takes the now-empty battlefield
  });
});
