/**
 * Chain & Showdown State Machine
 *
 * Implements rules 532-553: the Chain (spell stack) and Showdown (combat window).
 *
 * ## Chain (rules 532-544)
 * The Chain is a LIFO stack of spells and abilities.
 * - Created when a card is played or ability activated
 * - Only Reaction spells/abilities can be added during a chain (Closed State)
 * - Priority passes between Relevant Players
 * - When all pass, top item resolves, then priority resets
 * - Repeat until chain is empty
 *
 * ## Showdown (rules 545-553)
 * A Showdown is a window where players can play Action/Reaction spells.
 * - Opens when a battlefield becomes contested
 * - Focus passes between Relevant Players
 * - Each spell played creates a chain
 * - When all pass, showdown ends → combat occurs (if contested)
 *
 * ## Turn States (rule 510)
 * - Neutral Open: no showdown, no chain → play anything on your turn
 * - Neutral Closed: no showdown, chain exists → only Reaction
 * - Showdown Open: showdown active, no chain → Action or Reaction
 * - Showdown Closed: showdown active, chain exists → only Reaction
 */

/**
 * An item on the chain (spell or ability).
 */
export interface ChainItem {
  /** Unique ID for this chain item */
  readonly id: string;
  /** Type of item */
  readonly type: "spell" | "permanent" | "ability";
  /** Card ID (for spells/permanents) or source card ID (for abilities) */
  readonly cardId: string;
  /** Player who played/activated this */
  readonly controller: string;
  /** The effect to execute when this resolves */
  readonly effect?: unknown;
  /** Targets chosen at play time (rule 355.8) — bound before resolution */
  readonly targets?: readonly string[];
  /** Whether this is a triggered ability (auto-added, not player-initiated) */
  readonly triggered?: boolean;
  /**
   * rule 359.3.e.2 / 359.3.e.4 (ogn-080-298 Mystic Reversal) — the player who
   * controlled this item when its targets were chosen. Set only when control
   * of the item changed afterwards: a relative descriptor ("an ENEMY unit") is
   * re-checked against the CURRENT controller at resolution, so a stolen spell
   * mistargets unless new choices were made.
   */
  readonly originalController?: string;
  /**
   * rule 337.1 / 402–404: a triggered item is appended as a Pending Item and
   * only becomes a Finalized Chain Item once its controller has decided a
   * leading "you may" (402.1), chosen its targets/modes (402.2) and paid any
   * base cost (404) — all before anyone receives Priority (337.4). Undefined on
   * items whose producer already finalized them (played cards, activations).
   */
  readonly status?: "pending" | "finalized";
  /**
   * rule 337.1.b / 354.2 — chain items appended BEFORE this pending trigger
   * (a play an effect instructed mid-resolution) that must leave the Chain
   * before this item's finalization dialog opens.
   */
  readonly finalizeAfter?: readonly string[];
  /**
   * rule 383.3.e.2 — the "once each turn" tally key this trigger consumed when
   * it was queued; refunded if the item leaves the Chain unfinalized.
   */
  readonly onceKey?: string;
  /**
   * rule-id: ven-021-166 — the GameEvent that fired this trigger, so target
   * qualifiers like "a battlefield I moved to or from" can resolve against
   * the event's from/to zones at chain-resolution time.
   */
  readonly triggerEvent?: unknown;
  /**
   * rule 383.3.d — the batch of SIMULTANEOUSLY triggered abilities this item
   * belongs to (one `fireTriggers` pass, or one multi-card leave batch whose
   * events are published card by card). Only items sharing a batch may be
   * reordered by their controller; items from different batches entered the
   * Chain one after another (337.1.b), so their order is already fixed.
   */
  readonly triggerBatch?: string;
  /** Rule 583 (unl-021-219): "you may" trigger — controller opts in on resolve */
  readonly optional?: boolean;
  /**
   * rule 383.3.a.3 (rule-id: sfd-120-221) — the "you may" is a later part of
   * the effect, so it is decided on RESOLUTION: this item is never offered the
   * finalization opt-in and always reaches the chain.
   */
  readonly optionalOnResolution?: boolean;
  /**
   * rule-id: sfd-119-221 — "you may pay [N] to …" trigger: the cost the
   * controller must pay on opt-in ({ energy?, power?, exhaust? }). Accepting
   * is only legal when affordable, and the cost is deducted before the effect.
   */
  readonly optInCost?: unknown;
  /**
   * rule 392 (rule-id: ogn-289-298) — a DELAYED triggered ability floating on
   * its controller ("… at the end of this turn"): no source object holds its
   * choices, so its "up to N" objects are named while the item is FINALIZED
   * (rule 402.2) rather than at resolution.
   */
  readonly delayed?: boolean;
  /** Whether this item was countered (skip execution on resolve) */
  readonly countered?: boolean;
  /** rule-id: ven-015-166 — "This can't be countered." (rule 544): counter attempts are refused */
  readonly uncounterable?: boolean;
  /**
   * rule-id: unl-007-219 — a spell card stays in the "chain" zone while
   * pending and only moves to its final zone when it leaves the chain
   * (resolved or countered). Defaults to "trash"; [Flow] plays banish;
   * rule-id: unl-131-219 — a counter may redirect it to the owner's hand.
   * rule-id: ogn-112-298 (rule 594) — "Then recycle it": "mainDeck" sends the
   * spell to the BOTTOM of its owner's Main Deck.
   */
  readonly resolveTo?: "trash" | "banishment" | "hand" | "mainDeck";
}

