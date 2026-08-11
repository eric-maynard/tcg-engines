/**
 * Interaction: Jayce, Man of Progress (sfd-084-221) × Helm of Suppression (ven-045-166) × Ornn's Forge (sfd-213-221)
 *   + Sun Disc (ogn-021-298, gear 2+[fury]) and a Gold gear token (sfd-t03).
 *
 *   Jayce (unit, 4): "When you play me, you may kill a friendly gear. If you do, you may play a gear with
 *     Energy cost no more than [7] from hand this turn, ignoring its Energy cost. (You must still pay its
 *     Power cost.)"
 *   Helm of Suppression (gear, 4+[calm]).
 *   Ornn's Forge (battlefield): "While you control this battlefield, the first friendly non-token gear
 *     played each turn costs [1] less."
 *
 * Question: P1 controls the Forge and a Gold token; plays Jayce killing the Gold. In which order should
 * Helm (via Jayce) and Sun Disc (normally) be played, what does each cost, does a 0-energy Helm still burn
 * the Forge's once-per-turn discount, is the permission single-use / this turn only, and does killing the
 * Gold add anything to the pool?
 *
 * Rules: 356.1.b.2 (ignore Energy cost → base energy 0, power still due), 356.1.b.3, 356.4 (discounts),
 * 356.6 (never below 0), 206 (printed cost is what "Energy cost no more than [7]" reads), 429.4.a (a
 * killed Gold never activated its [Add]), 317.2 (this-turn permission lapses), 419.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const JAYCE = "sfd-084-221";
const HELM = "ven-045-166";
const SUN_DISC = "ogn-021-298";
const FORGE = "sfd-213-221";
const GOLD = "sfd-t03";
/** Printed 8 — the Forge would make it 7, but Jayce's gate reads the PRINTED cost (rule 206). */
const EIGHT = { abilities: [], cardType: "gear", domain: "mind", energyCost: 8, name: "Eight-Cost Contraption", rulesText: "" };

/** P1: 10 energy, 1 calm, 1 fury; controls Ornn's Forge (live) via Holder; Gold token in base; Jayce/Helm/Disc in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { calm: 1, fury: 1 } })
    .battlefield("forge", { controller: P1, def: FORGE, inert: false })
    .unit(P1, "forge", { might: 2, name: "Holder" }, "holder")
    .gear(P1, GOLD, "gold")
    .hand(P1, JAYCE, "jayce")
    .hand(P1, HELM, "helm")
    .hand(P1, SUN_DISC, "disc");
}

/** Play Jayce (10 → 6 energy), accept the optional kill; the Gold is the lone friendly gear (auto-bound or picked). */
async function jayceKillsGold(game: Game): Promise<void> {
  await game.p1.play("jayce");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "jayce" } });
  await game.p1.yes();
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("gold");
    await game.settle();
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

async function jayceDeclines(game: Game): Promise<void> {
  await game.p1.play("jayce");
  await game.settle();
  await game.p1.no();
  await game.settle();
}

function waiverVariants(game: Game, card: string): unknown[] {
  return (game.p1.option("playGear", card)?.variants ?? [])
    .map((v) => v.params.useEnergyWaiver)
    .sort((a, b) => String(a).localeCompare(String(b)));
}

