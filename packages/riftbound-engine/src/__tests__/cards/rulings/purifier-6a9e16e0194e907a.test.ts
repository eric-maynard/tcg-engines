/**
 * Ruling 6a9e16e0194e907a — Purifier (Lucian legend, SFD-183 → sfd-183-221) "Your Equipment each give [Assault]. (+1 [Might] while
 *     equipped unit is an attacker.)"
 *   × Challenge (OGN-128 → ogn-128-298) · [Action] "Choose a friendly unit and an enemy unit. They deal damage equal to their
 *     Mights to each other."   (Equipment used: Doran's Blade sfd-095-221, +2 Might.)
 *
 * Q: Does Lucian's legend Assault apply when I use Challenge to "attack" a unit?
 * A: No. Assault only adds Might while the unit is an ATTACKER (a combat designation); Challenge is a spell, not combat, so
 *    the unit is not an attacker and deals its un-Assaulted Might. Nuance: if the unit is already attacking in a combat
 *    when Challenge is played, it IS an attacker and its Assault bonus counts.
 * Rules: 733.1.d / Assault (bonus only while attacker), 464.2 (designations come from combat), Challenge text.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PURIFIER = "sfd-183-221";
const CHALLENGE = "ogn-128-298";
const DORANS_BLADE = "sfd-095-221";

/**
 * P1's turn, Purifier as legend, exactly [2]+body for Challenge. P1's Duelist (3) wears Doran's Blade (+2 → 5; 6 while
 * attacking thanks to Purifier's Assault). P2: Bystander (6) in base, a harmless Doormat (1) holding bf1.
 */
function board() {
  return scenario()
    .legend(P1, PURIFIER, "purifier")
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Doormat" }, "doormat")
    .unit(P2, "base", { might: 6, name: "Bystander" }, "bystander")
    .unit(P1, "base", { might: 3, name: "Duelist" }, "duelist", { equippedWith: ["blade"] } as Record<string, unknown>)
    .card("blade", { def: DORANS_BLADE, meta: { attachedTo: "duelist" } as Record<string, unknown>, owner: P1, zone: "base" })
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 6a9e16e0194e907a — Purifier's Assault does not boost a Challenge (no attacker), unless the unit is already attacking", () => {
  test("setup: the equipped Duelist carries Assault (from Purifier) but, sitting in base, is no attacker — it reads 5 Might (3 + Doran's 2)", async () => {
    const game = await board().build();
    expect(game.state("duelist").attachments).toEqual(["blade"]);
    expect(game.state("duelist").keywords).toContain("Assault");
    expect(game.state("duelist").combatRole).not.toBe("attacker");
    expect(game.state("duelist").might).toBe(5);
  });

  test("Challenge from base: Duelist deals only 5 to the 6-Might Bystander (it survives with 5 damage) — no Assault, Challenge is not combat", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["duelist", "bystander"] });
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("bystander")).toBe("base");
    expect(game.state("bystander").damage).toBe(5);
    expect(game.zoneOf("duelist")).toBe("trash"); // took 6 ≥ 5
    expect(game.state("duelist").combatRole ?? null).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  // Expected (ruling nuance): while the Duelist IS an attacker (mid-combat at bf1) its Assault is live — 6 Might — so a
  // Challenge cast during that showdown has it deal 6 and the 6-Might Bystander dies. Actual (engine): the Duelist shows
  // 6 Might as an attacker, but Challenge's mutual damage ignores the Assault bonus and deals 5 — Bystander survives.
  test("ruling 6a9e16e0194e907a — engine drops the attacker's Assault bonus from Challenge damage cast mid-combat", async () => {
    const game = await board().build();
    await game.p1.move("duelist", "bf1");
    expect(game.state("duelist")).toMatchObject({ combatRole: "attacker", might: 6 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("challenge", { targets: ["duelist", "bystander"] });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("bystander")).toBe("trash"); // 6 damage from the Assault-boosted attacker
  });
});