/**
 * Current state of the chain system.
 */
export interface ChainState {
  /** Items on the chain (LIFO — last item resolves first) */
  readonly items: ChainItem[];

  /** Whether a chain currently exists (items.length > 0) */
  readonly active: boolean;

  /** Relevant players for this chain (who can act) */
  readonly relevantPlayers: string[];

  /** Current active player (has priority) */
  readonly activePlayer: string;

  /** Players who have passed since the last chain action */
  readonly passedPlayers: string[];

  /** Turn order (for cycling priority) */
  readonly turnOrder: string[];

  /**
   * rule 346.1: Focus does NOT pass when a chain that opened from a triggered
   * (or Add) ability empties — the Combat Chain is the canonical case. True
   * when the item that created this chain was not a discretionary play.
   */
  readonly openedByTrigger?: boolean;
}

/**
 * Current state of a showdown.
 */
export interface ShowdownState {
  /** Whether a showdown is active */
  readonly active: boolean;

  /** Battlefield where the showdown is occurring */
  readonly battlefieldId: string;

  /** Player who has Focus */
  readonly focusPlayer: string;

  /** Relevant players for this showdown */
  readonly relevantPlayers: string[];

  /** Players who have passed Focus since last action */
  readonly passedPlayers: string[];

  /** Whether this showdown is part of combat */
  readonly isCombatShowdown: boolean;

  /** The attacking player (if combat showdown) */
  readonly attackingPlayer?: string;

  /** The defending player (if combat showdown) */
  readonly defendingPlayer?: string;

  /**
   * rule 344.2 — set when a Cleanup began this Showdown on its own (no player
   * chose it), so callers can tell it apart from one begun by an explicit step.
   */
  readonly autoBegun?: boolean;
}

/**
 * Combined turn state including chain and showdown.
 */
export interface TurnInteractionState {
  /** Current chain state (null if no chain) */
  chain: ChainState | null;

  /** Stack of showdown states (top = active showdown, empty = no showdown) */
  showdownStack: ShowdownState[];

  /** Counter for generating unique chain item IDs */
  nextChainItemId: number;
}

/**
 * Get the active (top-of-stack) showdown, or null if no showdown is active.
 */
