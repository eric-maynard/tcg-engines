/**
 * Ruling e5399e8de3f0f05c — Forge of the Fluft (SFD-208 → sfd-208-221) · Battlefield
 *     "While you control this battlefield, friendly legends have '[Exhaust]: Attach an Equipment you control to a unit you control.'"
 *   × Long Sword (SFD-022 → sfd-022-221) · Equipment · Fury · 2 · "[Quick-Draw] (This has [Reaction]. When you play it, attach it
 *     to a unit you control.) [Equip] [fury]"
 *
 * Q: While DEFENDING Forge of the Fluft in a showdown, can I exhaust my legend to attach the Long Sword sitting in my base?
 * A: No. The granted ability has default (non-Action, non-Reaction) timing: usable only on your own turn, in an Open State,
 *    outside showdowns — and not on the opponent's turn at all. Playing Long Sword from HAND is different: Quick-Draw gives it
 *    Reaction timing, so that works during the showdown.
 * Rules: 380.3 (activated abilities default to your turn / open state), 347 (showdown Focus allows Action/Reaction only),
 *        Quick-Draw (Reaction + attach on play).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FORGE_OF_THE_FLUFT = "sfd-208-221";
const LONG_SWORD = "sfd-022-221";
const LEGEND = "ogs-019-024"; // Wuju Bladesman - Starter: no activated ability of its own

/**
 * Turn 3. P1 controls Forge of the Fluft (live text) with Holder (3); Squire (2) in base; a Long Sword loose in base and a
 * second Long Sword in hand with exactly 2 + [fury][fury]. P2's Raider (4) in base.
 */
function board(active: typeof P1 | typeof P2) {
  return scenario()
    .turn(3)
    .active(active)
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("forge", { controller: P1, def: FORGE_OF_THE_FLUFT, inert: false })
    .legend(P1, LEGEND, "legend")
    .unit(P1, "forge", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .gear(P1, LONG_SWORD, "sword")
    .hand(P1, LONG_SWORD, "swordInHand")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

describe("Ruling e5399e8de3f0f05c — Forge of the Fluft's granted legend ability is your-turn/open-state only; Quick-Draw is the showdown route", () => {
  test("control — on P1's OWN turn in an open state the legend HAS the granted '[Exhaust]: Attach…' ability and it attaches the base Long Sword to Holder", async () => {
    const game = await board(P1).build();
    expect(game.p1.can("activate", "legend")).toBe(true);
    await game.p1.activate("legend", undefined, { targets: "holder", answers: ["sword"] });
    await game.settle({ policy: "first" });
    expect(game.state("legend").isExhausted).toBe(true);
    expect(game.state("sword").attachedTo).toBe("holder");
    expect(game.state("holder").attachments).toContain("sword");
  });

  test("on the OPPONENT's turn, even outside any showdown, P1 cannot activate it", async () => {
    const game = await board(P2).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("activate", "legend")).toBe(false);
    expect(game.p1.legal().some((o) => o.key.startsWith("activateAbility:legend"))).toBe(false);
  });

  test("ruling: P2 attacks Forge; P1 defends and receives Focus — the legend ability is STILL not offered (not an Action/Reaction), the base Long Sword stays unattached", async () => {
    const game = await board(P2).build();
    await game.p2.move("raider", "forge");
    expect(game.state("holder").combatRole).toBe("defender");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "legend")).toBe(false);
    expect(game.p1.legal().some((o) => o.key.startsWith("activateAbility:legend"))).toBe(false);
    const r = await game.p1.try((p) => p.activate("legend", 1, { targets: "holder" }));
    expect(r.ok).toBe(false);
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.state("legend").isExhausted).toBe(false);
  });

  test("…but playing the Long Sword from HAND works there: Quick-Draw = Reaction timing, and 'when you play it, attach it' puts it on Holder mid-showdown (2 + [fury] paid)", async () => {
    const game = await board(P2).build();
    await game.p2.move("raider", "forge");
    await game.p2.passFocus();
    expect(game.p1.can("play", "swordInHand")).toBe(true);
    const before = game.state("holder").might;
    await game.p1.play("swordInHand");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["holder", "squire"]);
    await game.p1.pick("holder");
    // rule 819.1.d / 383.4.a.2 — the attach is a triggered Chain item: it takes
    // a pass from each player before the sword is actually worn.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("swordInHand").attachedTo).toBe("holder");
    expect(game.state("holder").attachments).toContain("swordInHand");
    expect(game.state("holder").might).toBeGreaterThan(before);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // still in the showdown
    expect(game.violations()).toEqual([]);
  });
});
