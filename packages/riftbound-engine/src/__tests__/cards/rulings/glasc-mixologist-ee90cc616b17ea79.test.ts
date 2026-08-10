/**
 * Ruling ee90cc616b17ea79 — Glasc Mixologist (SFD-165 → sfd-165-221) · 5 Might · "[Deathknell] — You may play a unit with cost
 *     no more than [3] and no more than [rainbow] from your trash, ignoring its cost."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · [3][order] · 3 Might · "Your [Deathknell] effects trigger an additional time."
 *   (+ an inline "Kill all friendly units" spell so both Mixologists die in ONE event; Shipyard Skulker ogn-175-298 and an inline
 *    Pebble as further legal Deathknell plays.)
 *
 * Q: Two Mixologists die at the same time; both Deathknells go on the chain; the first to resolve brings back Karthus. Is the
 *    second trigger now affected by Karthus (doubled)?
 * A: No. Trigger counts are locked in from the board at the moment of death; Karthus was in the trash then, so each
 *    Mixologist triggers exactly once. Karthus arriving during the first resolution is too late for the second.
 * Rules: 808.1.d.2 (Deathknell items created at the death), 383 (trigger count fixed when triggered), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC = "sfd-165-221";
const KARTHUS = "ogn-236-298";
const SKULKER = "ogn-175-298";
const PEBBLE = { cardType: "unit", energyCost: 1, might: 2, name: "Pebble" } as const;
/** Inline [Action] "Kill all friendly units." — one instruction, one simultaneous death event. */
const LAST_CALL = {
  abilities: [{ effect: { target: { controller: "friendly", quantity: "all", type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Last Call (inline: kill all friendly units)",
  timing: "action",
} as const;

/** P1's turn with exactly [1]. Two Mixologists in P1's base; P1's trash: Karthus, Skulker, Pebble (all legal ≤[3]/≤[rainbow] plays). */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Onlooker" }, "onlooker")
    .unit(P1, "base", GLASC, "glascA")
    .unit(P1, "base", GLASC, "glascB")
    .trash(P1, KARTHUS, "karthus")
    .trash(P1, SKULKER, "skulker")
    .trash(P1, PEBBLE, "pebble")
    .hand(P1, LAST_CALL, "lastcall");
}

const pickKeys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);
const knells = (game: Game) => game.chain().filter((c) => (c.cardId === "glascA" || c.cardId === "glascB") && c.triggered);

async function passRound(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

/** Both Mixologists die to one spell with Karthus in the trash; P1 opts into both Deathknells (asked at finalization). */
async function bothDieBothAccepted(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("lastcall");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("glascA")).toBe("trash");
  expect(game.zoneOf("glascB")).toBe("trash");
  expect(game.zoneOf("karthus")).toBe("trash"); // NOT on the board at the moment of death
  await game.acceptTriggerOrder();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  return game;
}

describe("Ruling ee90cc616b17ea79 — Karthus revived by the first Mixologist Deathknell does not double the second", () => {
  test("both die together with Karthus in the trash ⇒ exactly TWO Deathknell items on the chain (one each)", async () => {
    const game = await bothDieBothAccepted();
    expect(knells(game)).toHaveLength(2);
  });

  test("the first Deathknell resolves and P1 plays Karthus from the trash for free — Karthus is now on the board, yet the chain still holds exactly ONE remaining Deathknell", async () => {
    const game = await bothDieBothAccepted();
    await passRound(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickKeys(game.decision()).toSorted()).toEqual(["karthus", "pebble", "skulker"]);
    await game.p1.pick("karthus");
    if (pickKeys(game.decision()).includes("base")) {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("base");
    }
    expect(game.zoneOf("karthus")).toBe("base");
    expect(game.p1.energy()).toBe(0); // ignoring its cost
    expect(knells(game)).toHaveLength(1); // no extra trigger appeared
  });

  test("the second Deathknell then resolves ONCE (Skulker comes back); no third resolution is ever offered — the Pebble stays in the trash", async () => {
    const game = await bothDieBothAccepted();
    await passRound(game);
    await game.p1.pick("karthus");
    if (pickKeys(game.decision()).includes("base")) {
      await game.p1.pick("base");
    }
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
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.zoneOf("karthus")).toBe("base");
    expect(game.zoneOf("pebble")).toBe("trash");
    expect(game.p1.units("base").toSorted()).toEqual(["karthus", "skulker"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — Karthus already ON THE BOARD at the moment of death (he dies too, but was present): each Mixologist's Deathknell is created twice ⇒ four items", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Onlooker" }, "onlooker")
      .unit(P1, "base", GLASC, "glascA")
      .unit(P1, "base", GLASC, "glascB")
      .unit(P1, "base", KARTHUS, "karthus")
      .trash(P1, SKULKER, "skulker")
      .hand(P1, LAST_CALL, "lastcall")
      .build();
    await game.p1.cast("lastcall");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.acceptTriggerOrder();
    expect(game.zoneOf("karthus")).toBe("trash");
    for (let i = 0; i < 4; i++) {
      if (game.decision()?.kind === "yes-no") {
        await game.p1.yes();
      }
    }
    expect(knells(game)).toHaveLength(4);
  });
});