export function getActiveShowdown(state: TurnInteractionState): ShowdownState | null {
  return state.showdownStack.length > 0
    ? state.showdownStack[state.showdownStack.length - 1]
    : null;
}

/**
 * The four possible turn states (rule 510).
 */
export type TurnStateType = "neutral-open" | "neutral-closed" | "showdown-open" | "showdown-closed";

/**
 * Determine the current turn state.
 */
export function getTurnState(interaction: TurnInteractionState): TurnStateType {
  const activeShowdown = getActiveShowdown(interaction);
  const hasShowdown = activeShowdown?.active ?? false;
  const hasChain = interaction.chain?.active ?? false;

  if (hasShowdown && hasChain) {
    return "showdown-closed";
  }
  if (hasShowdown && !hasChain) {
    return "showdown-open";
  }
  if (!hasShowdown && hasChain) {
    return "neutral-closed";
  }
  return "neutral-open";
}

/**
 * Check if a spell timing is legal in the current turn state.
 *
 * - Neutral Open: Standard, Action and Reaction
 * - Neutral Closed: Reaction only (rule 535.1)
 * - Showdown Open: Action and Reaction (rule 546)
 * - Showdown Closed: Reaction only
 */
export type TimingClass = "standard" | "action" | "reaction";

export function isLegalTiming(timing: TimingClass, turnState: TurnStateType): boolean {
  if (timing === "reaction") {
    return true;
  } // Always legal
  if (timing === "standard") {
    // rule 155: a spell without [Action]/[Reaction] is playable only in an
    // Open State outside of Showdowns.
    return turnState === "neutral-open";
  }
  // Action is legal in open states
  return turnState === "neutral-open" || turnState === "showdown-open";
}

/**
 * rule 313.1 / 347: Focus is the permission to take Discretionary Actions in a
 * Showdown Open State — only the player holding Focus may play cards or
 * activate abilities there. Outside an active showdown this is always true
 * (the Neutral Open State is gated by turn player instead).
 */
export function hasShowdownPermission(
  interaction: TurnInteractionState,
  playerId: string,
): boolean {
  const showdown = getActiveShowdown(interaction);
  if (!showdown?.active) {
    return true;
  }
  return showdown.focusPlayer === playerId;
}

/**
 * rule 312 / 312.2.c-d / 338.1.b.1: Priority is exclusive. While a chain exists
 * (a Closed State) only the player who currently holds Priority may add another
 * item to it; every other Relevant Player waits until Priority is passed to
 * them. Outside a chain this is not the gate (turn player / Focus holder is).
 */
export function holdsChainPriority(
  interaction: TurnInteractionState,
  playerId: string,
): boolean {
  const chain = interaction.chain;
  return chain?.active === true && chain.activePlayer === playerId;
}

/**
 * rule 312.2.c-d: a Discretionary Action taken while a chain is open requires
 * Priority. True when there is no chain (some other rule gates the action).
 */
export function hasChainPriorityPermission(
  interaction: TurnInteractionState,
  playerId: string,
): boolean {
  if (!interaction.chain?.active) {
    return true;
  }
  return interaction.chain.activePlayer === playerId;
}

/**
 * Create an empty interaction state.
 */
export function createInteractionState(): TurnInteractionState {
  return {
    chain: null,
    nextChainItemId: 1,
    showdownStack: [],
  };
}

/**
 * rule 383.3.d — collapse the per-event `triggerBatch` stamps of every triggered
 * item appended since `chainLenBefore` into ONE batch. Use it around a game step
 * whose events are published object by object but happen simultaneously (every
 * card of one leave batch; every Attacker/Defender designation of one combat),
 * so their controller may still order them.
 */
export function collapseTriggerBatch(
  interaction: TurnInteractionState | null | undefined,
  chainLenBefore: number,
): void {
  const items = interaction?.chain?.items;
  if (!items || items.length - chainLenBefore < 2) {
    return;
  }
  const batch = items.slice(chainLenBefore).find((it) => it.triggerBatch !== undefined)?.triggerBatch;
  if (batch === undefined) {
    return;
  }
  for (let i = chainLenBefore; i < items.length; i++) {
    if (items[i].triggered === true) {
      items[i] = { ...items[i], triggerBatch: batch };
    }
  }
}

