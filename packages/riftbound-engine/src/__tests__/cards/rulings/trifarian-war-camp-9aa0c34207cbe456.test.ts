/**
 * Ruling 9aa0c34207cbe456 — Trifarian War Camp (OGN-294 → ogn-294-298, battlefield: "Units here have +1 [Might].")
 *   × Ruined Rex (UNL-067 → unl-067-219) · 6 Might · "[Deathknell] Deal 4 to an enemy unit."
 *   × LeBlanc, Fragmented (UNL-172 → unl-172-219) · 3 Might · [Assault] · Deathknell draw
 *   × Vi, Peacekeeper (UNL-176 → unl-176-219) · 5 Might · [Ambush] · "When I attack, [Stun] an enemy unit here."
 *
 * Q: LeBlanc attacks the opponent's War Camp where Ruined Rex sits, then Vi is Ambushed in. Can Rex's Deathknell
 *    kill LeBlanc?
 * A: Yes. Combat damage → Rex marked lethal, his Deathknell becomes pending → lethal units die → surviving units are
 *    healed in the Combat Cleanup → only THEN does the Deathknell resolve. Its 4 is fresh damage on a LeBlanc that is
 *    no longer an attacker (3 + 1 Camp = 4), so it kills her.
 * Rules: 465–466 (combat damage, kills, cleanup heal), 808 (Deathknell pending during combat), 807.1 (Assault only
 *        while attacking), 340 (chain resumes after cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAR_CAMP = "ogn-294-298";
const RUINED_REX = "unl-067-219";
const LEBLANC = "unl-172-219";
const VI = "unl-176-219";

/** P1's turn with exactly [5][order] for Vi. P2 controls the live War Camp with Ruined Rex; LeBlanc ready in P1's base; Vi in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 1 } })
    .battlefield("camp", { controller: P2, def: WAR_CAMP, inert: false, owner: P2 })
    .unit(P2, "camp", RUINED_REX, "rex")
    .unit(P1, "base", LEBLANC, "leb")
    .hand(P1, VI, "vi");
}

/** LeBlanc attacks the Camp; P1 Ambushes Vi in; Vi's attack trigger stuns Rex; drive to the Deathknell target prompt. */
async function fightUntilDeathknellPrompt(): Promise<Game> {
  const game = await board().build();
  expect(game.state("rex").might).toBe(7); // 6 + 1 (Camp)
  await game.p1.move("leb", "camp");
  expect(game.state("leb")).toMatchObject({ combatRole: "attacker", might: 5 }); // 3 + 1 Assault + 1 Camp
  // Ambush: Vi may be played as a Reaction to a battlefield where P1 has units.
  expect(game.p1.can("play", "vi")).toBe(true);
  expect(game.p1.option("playUnit", "vi")?.fields.find((f) => f.arg === "to")?.options).toContain("battlefield-camp");
  await game.p1.play("vi", { to: "camp" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.locationOf("vi")).toBe("camp");
  // Drive: Vi's "When I attack" stun (Rex is the only enemy here), passes, combat damage — stop at P2's Deathknell pick.
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "pick" && d.seat === P2 && d.source?.cardId === "rex") {
      return game;
    }
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options[0]?.key as string); // Vi's stun → rex
    } else if (d.kind === "action" && (d.context === "chain" || d.context === "showdown")) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "distribute") {
      await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? {}) });
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 9aa0c34207cbe456 — Ruined Rex's Deathknell resolves after the combat heal and can kill LeBlanc", () => {
  test("combat: Vi (Ambush) joins as an attacker and stuns Rex; Rex (7) takes 5 + 6 and dies; when his Deathknell asks P2 for a target the showdown is over — Rex in trash, LeBlanc alive and undamaged; the Deathknell is the only chain item and offers LeBlanc or Vi", async () => {
    const game = await fightUntilDeathknellPrompt();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "rex" } });
    expect((d as { options: { card?: string }[] }).options.map((o) => o.card).sort()).toEqual(["leb", "vi"]);
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]); // combat is done
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P2, triggered: true })]);
    expect(game.zoneOf("leb")).toBe("battlefield-camp");
    expect(game.state("leb").damage).toBe(0); // healed / never damaged (Rex was stunned)
  });

  // RULING-CONFLICT: riftjudge 9aa0c34207cbe456 narrates the Attacker designation and the conquer as already gone/done when
  // the Deathknell resolves; CR 466.2 says the chain from combat damage and the Combat Cleanup resolves BEFORE 466.3
  // (determine result) → 466.5 (establish control) → 466.7.a (remove Attacker/Defender designations) — engine follows CR.
  // The narration's OUTCOME is still reached: LeBlanc takes the 4 while a 5-Might attacker, then loses [Assault] at 466.7.a
  // and dies to the state-based check at 4 damage vs 4 Might (see the next facet).
  test("ruling 9aa0c34207cbe456 — while the Deathknell is on the chain LeBlanc is still the Attacker (5 Might) and the Camp is still P2's (CR 466.2)", async () => {
    const game = await fightUntilDeathknellPrompt();
    await game.p2.pick("leb");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // Deathknell finalized, not yet resolved
    expect(game.state("leb").combatRole).toBe("attacker");
    expect(game.state("leb").might).toBe(5);
    expect(game.gameState.battlefields.camp?.controller).toBe(P2);
  });

  test("P2 aims the Deathknell's 4 at LeBlanc: 4 damage on a 4-Might unit — LeBlanc dies (her own Deathknell draws P1 a card); Vi keeps the Camp", async () => {
    const game = await fightUntilDeathknellPrompt();
    const hand = game.p1.hand().length;
    await game.p2.pick("leb");
    await game.settle();
    expect(game.zoneOf("leb")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1); // LeBlanc's Deathknell: draw 1 (not the Beginning Phase)
    expect(game.zoneOf("vi")).toBe("battlefield-camp");
    expect(game.gameState.battlefields.camp?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: aimed at Vi (5 + 1 = 6 Might) the 4 is not lethal — Vi survives with 4 damage and LeBlanc lives", async () => {
    const game = await fightUntilDeathknellPrompt();
    await game.p2.pick("vi");
    await game.settle();
    expect(game.zoneOf("vi")).toBe("battlefield-camp");
    expect(game.state("vi").damage).toBe(4);
    expect(game.zoneOf("leb")).toBe("battlefield-camp");
  });
});
