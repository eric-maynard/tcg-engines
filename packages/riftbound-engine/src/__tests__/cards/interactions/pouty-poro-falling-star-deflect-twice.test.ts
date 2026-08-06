/**
 * Interaction: Pouty Poro (ogn-013-298) "[Deflect] (Opponents must pay [rainbow] to choose me
 *   with a spell or ability.)" — 2-Might Fury unit
 *   × Falling Star (ogn-029-298) "Deal 3 to a unit. / Deal 3 to a unit." — 2 energy + [fury][fury]
 *
 * Rules: 809.1.c (Deflect = "+[1] power ... for EACH TIME they choose me"), 809.1.c.1 (that
 * power may be of ANY domain), 809.1.d + 356.2.a.2 (it is a Mandatory Additional Cost),
 * 355.8 (a spell cannot be put on the chain unless valid — i.e. payable — choices exist for
 * every target).
 *
 * Question: P2 has Pouty Poro + a vanilla 3-Might unit; P1 has their own Pouty Poro and plays
 * Falling Star.
 *   (a) enemy Poro for BOTH instructions → +2 power (any domain); Poro takes 6 and dies.
 *   (b) enemy Poro once + vanilla once  → +1 power; each takes 3.
 *   (c) P1's OWN Poro for both           → +0 (Deflect only taxes opponents).
 *   (d) with exactly 2 fury and nothing else, (a)/(b) are unpayable → not legal / not offered,
 *       while (c) and "vanilla twice" are legal.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const POUTY_PORO = "ogn-013-298";
const FALLING_STAR = "ogn-029-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Every target tuple the cast option offers (each entry = one legal `targets` value). */
function targetTuples(game: Game, alias: string): string[][] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).map((v) => (Array.isArray(v) ? [...v] : [v]) as string[]);
}

function targetsOffered(game: Game, alias: string): string[] {
  return [...new Set(targetTuples(game, alias).flat())];
}

/** P1: 2 energy + 2 fury (Falling Star's base cost) plus `extra` spare power of another domain. */
function board(extra: Record<string, number> = { calm: 2 }) {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2, ...extra } })
    .unit(P2, "base", POUTY_PORO, "theirPoro")
    .unit(P2, "base", { might: 3, name: "Vanilla" }, "vanilla")
    .unit(P1, "base", POUTY_PORO, "myPoro")
    .hand(P1, FALLING_STAR, "fs");
}

describe("Pouty Poro × Falling Star — Deflect is paid per choice", () => {
  test("choosing the enemy Poro (once) costs exactly +1 power, payable from ANY domain (809.1.c.1)", async () => {
    const game = await board({ calm: 2 }).build();
    await game.p1.cast("fs", { targets: "theirPoro" });
    // Base cost 2 energy + fury fury, plus 1 calm for Deflect (fury spell, fury Poro, calm power is fine).
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, calm: 1 } });
    await game.settle();
    expect(game.zoneOf("theirPoro")).toBe("trash"); // 3 damage ≥ 2 Might
    expect(game.zoneOf("fs")).toBe("trash");
  });

  test("(a) enemy Poro chosen for BOTH instructions costs +2 power and takes 3+3 (engine exposes only one target slot for Falling Star)", async () => {
    // Expected (809.1.c "for each time they choose me"): two choices of the same Deflect unit = +2.
    // Actual: Falling Star's second "Deal 3 to a unit" is never offered, so a 2-tuple is rejected.
    const game = await board({ calm: 2 }).build();
    await game.p1.cast("fs", { targets: ["theirPoro", "theirPoro"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, calm: 0 } });
    await game.settle();
    expect(game.zoneOf("theirPoro")).toBe("trash");
    expect(game.state("vanilla").damage).toBe(0);
    expect(game.zoneOf("myPoro")).toBe("base");
  });

  test("(b) enemy Poro for one instruction + vanilla for the other costs +1 power; each takes 3 (second instruction not implemented)", async () => {
    // Expected: one Deflect choice = +1 calm; Poro (2 Might) dies, vanilla (3 Might) takes 3 and dies.
    // Actual: two-target cast is rejected — only the first instruction exists in the engine.
    const game = await board({ calm: 2 }).build();
    await game.p1.cast("fs", { targets: ["theirPoro", "vanilla"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, calm: 1 } });
    await game.settle();
    expect(game.zoneOf("theirPoro")).toBe("trash");
    expect(game.zoneOf("vanilla")).toBe("trash");
  });

  test("(c) P1's OWN Poro is chosen at no extra cost — Deflect only taxes spells an OPPONENT controls", async () => {
    const game = await board({}).build(); // exactly 2 fury, nothing spare
    expect(targetsOffered(game, "fs")).toContain("myPoro");
    await game.p1.cast("fs", { targets: "myPoro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("myPoro")).toBe("trash");
  });

  test("(c) own Poro for BOTH instructions costs +0 and takes 6 (second instruction not implemented)", async () => {
    // Expected: no Deflect tax at all for the controller; both instructions hit myPoro.
    // Actual: the 2-tuple target is not a legal variant.
    const game = await board({}).build();
    await game.p1.cast("fs", { targets: ["myPoro", "myPoro"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("myPoro")).toBe("trash");
    expect(game.zoneOf("theirPoro")).toBe("base");
  });

  test("(d) with exactly 2 fury and no other power, the enemy Poro is NOT a legal choice (cost unpayable, 355.8) — own Poro and the vanilla unit are", async () => {
    const game = await board({}).build();
    const offered = targetsOffered(game, "fs");
    expect(offered).toContain("myPoro");
    expect(offered).toContain("vanilla");
    expect(offered).not.toContain("theirPoro");
    // Neither a single choice nor a double choice of the enemy Poro can be finalized.
    await expect(game.p1.cast("fs", { targets: "theirPoro" })).rejects.toThrow();
    await expect(game.p1.cast("fs", { targets: ["theirPoro", "theirPoro"] })).rejects.toThrow();
    await expect(game.p1.cast("fs", { targets: ["theirPoro", "vanilla"] })).rejects.toThrow();
    expect(game.zoneOf("fs")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });
  });

  test("(d) with exactly 2 fury, 'vanilla unit twice' is a legal casting (second instruction not implemented)", async () => {
    // Expected: no Deflect involved, base cost is exactly payable → legal; vanilla takes 6 and dies.
    // Actual: no 2-tuple variants are ever offered for Falling Star.
    const game = await board({}).build();
    expect(targetTuples(game, "fs")).toContainEqual(["vanilla", "vanilla"]);
    await game.p1.cast("fs", { targets: ["vanilla", "vanilla"] });
    await game.settle();
    expect(game.zoneOf("vanilla")).toBe("trash");
  });

  test("(d) with 2 fury + only 1 spare power, the enemy Poro is affordable once (offered) — but never twice", async () => {
    const game = await board({ calm: 1 }).build();
    expect(targetsOffered(game, "fs")).toContain("theirPoro");
    // Two Deflect choices would need +2; only 1 spare power exists → must be rejected.
    await expect(game.p1.cast("fs", { targets: ["theirPoro", "theirPoro"] })).rejects.toThrow();
    expect(game.zoneOf("fs")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2, calm: 1 } });
  });
});