// ============================================================================
// Chain Operations
// ============================================================================

/**
 * rule 339.1 / 553.4.a — a Chain resolves (and a showdown ends) only when all
 * Relevant Players pass IN SEQUENCE *without adding an item*. Anything a player
 * does that adds an item breaks that sequence, including an item that resolves
 * the instant it is finalized and so never sits on the Chain (a Gear — 337.2).
 * `addToChain` does this for items that stay on the Chain; this is the same
 * reset for the immediate-resolution plays, which take a different path.
 * The acting player keeps Priority afterwards (337.1.a).
 */
export function breakPassSequence(
  state: TurnInteractionState,
  playerId: string,
): TurnInteractionState {
  const activeShowdown = getActiveShowdown(state);
  let showdownStack = state.showdownStack;
  if (activeShowdown) {
    const top = showdownStack.length - 1;
    showdownStack = [...showdownStack.slice(0, top), { ...showdownStack[top], passedPlayers: [] }];
  }
  return {
    ...state,
    chain: state.chain ? { ...state.chain, activePlayer: playerId, passedPlayers: [] } : state.chain,
    showdownStack,
  };
}

/**
 * Start a new chain or add to an existing chain (rule 537).
 *
 * @param state - Current interaction state
 * @param item - Item to add
 * @param turnOrder - Player turn order
 * @returns Updated interaction state
 */
export function addToChain(
  state: TurnInteractionState,
  item: Omit<ChainItem, "id">,
  turnOrder: string[],
): TurnInteractionState {
  const chainItem: ChainItem = {
    ...item,
    id: `chain-${state.nextChainItemId}`,
  };

  // If permanent, it resolves immediately (rule 538)
  if (item.type === "permanent") {
    return {
      ...state,
      nextChainItemId: state.nextChainItemId + 1,
      // Don't create a chain for permanents
    };
  }

  const existingItems = state.chain?.items ?? [];
  const activeShowdown = getActiveShowdown(state);
  const relevantPlayers =
    state.chain?.relevantPlayers ?? activeShowdown?.relevantPlayers ?? turnOrder;

  // Rule 553.4.a: the showdown ends when all Relevant Players pass *in
  // sequence*. Taking an action (adding to the chain) breaks the sequence,
  // so reset the active showdown's passedPlayers alongside the chain's.
  let showdownStack = state.showdownStack;
  if (activeShowdown) {
    const top = showdownStack.length - 1;
    showdownStack = [
      ...showdownStack.slice(0, top),
      { ...showdownStack[top], passedPlayers: [] },
    ];
  }

  // rule 337.4 / 340.4 (Vendetta): once there are no more Pending Items, the
  // controller of the NEWEST item on the Chain gains Priority. The item just
  // added is that newest item, so its controller acts first — including a
  // triggered item queued on top of a chain another player opened.
  const activePlayer = item.controller;

  return {
    ...state,
    chain: {
      active: true,
      items: [...existingItems, chainItem],
      relevantPlayers,
      activePlayer,
      passedPlayers: [], // Reset passes when new item added
      turnOrder,
      // rule 346.1: a chain that OPENED from a triggered (or Add) ability —
      // the Combat Chain is the canonical case — does not pass Focus when it
      // empties. Latched from the item that created the chain.
      openedByTrigger: state.chain ? state.chain.openedByTrigger : !!item.triggered,
    },
    nextChainItemId: state.nextChainItemId + 1,
    showdownStack,
  };
}

/**
 * Pass priority to the next relevant player (rule 540.4).
 *
 * @returns Updated state. If all have passed, chain is ready to resolve.
 */
