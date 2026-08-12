/**
 * Ruling 32e945a51f8cc7a0 — Spinning Axe (SFD-186 → sfd-186-221) · Equipment · +3 [Might]
 *   "[Quick-Draw] — [Equip] [rainbow] — [Temporary]"
 *
 * Q: If the unit wearing Spinning Axe dies, can I react by attaching it to another unit? And if that
 *    unit also dies this turn, can I react again and equip a third?
 * A: No, twice. [Equip] is an ACTIVATED ability, not a triggered one — nothing fires when the wearer
 *    dies. The Axe simply detaches (and is recalled to your base at the cleanup); you re-attach it
 *    later by paying [Equip] [rainbow] in an Open State on your own turn, never as a reaction.
 * Rules: 744.1 / 744.1.c.2 ([Equip] [cost] = "[cost]: Attach this gear to a unit you control"),
 *        148.2 (activated abilities: your Action Phase, Open State), 435.1 (unattached gear is
 *        recalled at the next cleanup), 383 (no trigger ⇒ nothing to respond with).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPINNING_AXE = "sfd-186-221";

/** [Reaction] "Deal 5 to a unit." — kills a 2-Might Bearer (even wearing the Axe's +3). */
const NUKE = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Nuke",
  rulesText: "[Reaction] Deal 5 to a unit.",
  timing: "reaction",
} as const;

/**
 * P1's turn. P1 holds bf1 with a 2-Might Bearer wearing the Axe and a 2-Might Second unit;
 * P1 keeps [rainbow] to re-equip and a Nuke to kill their own Bearer.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Bearer" }, "bearer", { equippedWith: ["axe"] })
    .card("axe", { def: SPINNING_AXE, meta: { attachedTo: "bearer" }, owner: P1, zone: "bf1" })
    .unit(P1, "bf1", { might: 2, name: "Second" }, "second")
    .hand(P1, NUKE, "nuke");
}

/** Is the [Equip] activated ability on offer right now? (the engine surfaces it as the `equipCard` move) */
const canEquip = (game: Game) => game.p1.legal().some((o) => o.moveId === "equipCard");

/** Kill the Bearer with the Nuke and let everything settle. */
async function bearerDead(): Promise<Game> {
  const game = await board().build();
  expect(game.state("bearer")).toMatchObject({ attachments: ["axe"], might: 5 }); // 2 + 3
  await game.p1.cast("nuke", { targets: "bearer" });
  await game.settle();
  expect(game.zoneOf("bearer")).toBe("trash");
  return game;
}

describe("Ruling 32e945a51f8cc7a0 — Spinning Axe has no death trigger: it detaches and waits to be re-equipped", () => {
  test("ruling: when the wearer dies the Axe merely DETACHES — it is not attached to anything and no trigger reaches the chain", async () => {
    const game = await bearerDead();
    expect(game.state("axe").attachedTo).toBeUndefined();
    expect(game.state("second").attachments).toEqual([]);
    expect(game.state("second").might).toBe(2); // the +3 did not jump across
    expect(game.chain()).toEqual([]);
  });

  test("…and nobody is asked anything: the game is straight back in P1's open Main Phase, with the unattached Axe recalled to base", async () => {
    const game = await bearerDead();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("axe")).toBe("base"); // 435.1 — unattached gear is recalled at the cleanup
    expect(game.p1.gear()).toContain("axe");
  });

  test("re-attaching is an ACTIVATED ability paid in an Open State: [Equip] [rainbow] moves it onto the Second unit (+3)", async () => {
    const game = await bearerDead();
    expect(canEquip(game)).toBe(true);
    await game.p1.do("equipCard", { equipmentId: "axe", unitId: "second" });
    await game.settle();
    expect(game.state("axe").attachedTo).toBe("second");
    expect(game.state("second")).toMatchObject({ attachments: ["axe"], might: 5 });
    expect(game.p1.power("rainbow")).toBe(1); // one [rainbow] paid
    expect(game.violations()).toEqual([]);
  });

  test("no reaction re-equip: with a spell on the chain (a Closed State) the [Equip] ability is not available", async () => {
    const game = await board().build();
    await game.p1.cast("nuke", { targets: "bearer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["nuke"]);
    expect(canEquip(game)).toBe(false);
  });

  test("…and not during a showdown either: the second unit attacks, and the Axe still cannot be re-equipped mid-combat", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .gear(P1, SPINNING_AXE, "axe")
      .unit(P1, "base", { might: 4, name: "Runner" }, "runner")
      .unit(P2, "bf2", { might: 2, name: "Defender" }, "def")
      .build();
    expect(canEquip(game)).toBe(true); // legal in the open Main Phase
    await game.p1.move("runner", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(canEquip(game)).toBe(false);
  });
});
