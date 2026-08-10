/**
 * Ruling 028dab977ceec128 — Lonely Poro (SFD-036 → sfd-036-221) × Zhonya's Hourglass (OGN-077 → ogn-077-298)
 *   Lonely Poro: "[Deathknell] — If I died alone, draw 1."
 *   Zhonya's Hourglass: "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it,
 *   and recall it."
 *
 * Q: Lonely Poro is at a battlefield where my Zhonya's is hidden. Can I react to its death trigger with the
 *    hidden Zhonya's?
 * A: Yes — the Deathknell trigger on the chain opens a Reaction window and a facedown Hidden card has
 *    Reaction. But it will not save the Poro: Zhonya's is a replacement effect and had to be in play BEFORE
 *    the death. The Poro stays dead, Zhonya's comes onto the board, and the Deathknell still resolves (draw 1
 *    since it died alone).
 * Rules: 811.6 (hidden ⇒ Reaction), 369.1 / 370 (replacement effects must pre-exist the event), Deathknell.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LONELY_PORO = "sfd-036-221";
const ZHONYAS = "ogn-077-298";

/** Inline 1-energy action spell: deal 3 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** Turn 3, P2's turn. P1 controls bf1: Lonely Poro alone there + Zhonya's hidden there since an earlier turn. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LONELY_PORO, "poro")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .unit(P2, "base", { might: 3, name: "Bystander" }, "bystander")
    .deck(P1, ["ogn-175-298"], ["topcard"])
    .hand(P2, BOLT, "bolt");
}

/** P2 bolts the Poro; both pass; the Poro dies and its Deathknell goes on the chain. */
async function poroDies(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("bolt", { targets: "poro" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // bolt resolves: 3 to a 2-Might Poro
  return game;
}

describe("Ruling 028dab977ceec128 — hidden Zhonya's can be revealed in response to Lonely Poro's Deathknell, but too late to save it", () => {
  test("the Poro has died (in trash) and its Deathknell trigger is on the chain — the game is in a Closed state", async () => {
    const game = await poroDies();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
    expect(game.zoneOf("zh")).toBe("facedown-bf1"); // the replacement was not in play when the death happened
  });

  test("in that window P1 may play the facedown Zhonya's (Hidden ⇒ Reaction, 811.6) for 0 — it goes on the chain above the Deathknell", async () => {
    const game = await poroDies();
    // Priority after a P1-controlled trigger is added: find P1's window.
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("zh").isHidden).toBe(false);
    expect(game.zoneOf("zh")).not.toBe("facedown-bf1");
  });

  test("…but it does not save the Poro: after everything resolves the Poro is still in the trash, Zhonya's is in play (not consumed by a save), and the Deathknell drew P1 exactly 1", async () => {
    const game = await poroDies();
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    const hand = game.p1.hand().length;
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.chain()).toEqual([]);
    // Not saved: no heal/exhaust/recall ever happened to the Poro.
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.units()).not.toContain("poro");
    // Zhonya's was played (left the facedown slot) and was NOT killed "instead" of the Poro.
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("zh"));
    // Deathknell (died alone) still resolved: +1 card, the known top card.
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.hand()).toContain("topcard");
    expect(game.violations()).toEqual([]);
  });

  test("contrast the ruling relies on (369.1): had Zhonya's already been face up in play, the same bolt would have been replaced — Poro healed, exhausted, recalled; Zhonya's killed instead; no Deathknell draw", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LONELY_PORO, "poro")
      .gear(P1, ZHONYAS, "zh")
      .deck(P1, ["ogn-175-298"], ["topcard"])
      .hand(P2, BOLT, "bolt")
      .build();
    const hand = game.p1.hand().length;
    await game.p2.cast("bolt", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.hand()).toHaveLength(hand); // it never died → no Deathknell
  });
});