export function passPriority(state: TurnInteractionState): TurnInteractionState {
  if (!state.chain) {
    return state;
  }

  const { activePlayer, relevantPlayers, passedPlayers, turnOrder } = state.chain;

  // Mark current player as passed
  const newPassed = [...passedPlayers, activePlayer];

  // Check if all relevant players have passed (rule 540.4.b)
  const allPassed = relevantPlayers.every((p) => newPassed.includes(p));

  if (allPassed) {
    // All passed — chain is ready to resolve
    return {
      ...state,
      chain: {
        ...state.chain,
        activePlayer: "",
        passedPlayers: newPassed, // No one has priority
      },
    };
  }

  // Find next relevant player in turn order
  const currentIdx = turnOrder.indexOf(activePlayer);
  let nextPlayer = activePlayer;
  for (let i = 1; i <= turnOrder.length; i++) {
    const candidate = turnOrder[(currentIdx + i) % turnOrder.length];
    if (relevantPlayers.includes(candidate) && !newPassed.includes(candidate)) {
      nextPlayer = candidate;
      break;
    }
  }

  return {
    ...state,
    chain: {
      ...state.chain,
      activePlayer: nextPlayer,
      passedPlayers: newPassed,
    },
  };
}

/**
 * Check if all relevant players have passed (chain ready to resolve).
 */
export function allPlayersPassed(state: TurnInteractionState): boolean {
  if (!state.chain) {
    return false;
  }
  return state.chain.relevantPlayers.every((p) => state.chain!.passedPlayers.includes(p));
}

/**
 * Resolve the top item on the chain (rule 543).
 *
 * @returns The resolved item and updated state.
 */
export function resolveTopItem(state: TurnInteractionState): {
  resolved: ChainItem | null;
  newState: TurnInteractionState;
} {
  if (!state.chain || state.chain.items.length === 0) {
    return { newState: { ...state, chain: null }, resolved: null };
  }

  const items = [...state.chain.items];
  const resolved = items.pop()!;

  return { newState: afterItemsLeft(state, items), resolved };
}

/**
 * rule-id: ogn-064-298 (rule 425.1.a / 425.1.a.1) — a countered item is
 * cleared from the chain as part of being countered, not left pending until
 * the next all-pass. Removes `itemId` and re-seats priority as if it had left
 * the chain normally.
 */
export function removeChainItem(
  state: TurnInteractionState,
  itemId: string,
): TurnInteractionState {
  if (!state.chain || !state.chain.items.some((it) => it.id === itemId)) {
    return state;
  }
  return afterItemsLeft(
    state,
    state.chain.items.filter((it) => it.id !== itemId),
  );
}

function afterItemsLeft(state: TurnInteractionState, items: ChainItem[]): TurnInteractionState {
  if (!state.chain) {
    return state;
  }
  if (items.length === 0) {
    // Chain is now empty. Rule 346 (Vendetta; old 552): when the last item
    // resolves during a Showdown, Focus passes to the next Relevant Player.
    let showdownStack = state.showdownStack;
    const sd = getActiveShowdown(state);
    // rule 346.1 / 340.2.a: Focus does NOT pass when the emptied chain was
    // opened by a triggered (or Add) ability rather than a played item.
    if (sd && !state.chain.openedByTrigger) {
      const idx = sd.relevantPlayers.indexOf(sd.focusPlayer);
      const nextFocus = sd.relevantPlayers[(idx + 1) % sd.relevantPlayers.length];
      const top = showdownStack.length - 1;
      showdownStack = [
        ...showdownStack.slice(0, top),
        { ...showdownStack[top], focusPlayer: nextFocus, passedPlayers: [] },
      ];
    }
    return { ...state, chain: null, showdownStack };
  }

  // Chain still has items — reset passes, give priority to controller of new top item
  const newTopController = items[items.length - 1].controller;
  return {
    ...state,
    chain: {
      ...state.chain,
      activePlayer: newTopController,
      items,
      passedPlayers: [], // Everyone must pass again (rule 543.4)
    },
  };
}

