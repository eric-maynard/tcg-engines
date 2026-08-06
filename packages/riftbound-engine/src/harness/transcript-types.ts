/**
 * Transcript data shapes (kept separate from replay logic to avoid an
 * engine-backend ↔ scenario import cycle).
 */

import type { DeckConfig } from "../testing/playtest/game-setup";
import type { Answer, DecisionKind, ExecutedMove, Seat } from "./types";

/** Serialised scenario recipe; defined structurally here, produced by scenario.ts. */
export interface ScenarioSpecLike {
  readonly seed: string;
  readonly players: readonly Seat[];
  readonly [key: string]: unknown;
}

export type TranscriptOrigin =
  | { readonly kind: "scenario"; readonly spec: ScenarioSpecLike }
  | { readonly kind: "decks"; readonly seed: string; readonly decks: Readonly<Record<Seat, DeckConfig>> }
  | { readonly kind: "opaque"; readonly note?: string };

export interface TranscriptStep {
  readonly n: number;
  readonly seat: Seat;
  readonly decision: { readonly id: string; readonly kind: DecisionKind } | null;
  readonly answer: Answer;
  readonly executed: readonly ExecutedMove[];
  readonly ok: boolean;
  readonly error?: string;
  readonly hash: string;
}

export interface Transcript {
  readonly schema: 1;
  readonly origin: TranscriptOrigin;
  readonly players: readonly Seat[];
  readonly initialHash: string;
  readonly steps: readonly TranscriptStep[];
  readonly finalHash: string;
}
