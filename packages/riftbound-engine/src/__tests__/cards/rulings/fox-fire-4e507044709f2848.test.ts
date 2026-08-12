/**
 * Ruling 4e507044709f2848 — Fox-Fire (OGN-256 → ogn-256-298)
 *   "[Hidden] [Action] Kill any number of units at a battlefield with total Might 4 or less."
 *   × En Garde (ogn-046-298) "[Reaction] Give a friendly unit +1 [Might] this turn, +1 more if it is
 *     the only unit you control there."
 *
 * Q: Can Fox-Fire be played with ZERO targets (e.g. from hiding at a battlefield with nothing legal)?
 * A: Yes — "any number of" may be zero, so the spell is playable with no legal target at all.
 *    Every unit that IS chosen must die on resolution (there is no "may"); and if Mights rise between
 *    choosing and resolving so the group busts the 4-Might cap, the caster crosses off targets until it fits.
 * Rules: 355.13 (an "any number"/"up to" set may be empty), 355.8, 355.11.b (aggregate cap re-pick).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FOX_FIRE = "ogn-256-298";
const EN_GARDE = "ogn-046-298";

const targetsField = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  game.p1.option("cast", "fox")?.fields.find((f) => f.name === "targets");

describe("Ruling 4e507044709f2848 — Fox-Fire may be cast choosing zero units", () => {
  test("no legal target anywhere (only a 5-Might unit) ⇒ Fox-Fire is STILL castable, with the empty set as its only choice", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
      .hand(P1, FOX_FIRE, "fox")
      .build();

    expect(game.p1.can("cast", "fox")).toBe(true);
    const field = targetsField(game);
    expect(field?.min).toBe(0);
    expect(field?.options).toEqual([[]]); // only "choose nothing"

    await game.p1.cast("fox"); // no `targets` needed — the empty set is forced
    expect(game.chain().map((c) => c.cardId)).toEqual(["fox"]);
    await game.settle();
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.state("big").damage).toBe(0);
    expect(game.zoneOf("fox")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("legal targets exist but the caster picks none ⇒ the spell still resolves and nothing dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P2, "bf1", { might: 2, name: "B" }, "b")
      .hand(P1, FOX_FIRE, "fox")
      .build();

    // The empty set is offered alongside every legal subset that fits under 4 total Might.
    expect(targetsField(game)?.options).toEqual([[], ["a"], ["a", "b"], ["b"]]);

    await game.p1.cast("fox", { targets: [] });
    await game.settle();
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
    expect(game.zoneOf("fox")).toBe("trash");
  });

  test("units chosen must die — a 2+2 pair is killed outright, with no per-unit 'may' at resolution", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P2, "bf1", { might: 2, name: "B" }, "b")
      .hand(P1, FOX_FIRE, "fox")
      .build();

    await game.p1.cast("fox", { targets: ["a", "b"] });
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
  });

  test("Mights rise before resolution so the group busts 4 total ⇒ the caster crosses targets off (355.11.b subset re-pick)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P2, "bf1", { might: 2, name: "B" }, "b")
      .hand(P1, FOX_FIRE, "fox")
      .hand(P2, EN_GARDE, "engarde")
      .build();

    await game.p1.cast("fox", { targets: ["a", "b"] });
    await game.p1.passPriority();
    await game.p2.cast("engarde", { targets: "a" });
    while (game.chain().length > 1) {
      await game.acting().passPriority();
    }
    expect(game.state("a").might).toBe(3); // not alone at bf1, so only +1
    expect(game.state("b").might).toBe(2); // group is now 5 > 4

    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "subset", min: 0 });
    // Only the ORIGINAL targets may be kept.
    expect((d as { options: { card?: string }[] }).options.map((o) => o.card).sort()).toEqual(["a", "b"]);

    await game.p1.pick("b"); // keep only B — 2 Might, back under the cap
    await game.settle();
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
