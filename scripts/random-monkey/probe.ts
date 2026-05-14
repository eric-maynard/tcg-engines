/**
 * Probe: enumerate moves for a fresh game state to see what's legal.
 */
import { RuleEngine } from "../../packages/core/src/index";
import type { PlayerId } from "../../packages/core/src/index";
import { riftboundDefinition } from "../../packages/riftbound-engine/src/game-definition/definition";
import type {
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../packages/riftbound-engine/src/types";

const P1 = "player-1";
const P2 = "player-2";

const engine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
  riftboundDefinition,
  [
    { id: P1, name: "P1" },
    { id: P2, name: "P2" },
  ],
  { seed: "probe" },
);

for (const pid of [P1, P2]) {
  engine.executeMove("initializeMainDeck", {
    params: { cardIds: Array.from({ length: 40 }, (_, i) => `${pid}-card-${i}`), playerId: pid },
    playerId: pid as PlayerId,
  });
  engine.executeMove("initializeRuneDeck", {
    params: { playerId: pid, runeIds: Array.from({ length: 12 }, (_, i) => `${pid}-rune-${i}`) },
    playerId: pid as PlayerId,
  });
  engine.executeMove("drawInitialHand", {
    params: { playerId: pid },
    playerId: pid as PlayerId,
  });
}
engine.executeMove("placeBattlefields", {
  params: { battlefieldIds: ["bf-1", "bf-2"] },
  playerId: P1 as PlayerId,
});
engine.executeMove("transitionToPlay", { params: {}, playerId: P1 as PlayerId });

const state = engine.getState();
console.log("status:", state.status, "turn:", state.turn);

const validOnly = (engine as any).enumerateMoves(P1, { validOnly: true });
console.log(`validOnly: ${validOnly.length} moves`);
const counts: Record<string, number> = {};
for (const m of validOnly) {counts[m.moveId] = (counts[m.moveId] ?? 0) + 1;}
console.log(counts);

const all = (engine as any).enumerateMoves(P1, { validOnly: false });
console.log(`all: ${all.length} moves`);
const allCounts: Record<string, number> = {};
for (const m of all) {
  if (!m.isValid) {
    allCounts[`${m.moveId}_INVALID`] = (allCounts[`${m.moveId}_INVALID`] ?? 0) + 1;
  } else {
    allCounts[m.moveId] = (allCounts[m.moveId] ?? 0) + 1;
  }
}
console.log(allCounts);

// Now try endTurn explicitly and inspect state change.
console.log("\n--- executing endTurn ---");
const beforeTurn = engine.getState().turn;
const r = engine.executeMove("endTurn", {
  params: { playerId: P1 },
  playerId: P1 as PlayerId,
});
const afterTurn = engine.getState().turn;
console.log("endTurn success:", r.success);
console.log("before:", beforeTurn, "after:", afterTurn);
console.log("patches:", (r as any).patches?.length ?? 0);

// Try executing endTurn a second time
const r2 = engine.executeMove("endTurn", {
  params: { playerId: P1 },
  playerId: P1 as PlayerId,
});
console.log("endTurn2:", r2.success, "turn:", engine.getState().turn);

// Now check what player can play with hands.
const internal = (engine as any).internalState;
const hand = internal.zones?.["hand"];
console.log("zones keys:", Object.keys(internal.zones ?? {}).slice(0, 20));
