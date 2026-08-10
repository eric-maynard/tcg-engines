/**
 * Ruling 30e146b0ef9fe37a — Rockfall Path (SFD-216 → sfd-216-221) Battlefield: "Units can't be played here."
 *   × a [Hidden] unit (Pakaa Cub, ogn-135-298 — vanilla 3-Might "[Hidden]") hidden facedown there.
 *   Nuance cards: Ravenbloom Student (OGN-103 → ogn-103-298 "When you play a spell, give me +1 [Might] this turn"),
 *   Darius, Trifarian (OGN-027 → ogn-027-298), with Temporal Breach (ven-066-166) as the "play a unit there" spell.
 *
 * Q: What happens when a Hidden UNIT is hidden at Rockfall Path and its controller later tries to play it?
 * A: Hiding it is legal. Playing it from facedown is illegal (a hidden permanent must be played to that
 *    battlefield, and units can't be played there) — the card stays hidden and is trashed when control of the
 *    battlefield is lost. Nuance: a spell that would play a unit to Rockfall Path simply doesn't (resolves to no
 *    effect) but is still a played spell — Ravenbloom Student still triggers.
 * Rules: 811.1.b / 811.1.d.1 (Hide; hidden permanent plays to THAT battlefield), 358.3.a / 359.3.e.6 (impossible
 *        instruction skipped), 359.3.e.10 (spell still counts as played), 323.7 / 466.5.c (hidden card trashed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ROCKFALL_PATH = "sfd-216-221";
const PAKAA_CUB = "ogn-135-298"; // 3-Might unit, "[Hidden]" only
const RAVENBLOOM_STUDENT = "ogn-103-298";
const TEMPORAL_BREACH = "ven-066-166"; // 2 + [mind]: Banish a unit, then its owner plays it to the same location, ignoring its cost.

/**
 * P1's turn 2. bf1 = Rockfall Path (live), held by P1's 2-Might Holder. P1: Pakaa Cub in hand, 3 energy + 1 rainbow
 * (enough to hide it OR hard-cast it). P2: an 8-Might Crusher in base to take the Path later.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1, def: ROCKFALL_PATH, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 8, name: "Crusher" }, "crusher")
    .hand(P1, PAKAA_CUB, "cub");
}

/** P1 hides the Cub at Rockfall Path, then the turn goes round to P1 again (hidden cards play from the NEXT turn on). */
async function cubHiddenAndATurnLater(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("hide", "cub")).toBe(true);
  await game.p1.hide("cub", "bf1");
  expect(game.zoneOf("cub")).toBe("facedown-bf1");
  expect(game.state("cub").isHidden).toBe(true);
  await game.advanceTurn(); // → P2
  await game.advanceTurn(); // → P1, turn 4
  expect(game.turnPlayer()).toBe(P1);
  expect(game.zoneOf("cub")).toBe("facedown-bf1");
  return game;
}

describe("Ruling 30e146b0ef9fe37a — a Hidden unit at Rockfall Path can be hidden but never played from there", () => {
  test("premise: Rockfall Path is not a legal destination for hard-casting the Cub from hand (base is)", async () => {
    const game = await board().build();
    const dests = game.p1.option("play", "cub")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(dests).toContain("base");
    expect(dests).not.toContain("battlefield-bf1");
    const r = await game.p1.try((p) => p.play("cub", { to: "bf1" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("cub")).toBe("hand");
  });

  test("hiding the Cub facedown at Rockfall Path IS legal (Hide is not Play): it costs [rainbow] and the card sits facedown there", async () => {
    const game = await board().build();
    await game.p1.hide("cub", "bf1");
    expect(game.zoneOf("cub")).toBe("facedown-bf1");
    expect(game.p1.facedown("bf1")).toEqual(["cub"]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]); // hiding opens no chain
    expect(game.violations()).toEqual([]);
  });

  test("on a later turn the hidden Cub still can't be played: revealing/playing it from facedown is not a legal action, a forced attempt is rejected, and it stays hidden", async () => {
    const game = await cubHiddenAndATurnLater();
    expect(game.p1.can("reveal", "cub")).toBe(false);
    expect(game.p1.can("playFrom", "cub")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("cub"));
    expect(r.ok).toBe(false);
    // "The play is rewound": nothing changed.
    expect(game.zoneOf("cub")).toBe("facedown-bf1");
    expect(game.state("cub").isHidden).toBe(true);
    expect(game.p1.units("bf1")).toEqual(["holder"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast: the same hidden Cub at an ORDINARY battlefield is playable from facedown on the later turn (so the block above is Rockfall Path's doing)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 8, name: "Crusher" }, "crusher")
      .hand(P1, PAKAA_CUB, "cub")
      .build();
    await game.p1.hide("cub", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.p1.can("reveal", "cub")).toBe(true);
    await game.p1.reveal("cub");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(0); // played ignoring its base cost
  });

  test("the stuck Cub is trashed when P1 loses control of Rockfall Path (P2's Crusher conquers it)", async () => {
    const game = await cubHiddenAndATurnLater();
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("crusher", "bf1");
    await game.settle(); // showdown → combat: 8 vs 2, Holder dies, P2 conquers
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("cub")).toBe("trash");
    expect(game.p1.trash()).toContain("cub");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: a spell that would play a unit to Rockfall Path (Temporal Breach on the Holder) resolves to no effect for that instruction — Holder stays banished — yet it still counts as a played spell: Ravenbloom Student gets +1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1, def: ROCKFALL_PATH, inert: false })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
      .hand(P1, TEMPORAL_BREACH, "breach")
      .build();
    expect(game.state("student").might).toBe(2);
    await game.p1.cast("breach", { answers: ["holder"] });
    let stop = await game.settle();
    if (stop.reason === "unanswered" && game.decision()?.seat === P1) {
      await game.p1.pick("holder");
      stop = await game.settle({ policy: "first" });
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("breach")).toBe("trash");
    // The play-to-Rockfall instruction was skipped: Holder is banished, not on bf1, not in hand.
    expect(game.zoneOf("holder")).toBe("banishment");
    expect(game.p1.units("bf1")).toEqual([]);
    // …but the spell was played and resolved: Ravenbloom Student triggered.
    expect(game.state("student").might).toBe(3);
  });
});
