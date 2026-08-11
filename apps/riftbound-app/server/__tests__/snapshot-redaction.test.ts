/**
 * Per-seat redaction of Hidden (facedown) cards in the UI snapshot.
 *
 * rule 723 / 127 — a facedown card is private to its owner: the opponent's
 * snapshot must carry only an opaque stand-in (no definition id, no name, no
 * instance id that embeds the definition) in EVERY redacted mode (a real duel,
 * not just vs-Claude). rule 127 information effects (unl-053-219 Scuttle Crab:
 * "You can look at their facedown cards this turn") un-redact it for the
 * granted seat only; rule 421.4 — once the game ends facedown cards are public.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "@tcg/riftbound/harness";
import type { GameSession } from "../state";
import { buildGameSnapshot } from "../snapshot";

const CONSULT_THE_PAST = "ogn-083-298";
const SCUTTLE_CRAB = "unl-053-219";

function sessionOf(engine: unknown, sandbox: boolean): GameSession {
  return {
    clients: new Map(),
    engine: engine as GameSession["engine"],
    log: [],
    playerNames: { [P1]: "Alice", [P2]: "Bob" },
    players: [P1, P2],
    sandbox,
    seq: 0,
  };
}

type ZoneCard = { id: string; definitionId: string; name: string; owner: string; cardType: string };

function facedownAt(session: GameSession, viewer: string | undefined, bf: string): ZoneCard[] {
  const snap = buildGameSnapshot(session, viewer);
  return ((snap.zones as Record<string, ZoneCard[]>)[`facedown-${bf}`] ?? []);
}

function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .victoryScore(15)
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "h1")
    .unit(P2, "bf2", { might: 3, name: "Defender D" }, "d")
    .facedown(P2, "bf2", CONSULT_THE_PAST, "ctp");
}

describe("snapshot redaction — facedown cards are per-seat", () => {
  test("duel: the owner sees the real card; the opponent's snapshot carries only an opaque token (no def id / name / instance id)", async () => {
    const game = await board().build();
    const duel = sessionOf(game.engine, false);

    const owner = facedownAt(duel, P2, "bf2");
    expect(owner).toHaveLength(1);
    expect(owner[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp", owner: P2 });

    const opp = facedownAt(duel, P1, "bf2");
    expect(opp).toHaveLength(1); // the SLOT is public (rule 723: everyone sees a card was hidden there)
    expect(opp[0]).toMatchObject({ cardType: "unknown", definitionId: "", name: "Hidden card", owner: P2 });
    expect(opp[0]?.id.startsWith("hidden-facedown-bf2-")).toBe(true);
    const wire = JSON.stringify(buildGameSnapshot(duel, P1).zones);
    expect(wire).not.toContain(CONSULT_THE_PAST);
    expect(wire).not.toContain("Consult the Past");
    expect(wire).not.toContain('"ctp"');
  });

  test("vs-Claude (sandbox plumbing, real opponent): same redaction for the human seat", async () => {
    const game = await board().build();
    const vsAi = sessionOf(game.engine, true);
    vsAi.opponent = { info: { kind: "claude", label: "Claude", model: "haiku" }, thinking: false } as unknown as GameSession["opponent"];
    expect(facedownAt(vsAi, P1, "bf2")[0]).toMatchObject({ definitionId: "", name: "Hidden card" });
    expect(facedownAt(vsAi, P2, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST });
  });

  test("goldfish sandbox (one human drives both seats): nothing is redacted", async () => {
    const game = await board().build();
    const goldfish = sessionOf(game.engine, true);
    expect(facedownAt(goldfish, P1, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp" });
  });

  test("rule 127 look grant (Scuttle Crab's Deathknell): the granted seat's snapshot names the facedown card; the grant is turn-scoped", async () => {
    const game = await board().unit(P1, "base", SCUTTLE_CRAB, "crab").build();
    const duel = sessionOf(game.engine, false);
    expect(facedownAt(duel, P1, "bf2")[0]).toMatchObject({ definitionId: "" });

    await game.p1.move("crab", "bf2"); // attacks alone into Defender D (3) and dies → Deathknell
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.gameState.visibilityGrants).toEqual([{ duration: "turn", owner: P2, viewer: P1, zones: ["facedown"] }]);

    expect(facedownAt(duel, P1, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp", owner: P2 });
    // Still P2's hidden card — the grant is a LOOK, not a reveal: P2's own view is unchanged.
    expect(facedownAt(duel, P2, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST });

    // Next turn the grant expires and P1 is back to the opaque token.
    await game.p1.endTurn();
    await game.settle();
    expect(game.gameState.visibilityGrants ?? []).toEqual([]);
    expect(facedownAt(duel, P1, "bf2")[0]).toMatchObject({ definitionId: "", name: "Hidden card" });
  });

  test("the harness player view agrees with the snapshot: opponent seat sees an opaque entry, owner seat sees the card", async () => {
    const game = await board().build();
    const duel = sessionOf(game.engine, false);
    type ViewCard = { defId?: string; hidden?: boolean; id?: string };
    const viewFacedown = (seat: string): ViewCard[] =>
      ((game.view(seat) as unknown as { zones: Record<string, ViewCard[]> }).zones["facedown-bf2"] ?? []);

    expect(viewFacedown(P1)).toEqual([expect.objectContaining({ hidden: true })]);
    expect(viewFacedown(P1)[0]?.defId).toBeUndefined();
    expect(facedownAt(duel, P1, "bf2")[0]?.definitionId).toBe("");

    expect(viewFacedown(P2)[0]).toMatchObject({ defId: CONSULT_THE_PAST, id: "ctp" });
    expect(facedownAt(duel, P2, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp" });
  });

  // rule 421.4 — when the game ends, facedown cards are revealed to all players.
  test("rule 421.4: once the game is finished the opponent's facedown card is no longer redacted", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .victoryScore(1)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "h1")
      .unit(P2, "bf2", { might: 3, name: "Defender D" }, "d")
      .facedown(P2, "bf2", CONSULT_THE_PAST, "ctp")
      .build();
    const duel = sessionOf(game.engine, false);
    expect(facedownAt(duel, P1, "bf2")[0]).toMatchObject({ definitionId: "", name: "Hidden card" });

    await game.p1.endTurn();
    await game.settle();
    expect(game.gameState.status).toBe("finished");

    expect(facedownAt(duel, P1, "bf2")[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp", owner: P2 });
    // The reveal is scoped to facedown cards — hands stay private after the game ends.
    const hands = (buildGameSnapshot(duel, P1).zones as Record<string, ZoneCard[]>)["hand"] ?? [];
    for (const c of hands.filter((c) => c.owner === P2)) {
      expect(c).toMatchObject({ definitionId: "", name: "Hidden card" });
    }
  });
});
