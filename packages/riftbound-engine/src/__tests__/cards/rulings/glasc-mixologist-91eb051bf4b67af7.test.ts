/**
 * Ruling 91eb051bf4b67af7 — Glasc Mixologist (SFD-165 → sfd-165-221) · 5 Might "[Deathknell] — You may play a unit with cost no more
 *     than [3] and no more than [rainbow] from your trash, ignoring its cost."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · [3][order] 3 Might "Your [Deathknell] effects trigger an additional time."
 *   (+ The Ruination unl-180-219 "Kill all units." to kill both Mixologists in one instruction.)
 *
 * Q: Several Mixologists die at once. Can the first Deathknell bring Karthus back from the trash so that Karthus adds extra
 *    triggers to the other Deathknells already on the chain?
 * A: No. Deathknell triggers are created (and counted) at the moment of death from the board as it was then; Karthus was in the
 *    trash, so each Mixologist triggers exactly once. Playing Karthus during resolution does not retroactively add triggers.
 * Rules: 808.1.d.2 (Deathknell triggers added before the units leave), 383 (trigger count fixed when triggered), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC = "sfd-165-221";
const KARTHUS = "ogn-236-298";
const THE_RUINATION = "unl-180-219";
const SKULKER = "ogn-175-298"; // [3] vanilla — a legal Deathknell play
const PEBBLE = { cardType: "unit", energyCost: 1, might: 2, name: "Pebble" }; // a third legal play, so a phantom 3rd trigger would be visible

/** P1's turn with exactly [9] + order×3. Two Mixologists in P1's base; trash: Karthus, Skulker, Pebble. P2's Watcher at bf1 dies too (irrelevant). */
function board() {
  return scenario()
    .turn(5)
    .resources(P1, { energy: 9, power: { order: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Watcher" }, "watcher")
    .unit(P1, "base", GLASC, "glascA")
    .unit(P1, "base", GLASC, "glascB")
    .trash(P1, KARTHUS, "karthus")
    .trash(P1, SKULKER, "skulker")
    .trash(P1, PEBBLE, "pebble")
    .hand(P1, THE_RUINATION, "ruin");
}

const pickKeys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

async function passRound(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

/** Cast The Ruination and resolve it: both Mixologists (and the Watcher) die in ONE instruction. Stops at P1's first Deathknell opt-in. */
async function ruination(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ruin");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("glascA")).toBe("trash");
  expect(game.zoneOf("glascB")).toBe("trash");
  expect(game.zoneOf("watcher")).toBe("trash");
  expect(game.zoneOf("karthus")).toBe("trash"); // Karthus was NOT on the board at the moment of death
  return game;
}

describe("Ruling 91eb051bf4b67af7 — Karthus revived by one Mixologist's Deathknell cannot multiply the others already on the chain", () => {
  test("simultaneous death with Karthus in the trash: exactly TWO Deathknell items exist (one per Mixologist), each asking P1's 'you may'", async () => {
    const game = await ruination();
    await game.acceptTriggerOrder();
    const knells = game.chain().filter((c) => (c.cardId === "glascA" || c.cardId === "glascB") && c.triggered);
    expect(knells).toHaveLength(2);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.chain().filter((c) => c.triggered)).toHaveLength(2);
  });

  test("first resolution plays Karthus from the trash — he is on the board now — yet the chain still holds exactly ONE remaining Deathknell; it resolves once (Skulker) and the Pebble is never offered a third time", async () => {
    const game = await ruination();
    await game.acceptTriggerOrder();
    await game.p1.yes();
    await game.p1.yes();
    await passRound(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickKeys(game.decision()).toSorted()).toEqual(["karthus", "pebble", "skulker"]);
    await game.p1.pick("karthus");
    if (pickKeys(game.decision()).includes("base")) {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("base");
    }
    expect(game.zoneOf("karthus")).toBe("base"); // Karthus, Eternal is in play …
    expect(game.chain().filter((c) => c.triggered)).toHaveLength(1); // … but adds nothing to what was already triggered
    await passRound(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickKeys(game.decision()).toSorted()).toEqual(["pebble", "skulker"]);
    await game.p1.pick("skulker");
    if (pickKeys(game.decision()).includes("base")) {
      await game.p1.pick("base");
    }
    await passRound(game);
    const end = await game.settle();
    expect(end.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.zoneOf("pebble")).toBe("trash"); // no third Deathknell resolution ever happened
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // both plays ignored their costs
    expect(game.violations()).toEqual([]);
  });

  test("control: with Karthus ALREADY on the board (in base, so The Ruination kills him too — but he is there at the moment of death) each Mixologist's Deathknell is created twice: four items", async () => {
    const game = await scenario()
      .turn(5)
      .resources(P1, { energy: 9, power: { order: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Watcher" }, "watcher")
      .unit(P1, "base", GLASC, "glascA")
      .unit(P1, "base", GLASC, "glascB")
      .unit(P1, "base", KARTHUS, "karthus")
      .trash(P1, SKULKER, "skulker")
      .hand(P1, THE_RUINATION, "ruin")
      .build();
    await game.p1.cast("ruin");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.acceptTriggerOrder();
    expect(game.zoneOf("glascA")).toBe("trash");
    const knells = game.chain().filter((c) => (c.cardId === "glascA" || c.cardId === "glascB") && c.triggered);
    expect(knells).toHaveLength(4);
  });
});