// ============================================================================
// Showdown Operations
// ============================================================================

/**
 * Start a showdown at a battlefield (rule 548).
 */
export function startShowdown(
  state: TurnInteractionState,
  battlefieldId: string,
  focusPlayer: string,
  relevantPlayers: string[],
  isCombat: boolean,
  attackingPlayer?: string,
  defendingPlayer?: string,
): TurnInteractionState {
  const newShowdown: ShowdownState = {
    active: true,
    attackingPlayer,
    battlefieldId,
    defendingPlayer,
    focusPlayer,
    isCombatShowdown: isCombat,
    passedPlayers: [],
    relevantPlayers,
  };

  return {
    ...state,
    showdownStack: [...state.showdownStack, newShowdown],
  };
}

/**
 * Pass focus to the next relevant player in a showdown (rule 553.4-553.5).
 *
 * @returns Updated state. If all have passed, showdown should end.
 */
export function passFocus(state: TurnInteractionState): TurnInteractionState {
  const activeShowdown = getActiveShowdown(state);
  if (!activeShowdown) {
    return state;
  }

  const { focusPlayer, relevantPlayers, passedPlayers } = activeShowdown;

  const newPassed = [...passedPlayers, focusPlayer];

  // Check if all relevant players have passed (rule 553.4.a)
  const allPassed = relevantPlayers.every((p) => newPassed.includes(p));

  const stackCopy = [...state.showdownStack];
  const topIndex = stackCopy.length - 1;

  if (allPassed) {
    // Showdown ends
    stackCopy[topIndex] = {
      ...activeShowdown,
      active: false,
      passedPlayers: newPassed,
    };
    return {
      ...state,
      showdownStack: stackCopy,
    };
  }

  // Find next relevant player for focus
  // Use turnOrder from chain if available, otherwise just cycle through relevant players
  const currentIdx = relevantPlayers.indexOf(focusPlayer);
  let nextFocus = focusPlayer;
  for (let i = 1; i <= relevantPlayers.length; i++) {
    const candidate = relevantPlayers[(currentIdx + i) % relevantPlayers.length];
    if (!newPassed.includes(candidate)) {
      nextFocus = candidate;
      break;
    }
  }

  stackCopy[topIndex] = {
    ...activeShowdown,
    focusPlayer: nextFocus,
    passedPlayers: newPassed,
  };

  return {
    ...state,
    showdownStack: stackCopy,
  };
}

/**
 * Check if showdown has ended (all relevant players passed).
 */
export function isShowdownEnded(state: TurnInteractionState): boolean {
  const activeShowdown = getActiveShowdown(state);
  if (!activeShowdown) {
    return true;
  }
  return !activeShowdown.active;
}

/**
 * End the showdown and clean up.
 */
export function endShowdown(state: TurnInteractionState): TurnInteractionState {
  if (state.showdownStack.length === 0) {
    return state;
  }

  const newStack = state.showdownStack.slice(0, -1);

  // If there's a resumed showdown underneath, reset its passedPlayers
  // So players can re-evaluate after the nested showdown resolved.
  if (newStack.length > 0) {
    const topIndex = newStack.length - 1;
    newStack[topIndex] = {
      ...newStack[topIndex],
      passedPlayers: [],
    };
  }

  return {
    ...state,
    showdownStack: newStack,
  };
}

/**
 * Reset passed players in a showdown (when a new action is taken).
 */
export function resetShowdownPasses(state: TurnInteractionState): TurnInteractionState {
  const activeShowdown = getActiveShowdown(state);
  if (!activeShowdown) {
    return state;
  }

  const stackCopy = [...state.showdownStack];
  stackCopy[stackCopy.length - 1] = {
    ...activeShowdown,
    passedPlayers: [],
  };

  return {
    ...state,
    showdownStack: stackCopy,
  };
}