describe("Jayce × Helm of Suppression × Ornn's Forge — first-gear ordering", () => {
  test("(e) killing the Gold for Jayce is a kill by effect, not its [Add] activation: pool unchanged apart from Jayce's 4 (429.4.a)", async () => {
    const game = await board().build();
    await jayceKillsGold(game);
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.zoneOf("jayce")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 6, power: { calm: 1, fury: 1 } });
  });

  test("(b, menu) while the permission is unused BOTH gear offer a plain and a via-Jayce variant", async () => {
    const game = await board().build();
    await jayceKillsGold(game);
    expect(waiverVariants(game, "helm")).toEqual([false, true]);
    expect(waiverVariants(game, "disc")).toEqual([false, true]);
  });

  test("(a) Helm via Jayce as the FIRST gear: 0 energy (Forge's [1] has nothing to reduce, can't touch the pip) + [calm]; Sun Disc second pays full 2 + [fury]", async () => {
    const game = await board().build();
    await jayceKillsGold(game);
    await game.p1.playGear("helm", { params: { useEnergyWaiver: true } });
    await game.settle();
    expect(game.zoneOf("helm")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 6, power: { calm: 0, fury: 1 } });
    // Helm WAS the first friendly non-token gear this turn → the Forge slot is spent; Disc pays 2 + fury.
    await game.p1.play("disc");
    await game.settle();
    expect(game.zoneOf("disc")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 0, fury: 0 } });
    // Turn total after Jayce: 2 energy + calm + fury.
    expect(game.violations()).toEqual([]);
  });

  test("(b) reverse order is one cheaper: Sun Disc plain first = 2−1 (Forge) = 1 + [fury]; then Helm via Jayce = 0 + [calm]", async () => {
    const game = await board().build();
    await jayceKillsGold(game);
    await game.p1.playGear("disc", { params: { useEnergyWaiver: false } });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { calm: 1, fury: 0 } });
    // Permission still unused → Helm still shows both variants.
    expect(waiverVariants(game, "helm")).toEqual([false, true]);
    await game.p1.playGear("helm", { params: { useEnergyWaiver: true } });
    await game.settle();
    expect(game.zoneOf("helm")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { calm: 0, fury: 0 } });
    // Turn total after Jayce: 1 energy + calm + fury.
  });

  test("(b, enumerated == accepted) each offered variant charges exactly its price: Disc via Jayce 0+[fury]; Helm plain as first gear 3+[calm]; Helm plain as second gear 4+[calm]", async () => {
    // Disc via Jayce: 0 energy + fury.
    const g1 = await board().build();
    await jayceKillsGold(g1);
    await g1.p1.playGear("disc", { params: { useEnergyWaiver: true } });
    await g1.settle();
    expect(g1.p1.resources()).toEqual({ energy: 6, power: { calm: 1, fury: 0 } });
    // ...and the permission is now spent: Helm plain only, as SECOND gear → full 4 + calm.
    expect(waiverVariants(g1, "helm")).toEqual([undefined]);
    await g1.p1.play("helm");
    await g1.settle();
    expect(g1.p1.resources()).toEqual({ energy: 2, power: { calm: 0, fury: 0 } });

    // Helm plain as FIRST gear with the permission pending: 4 − 1 = 3 + calm; permission survives for Disc.
    const g2 = await board().build();
    await jayceKillsGold(g2);
    await g2.p1.playGear("helm", { params: { useEnergyWaiver: false } });
    await g2.settle();
    expect(g2.p1.resources()).toEqual({ energy: 3, power: { calm: 0, fury: 1 } });
    expect(waiverVariants(g2, "disc")).toEqual([false, true]);
  });

  test("(b, pool-exact) with exactly 0 energy after Jayce, Helm is playable ONLY via Jayce and Disc ONLY via Jayce (plain Disc needs 1)", async () => {
    const game = await board().resources(P1, { energy: 4 }).build();
    await jayceKillsGold(game);
    expect(game.p1.energy()).toBe(0);
    expect(waiverVariants(game, "helm")).toEqual([true]);
    expect(waiverVariants(game, "disc")).toEqual([true]);
    await expect(game.p1.playGear("disc", { params: { useEnergyWaiver: false } })).rejects.toThrow();
    await game.p1.do("addResources", { energy: 1 });
    expect(waiverVariants(game, "disc")).toEqual([false, true]); // 1 energy covers plain Disc (2−1)
    expect(waiverVariants(game, "helm")).toEqual([true]); // plain Helm needs 3
  });

  test("(c) Jayce declines the kill: no permission — Helm first 4−1 = 3 + [calm], Sun Disc second 2 + [fury]", async () => {
    const game = await board().build();
    await jayceDeclines(game);
    expect(game.zoneOf("gold")).toBe("base");
    expect(waiverVariants(game, "helm")).toEqual([undefined]); // single plain variant, no waiver param
    await game.p1.play("helm");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 0, fury: 1 } });
    await game.p1.play("disc");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0, fury: 0 } });
    expect(game.p1.gear().sort()).toEqual(["disc", "gold", "helm"]);
  });

  test("(c') Jayce with NO friendly gear at all: nothing to kill, no permission — Helm 3 + [calm] as first gear", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10, power: { calm: 1, fury: 1 } })
      .battlefield("forge", { controller: P1, def: FORGE, inert: false })
      .unit(P1, "forge", { might: 2, name: "Holder" }, "holder")
      .hand(P1, JAYCE, "jayce")
      .hand(P1, HELM, "helm")
      .hand(P1, SUN_DISC, "disc")
      .build();
    await game.p1.play("jayce");
    await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no") {
      await (d.canAccept === false ? game.p1.no() : game.p1.yes());
      await game.settle();
    }
    expect(game.decision()?.kind).toBe("action");
    expect(waiverVariants(game, "helm")).toEqual([undefined]);
    await game.p1.play("helm");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 0, fury: 1 } });
  });

  test("(d) single-use: after Helm via Jayce, Sun Disc shows only its plain variant", async () => {
    const game = await board().build();
    await jayceKillsGold(game);
    await game.p1.playGear("helm", { params: { useEnergyWaiver: true } });
    await game.settle();
    expect(waiverVariants(game, "disc")).toEqual([undefined]);
    await expect(game.p1.playGear("disc", { params: { useEnergyWaiver: true } })).rejects.toThrow();
  });

  test("(d) this turn only: an UNUSED permission lapses at end of turn (317.2) — next P1 turn Helm needs real energy (3 with a fresh Forge slot)", async () => {
    const game = await board().build();
    await jayceKillsGold(game);
    expect(waiverVariants(game, "helm")).toEqual([false, true]);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.forge?.controller).toBe(P1);
    await game.p1.do("addResources", { power: { calm: 1 } });
    expect(game.p1.can("play", "helm")).toBe(false); // 0 energy, no waiver any more
    await game.p1.do("addResources", { energy: 3 }); // 4 − 1 (first gear of the new turn)
    expect(waiverVariants(game, "helm")).toEqual([undefined]);
    await game.p1.play("helm");
    await game.settle();
    expect(game.zoneOf("helm")).toBe("base");
    expect(game.p1.resources().energy).toBe(0);
  });

  test("(e) the ≤[7] gate reads PRINTED energy (206): an 8-cost gear the Forge would make 7 gets no via-Jayce variant; Helm (printed 4) does", async () => {
    const game = await board().hand(P1, EIGHT, "eight").build();
    await jayceKillsGold(game);
    expect(waiverVariants(game, "helm")).toEqual([false, true]);
    // 6 energy < 8−1 = 7 → not even the plain variant is affordable; top up to exactly 7.
    await game.p1.do("addResources", { energy: 1 });
    expect(waiverVariants(game, "eight")).toEqual([undefined]);
    await game.p1.play("eight");
    await game.settle();
    expect(game.zoneOf("eight")).toBe("base");
    expect(game.p1.energy()).toBe(0); // paid 7 (8 − Forge), permission untouched
    expect(waiverVariants(game, "helm")).toEqual([true]); // still free via Jayce (0 energy left, calm in pool)
  });

  test("Jayce himself (a unit) never interacts with the Forge: pays his printed 4", async () => {
    const game = await board().build();
    await game.p1.play("jayce");
    expect(game.p1.energy()).toBe(6);
  });
});
