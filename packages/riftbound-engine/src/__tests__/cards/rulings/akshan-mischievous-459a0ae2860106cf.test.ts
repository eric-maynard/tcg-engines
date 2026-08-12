/**
 * Ruling 459a0ae2860106cf — Akshan, Mischievous (SFD-109 → sfd-109-221) · Unit · 4 Might
 *   "[Weaponmaster] You may pay [body][body] as an additional cost to play me. When you play me, if you paid
 *    the additional cost, move an enemy gear to your base. You control it until I leave the board. If it's an
 *    Equipment, attach it to me."
 *   × Doran's Blade (SFD-095 → sfd-095-221) · Equipment (attached: +2 [Might]).
 *
 * Q: Can Akshan steal ATTACHED equipment?
 * A: Yes. The trigger gives you control of the equipment; the "move it to base" part cannot happen while it is
 *    attached, but because it is an Equipment it is attached to Akshan instead, which brings it to his location.
 *    Control lasts only while Akshan is on the board — when he leaves it reverts to its owner.
 * Rules: 422 (attachments), 455 ("until … leaves the board" control), 435.1 (loose gear recall), 719 ([Equip]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const DORANS_BLADE = "sfd-095-221";
const PORTAL_RESCUE = "ogn-102-298"; // [Action] [3][mind]: banish a friendly unit, then its owner plays it to their base

/** P1's turn. P2's Thrall (3) at bf1 wears P2's Doran's Blade (→ 5); P2 also has a loose Trinket. P1: Akshan + Portal Rescue. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 2, mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Thrall" }, "thrall", { equippedWith: ["blade"] } as Record<string, unknown>)
    .card("blade", { def: DORANS_BLADE, meta: { attachedTo: "thrall" } as Record<string, unknown>, owner: P2, zone: "bf1" })
    .gear(P2, { cardType: "gear", name: "Trinket" }, "trinket")
    .hand(P1, AKSHAN, "akshan")
    .hand(P1, PORTAL_RESCUE, "portal");
}

/** P1 plays Akshan paying [body][body] and names `pick` as the enemy gear to take. */
async function akshanTakes(pick: string): Promise<Game> {
  const game = await board().build();
  expect(game.state("thrall").might).toBe(5); // 3 + the attached Blade
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(pick);
  await game.settle();
  return game;
}

describe("Ruling 459a0ae2860106cf — Akshan can steal an ATTACHED Equipment; it re-attaches to him", () => {
  test("ruling: the attached Doran's Blade is a legal choice alongside the loose Trinket", async () => {
    const game = await board().build();
    await game.p1.play("akshan", { payOptional: true, to: "base" });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => String(o.card ?? o.key)).toSorted() : [];
    expect(offered).toEqual(["blade", "trinket"]);
  });

  test("ruling: taking the attached Blade detaches it from the Thrall and attaches it to Akshan, under P1's control (still owned by P2)", async () => {
    const game = await akshanTakes("blade");
    expect(game.state("blade")).toMatchObject({ attachedTo: "akshan", controller: P1, location: "base", owner: P2 });
    expect(game.state("akshan")).toMatchObject({ attachments: ["blade"], might: 6 }); // 4 + 2
    expect(game.state("thrall")).toMatchObject({ attachments: [], might: 3 });
    expect(game.p1.gear()).toEqual(["blade"]);
    expect(game.p2.gear()).toEqual(["trinket"]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a non-Equipment gear is simply moved to P1's base under P1's control, unattached", async () => {
    const game = await akshanTakes("trinket");
    expect(game.state("trinket")).toMatchObject({ attachedTo: undefined, controller: P1, location: "base", owner: P2 });
    expect(game.state("akshan").attachments).toEqual([]);
    expect(game.state("blade")).toMatchObject({ attachedTo: "thrall", controller: P2 }); // untouched
    expect(game.violations()).toEqual([]);
  });

  test("ruling: control lasts only while Akshan is on the board — banishing him reverts the Blade to its owner", async () => {
    const game = await akshanTakes("blade");
    await game.p1.cast("portal", { targets: "akshan" });
    await game.settle({ policy: "first" });
    expect(game.state("blade")).toMatchObject({ attachedTo: undefined, controller: P2, owner: P2 });
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.p2.gear().toSorted()).toEqual(["blade", "trinket"]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
