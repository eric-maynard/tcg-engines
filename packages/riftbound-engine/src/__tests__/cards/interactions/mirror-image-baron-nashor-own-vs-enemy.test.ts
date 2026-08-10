/**
 * Interaction: Mirror Image (unl-200-219) · Spell · Mind/Order · 3 + [rainbow][rainbow] · Action
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit.
 *      Give it [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)"
 *   × Baron Nashor (unl-147-219) · Unit · Chaos · 10 + [chaos]×3 · 12 Might
 *     "As you play me, add the Baron Pit battlefield token to the board if it's not there already. If
 *      you do, I enter there. (It has "Units can move here from anywhere.")
 *      I can't be chosen by enemy spells and abilities.
 *      Other friendly units have +2 [Might]."
 *   (+ Baron Pit unl-t01 token battlefield; Charm ogn-043-298 "Move an enemy unit" as P2's targeting probe.)
 *
 * Rules: 355.9.b ("can't be chosen by enemy spells" → not a valid target, so never offered), 477.1.b.1
 * / .a / .b (copy = printed copyable traits: name, type, tags, cost, domain, rules text), 383.2.c +
 * 369 / 370.1.b (Baron's "As you play me … I enter there" is tied to the act of playing BARON; the token
 * was played as a vanilla Reflection and copy effects never re-run play/enter text), 477.2.a (Temporary
 * is a separate grant), 477.3 (two "+2 to other friendly units" passives simply add), 816.1.b
 * (Temporary kills at the start of the controller's Beginning Phase), 186.1 (a token leaving the board
 * ceases to exist), 182 / 183 (token owner/controller = the player who created it).
 *
 * Question: P2's Baron sits at the Baron Pit; P1 has its own Baron in base plus a vanilla 2-Might grunt
 * each side. P1 holds Mirror Image.
 *   (a) NO: P2's Baron cannot be chosen by P1's Mirror Image — it is not even offered.
 *   (b) YES: P1's own Baron is a legal choice; the Reflection enters P1's BASE ready (not the Pit; no
 *       second Pit is created).
 *   (c) both P1 Barons are 12+2 = 14; P1's grunt gets +2 twice = 6; P2's side unchanged. The Reflection
 *       has "can't be chosen by enemy spells" too — P2's Charm cannot pick it (nor the real Baron).
 *   (d) at P1's next Beginning Phase Temporary kills the Reflection; it ceases to exist (not in trash);
 *       P1's Baron is 12 again and the grunt 4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const BARON_NASHOR = "unl-147-219";
const BARON_PIT = "unl-t01";
const CHARM = "ogn-043-298";

/** P1 to act with exactly 3 + 2 rainbow. P2's Baron at the (live) Baron Pit; P1's Baron in base; a 2-Might grunt per side; bf1 spare. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: null })
    .battlefield("pit", { controller: P2, def: BARON_PIT, inert: false })
    .unit(P2, "pit", BARON_NASHOR, "theirBaron")
    .unit(P2, "base", { might: 2, name: "Their Grunt" }, "theirGrunt")
    .unit(P1, "base", BARON_NASHOR, "myBaron")
    .unit(P1, "base", { might: 2, name: "My Grunt" }, "myGrunt")
    .hand(P1, MIRROR_IMAGE, "mirror")
    .hand(P2, CHARM, "charm");
}

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** Cast Mirror Image on P1's own Baron, let it resolve, return the new token's id. */
async function reflectMyBaron(game: Game): Promise<string> {
  const before = game.p1.base();
  await game.p1.cast("mirror", { targets: "myBaron" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.settle();
  expect(game.zoneOf("mirror")).toBe("trash");
  const token = game.p1.base().find((id) => !before.includes(id));
  expect(token).toBeDefined();
  return token as string;
}

describe("Mirror Image × Baron Nashor — enemy Baron unchoosable, own Baron reflected", () => {
  test("premise: each Baron is 12 and pumps only its OWN side's other units (+2): both grunts read 4; P2's Baron carries the can't-be-chosen restriction", async () => {
    const game = await board().build();
    expect(game.state("theirBaron")).toMatchObject({ location: "pit", might: 12 });
    expect(game.state("myBaron")).toMatchObject({ location: "base", might: 12 });
    expect(game.state("theirGrunt").might).toBe(4);
    expect(game.state("myGrunt").might).toBe(4);
    expect(game.state("theirBaron").keywords).toContain("Untargetable");
  });

  // ── (a) NO side ─────────────────────────────────────────────────────────────────────────────

  test("(a) NO: Mirror Image ('Choose a unit') does NOT offer P2's Baron — an enemy spell can never choose it (355.9.b); every other unit on the board, friend or foe, is offered", async () => {
    const game = await board().build();
    const offered = targetsOffered(game, "p1", "mirror");
    expect(offered).not.toContain("theirBaron");
    expect(offered.sort()).toEqual(["myBaron", "myGrunt", "theirGrunt"]);
    await expect(game.p1.cast("mirror", { targets: "theirBaron" })).rejects.toThrow();
    expect(game.zoneOf("mirror")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 2 } });
  });

  // ── (b) YES side: own Baron ─────────────────────────────────────────────────────────────────

  test("(b) YES: P1's own Baron is a legal choice (the restriction only binds ENEMY spells); casting costs 3 + 2 power and puts Mirror Image on the chain targeting it", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "mirror")).toBe(true);
    await game.p1.cast("mirror", { targets: "myBaron" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mirror", controller: P1, targets: ["myBaron"], triggered: false })]);
  });

  test("(b) the Reflection is played READY to P1's BASE — not to the Baron Pit: the copied 'As you play me … I enter there' never applies to a token that was played as a vanilla Reflection (383.2.c, 370.1.b)", async () => {
    const game = await board().build();
    const token = await reflectMyBaron(game);
    expect(game.state(token)).toMatchObject({ controller: P1, isReady: true, isToken: true, location: "base", owner: P1, zone: "base" });
    expect(game.cardsAt("pit")).toEqual(["theirBaron"]); // nobody joined P2's Baron
    expect(game.p1.units("base")).toContain(token);
  });

  test("(b) no second Baron Pit is created ('if it's not there already' — and the text never ran anyway): the battlefield row is unchanged", async () => {
    const game = await board().build();
    const before = game.battlefields();
    await reflectMyBaron(game);
    expect(game.battlefields()).toEqual(before);
    expect(game.findAll({ defId: BARON_PIT, zone: "battlefieldRow" })).toEqual(["pit"]);
  });

  test("(b) nothing else triggers or lingers: chain empty, straight back to P1's open main phase", async () => {
    const game = await board().build();
    await reflectMyBaron(game);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) traits and auras ────────────────────────────────────────────────────────────────────

  test("(c) the Reflection has Baron's PRINTED copyable traits — name Baron Nashor, unit, Chaos, cost 10 + [chaos]×3, 12 base Might, undamaged — plus a granted Temporary (477.1.b.1.a, 477.2.a)", async () => {
    const game = await board().build();
    const token = await reflectMyBaron(game);
    const t = game.state(token);
    expect(t.name).toBe("Baron Nashor");
    expect(t.cardType).toBe("unit");
    expect(t.domains).toEqual(["chaos"]);
    expect(t.energyCost).toBe(10);
    expect(t.powerCost).toEqual(["chaos", "chaos", "chaos"]);
    expect(t.baseMight).toBe(12);
    expect(t.damage).toBe(0);
    expect(t.isBuffed).toBe(false);
    expect(t.keywords).toContain("Temporary");
    expect(game.state("myBaron").keywords).not.toContain("Temporary"); // the grant is on the token only
  });

  test("(c) each P1 Baron is an 'other friendly unit' to the other's passive → both read 12+2 = 14; P1's grunt gets +2 from each = 6; P2's Baron (12) and grunt (4) are unaffected (477.3)", async () => {
    const game = await board().build();
    const token = await reflectMyBaron(game);
    expect(game.state("myBaron").might).toBe(14);
    expect(game.state(token).might).toBe(14);
    expect(game.state("myGrunt").might).toBe(6);
    expect(game.state("theirBaron").might).toBe(12);
    expect(game.state("theirGrunt").might).toBe(4);
  });

  test("(c) the Reflection also copied 'I can't be chosen by enemy spells and abilities': on P2's turn Charm ('Move an enemy unit') offers only P1's grunt — neither Baron — and a cast at the token is rejected", async () => {
    const game = await board().build();
    const token = await reflectMyBaron(game);
    expect(game.state(token).keywords).toContain("Untargetable");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1, power: { calm: 1, mind: 2 } }); // Charm + spare for any Deflect-like tax
    expect(targetsOffered(game, "p2", "charm")).toEqual(["myGrunt"]);
    await expect(game.p2.cast("charm", { targets: token })).rejects.toThrow();
    await expect(game.p2.cast("charm", { targets: "myBaron" })).rejects.toThrow();
    expect(game.zoneOf("charm")).toBe("hand");
    // P1's own spells may still choose it: a second Mirror Image would offer the token (friendly).
  });

  test("(c) the Reflection survives the opponent's whole turn — Temporary only looks at ITS controller's Beginning Phase", async () => {
    const game = await board().build();
    const token = await reflectMyBaron(game);
    await game.advanceTurn(); // → P2's main phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf(token)).toBe("base");
    expect(game.state(token).might).toBe(14);
    expect(game.state("myBaron").might).toBe(14);
  });

  // ── (d) P1's next Beginning Phase ───────────────────────────────────────────────────────────

  test("(d) at the start of P1's next Beginning Phase Temporary kills the Reflection; being a token it ceases to exist — gone from the board and NOT in any trash (816.1.b, 186.1)", async () => {
    const game = await board().build();
    const token = await reflectMyBaron(game);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: Beginning Phase kill, then on to main
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.has(token)).toBe(false);
    expect(game.zoneOf(token)).toBe("gone");
    expect(game.p1.units()).not.toContain(token);
    expect(game.p1.trash()).toEqual(["mirror"]); // only the spell — no token corpse
  });

  test("(d) with the second aura gone P1's real Baron drops back to 12 and the grunt to 4; P2's side still 12 / 4; the Pit still holds only P2's Baron", async () => {
    const game = await board().build();
    await reflectMyBaron(game);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.state("myBaron")).toMatchObject({ location: "base", might: 12 });
    expect(game.state("myGrunt").might).toBe(4);
    expect(game.state("theirBaron")).toMatchObject({ location: "pit", might: 12 });
    expect(game.state("theirGrunt").might).toBe(4);
    expect(game.cardsAt("pit")).toEqual(["theirBaron"]);
    expect(game.violations()).toEqual([]);
  });
});
