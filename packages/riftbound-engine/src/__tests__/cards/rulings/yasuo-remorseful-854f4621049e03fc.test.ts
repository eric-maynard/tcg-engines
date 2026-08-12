/**
 * Ruling 854f4621049e03fc — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · Calm · [6][calm][calm] · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Charm (OGN-043 → ogn-043-298) · Spell · Calm · [1][calm] · "Move an enemy unit."
 *
 * Q: Does Charming an enemy Yasuo into a battlefield on MY turn trigger his attack ability?
 * A: Yes — he is the one attacking, so his own "When I attack" triggers (for his controller, who then picks the
 *    target among units enemy to HIM). Nuance: the ability needs him to be "here" when it resolves; if he is
 *    pushed back to base after the trigger is on the chain but before it resolves, it deals no damage.
 * Rules: 464.2.c.3 (the unit that contests is the attacker), 383.3 (the trigger belongs to its controller),
 *        359.3.f.1–2 ("here" is read on execution; a null referent means the instruction is ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const CHARM = "ogn-043-298";
/** Inline [Reaction] used only to shove an enemy unit home mid-chain (no printed card does exactly this). */
const SHOVE = {
  abilities: [{ effect: { target: { controller: "enemy", type: "unit" }, to: "base", type: "move" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Test Shove",
  timing: "reaction",
} as const;

/** P1's turn. P1 holds bf1 with a 9-Might Ward; P2's Yasuo (6) sits in P2's base. P1: Charm + Shove, [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 9, name: "Ward" }, "ward")
    .unit(P2, "base", YASUO, "yasuo")
    .hand(P1, CHARM, "charm")
    .hand(P1, SHOVE, "shove");
}

/** P1 Charms Yasuo into bf1; Charm resolves and Yasuo's attack trigger goes on the chain. */
async function charmYasuoIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "yasuo", answers: ["bf1"] });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Charm resolves
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("battlefield-bf1");
  }
  expect(game.zoneOf("charm")).toBe("trash");
  expect(game.locationOf("yasuo")).toBe("bf1");
  return game;
}

describe("Ruling 854f4621049e03fc — a Charmed Yasuo is attacking, so his attack trigger fires", () => {
  test("Charm drags Yasuo to bf1 and he is designated the ATTACKER there, even though it is P1's turn and he is P2's unit", async () => {
    const game = await charmYasuoIn();
    expect(game.state("yasuo")).toMatchObject({ combatRole: "attacker", controller: P2 });
    expect(game.state("ward").combatRole).toBe("defender");
  });

  test("his 'When I attack' trigger is on the chain and it is P2's — his controller's — item", async () => {
    const game = await charmYasuoIn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P2, triggered: true })]);
  });

  test("it resolves for his Might into the unit that is enemy to HIM: P1's Ward takes 6", async () => {
    const game = await charmYasuoIn();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("ward").damage).toBe(6);
    expect(game.zoneOf("ward")).toBe("battlefield-bf1"); // 9 Might survives
  });

  test("nuance — Yasuo is shoved home before the trigger resolves: he is no longer 'here', so it deals nothing", async () => {
    const game = await charmYasuoIn();
    await game.p2.passPriority();
    expect(game.p1.can("cast", "shove")).toBe(true);
    await game.p1.cast("shove", { targets: "yasuo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "shove"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Shove resolves
    expect(game.locationOf("yasuo")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]); // the trigger is still there
    await game.acting().passPriority();
    await game.acting().passPriority(); // the attack trigger resolves into nothing
    expect(game.chain()).toEqual([]);
    expect(game.state("ward").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
