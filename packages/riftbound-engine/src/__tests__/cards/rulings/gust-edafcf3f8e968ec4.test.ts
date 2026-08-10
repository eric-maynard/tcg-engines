/**
 * Ruling edafcf3f8e968ec4 — general targeting-timing question, illustrated with:
 *   Gust (OGN-169 → ogn-169-298) · [Reaction] · 1 · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   Alpha Strike (UNL-192 → unl-192-219) · [Action] · 3 + [rainbow] · "Choose a friendly unit. It deals damage equal to its Might split
 *     among enemy units at battlefields. Then for each unit this kills, do this: Gain 1 XP."
 *   Dragon's Rage (OGN-258 → ogn-258-298) · 4 + [rainbow] · "Move an enemy unit. Then do this: Choose another enemy unit at its
 *     destination. They deal damage equal to their Mights to each other."
 *   (Fox-Fire OGN-256 is named as another "targets on play" example.)
 *
 * Q: Why do some spells choose targets on play and others "on resolution"?
 * A: Targets are ALWAYS chosen when the item goes on the chain (locked before the opponent's Reaction window; the spell whiffs
 *    if the target became illegal). Split-damage spells pick recipients on play but the AMOUNTS on resolution. What looks like
 *    "targeting on resolution" is a reflexive "do this:" trigger — a NEW chain item created after the first part resolves,
 *    which chooses its own target when IT is finalized.
 * Rules: 355.5–355.8 (targets at play), 355.4 (move destinations at play), 355.14.e (split amounts on resolution),
 *        386–388 (reflexive triggers), 359.3.e (illegal target → no effect).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const ALPHA_STRIKE = "unl-192-219";
const DRAGONS_RAGE = "ogn-258-298";
const FLASH = "ogs-011-024";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
const targetField = (game: Game, alias: string) => game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");

describe("Ruling edafcf3f8e968ec4 — targets lock on play; split amounts and reflexive 'do this' choices come later", () => {
  // ── Default: targets on play (Gust) ─────────────────────────────────────────────────────────
  test("Gust: the target is a REQUIRED play-time choice; it is recorded on the chain item before P2's reaction window; if P2 Flashes the unit home in response, Gust resolves and whiffs", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Target" }, "t")
      .unit(P2, "bf1", { might: 5, name: "Heavy" }, "heavy")
      .hand(P1, GUST, "gust")
      .hand(P2, FLASH, "flash")
      .build();
    expect(targetField(game, "gust")).toMatchObject({ min: 1, options: [["t"]], required: true });
    await game.p1.cast("gust", { targets: "t" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", targets: ["t"] })]); // locked in
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // opponent reacts AFTER the choice
    await game.p2.cast("flash", { targets: ["t"] });
    await game.settle();
    expect(game.zoneOf("t")).toBe("base"); // moved by Flash, NOT returned to hand
    expect(game.zoneOf("gust")).toBe("trash"); // resolved (whiffed), no re-target onto Heavy
    expect(game.zoneOf("heavy")).toBe("battlefield-bf1");
  });

  // ── Split damage: recipients on play, amounts on resolution (Alpha Strike) ─────────────────
  test("Alpha Strike: the friendly source AND the enemy recipients are chosen as it is played; only the 4-damage SPLIT is asked on resolution (a distribute prompt after both pass)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Hero" }, "hero")
      .unit(P2, "bf1", { might: 3, name: "X" }, "x")
      .unit(P2, "bf1", { might: 3, name: "Y" }, "y")
      .hand(P1, ALPHA_STRIKE, "alpha")
      .build();
    const opts = (targetField(game, "alpha")?.options ?? []) as string[][];
    expect(opts).toContainEqual(["hero", "x", "y"]); // recipients are part of the play-time choice
    await game.p1.cast("alpha", { targets: ["hero", "x", "y"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "alpha" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // no amounts asked yet
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, timing: "RES", total: 4 });
    expect(d?.kind === "distribute" ? d.buckets.map((b) => b.key).sort() : []).toEqual(["x", "y"]);
    await game.p1.distribute({ x: 3, y: 1 });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.state("y")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.p1.xp()).toBe(1); // "for each unit this kills, do this: Gain 1 XP"
  });

  // ── Reflexive trigger: Dragon's Rage ─────────────────────────────────────────────────────────
  function rageBoard() {
    return scenario()
      .resources(P1, { energy: 4, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Mover" }, "mover")
      .unit(P2, "bf2", { might: 4, name: "Bruiser" }, "bruiser")
      .unit(P2, "bf2", { might: 2, name: "Runt" }, "runt")
      .hand(P1, DRAGONS_RAGE, "rage");
  }

  test("Dragon's Rage step 1: the enemy unit to move is chosen ON PLAY and sits on the chain item while P2 has its reaction window; the 'another enemy unit' is NOT asked yet", async () => {
    const game = await rageBoard().build();
    expect(targetField(game, "rage")).toMatchObject({ min: 1, required: true });
    await game.p1.cast("rage", { targets: "mover" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf2"); // destination, if asked at play (355.4)
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rage", targets: ["mover"], triggered: false })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.locationOf("mover")).toBe("bf1");
  });

  // Expected (ruling step 1 / rule 355.4): the Move DESTINATION is also a play-time choice, made before anyone gets priority
  // (as the engine already does for Charm). Actual: for Dragon's Rage the destination prompt only appears as the spell
  // RESOLVES (timing RES, after both players passed).
  test.failing("BUG: ruling edafcf3f8e968ec4 — Dragon's Rage asks the move destination on resolution instead of on play (355.4)", async () => {
    const game = await rageBoard().build();
    await game.p1.cast("rage", { targets: "mover" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
  });

  test("Dragon's Rage steps 2–3: it resolves (Mover moves to bf2) and THEN a NEW triggered chain item appears whose target — another enemy unit at the destination — is chosen at that item's own finalization; P2 gets priority against it; it resolves as a fight", async () => {
    const game = await rageBoard().build();
    await game.p1.cast("rage", { targets: "mover" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf2");
    }
    await game.p1.passPriority();
    await game.p2.passPriority(); // the spell resolves
    if (game.decision()?.kind === "pick" && (game.decision() as { semantics?: string }).semantics === "destination") {
      await game.p1.pick("battlefield-bf2");
    }
    expect(game.locationOf("mover")).toBe("bf2");
    // The reflexive "do this": a separate, TRIGGERED item is now on the chain and asks for ITS target now (FIN, bound to it).
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["bruiser", "runt"]); // "another enemy unit at its destination"
    expect(d?.source?.chainItemId).toBeDefined();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rage", triggered: true })]);
    await game.p1.pick("bruiser");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rage", targets: ["bruiser"], triggered: true })]);
    // It is a real chain item: both players get priority again before it resolves.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    // "They deal damage equal to their Mights to each other": Mover (3) takes 4 and dies; Bruiser (4) takes 3 and lives.
    expect(game.zoneOf("mover")).toBe("trash");
    expect(game.state("bruiser")).toMatchObject({ damage: 3, zone: "battlefield-bf2" });
    expect(game.state("runt").damage).toBe(0);
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
