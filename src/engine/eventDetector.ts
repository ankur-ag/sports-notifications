/**
 * Event detection engine - detects notable events by comparing game states.
 * 
 * Design philosophy:
 * - Pure functions: No side effects, easy to test
 * - Idempotent: Same input produces same events
 * - Sport-agnostic: Uses normalized Game model
 * - Configurable: Thresholds can be adjusted via environment variables
 * 
 * Event detection strategy:
 * 1. Compare old and new game states
 * 2. Detect state transitions (SCHEDULED → LIVE, LIVE → FINAL)
 * 3. Detect score-based events (BLOWOUT, CLOSE_GAME)
 * 4. Generate events with deterministic IDs to prevent duplicates
 */

import {
  Game,
  GameStatus,
  getPointDifferential,
  isGameLive,
  hasGameStarted
} from '../models/Game';
import {
  Event,
  EventType,
  EventPriority,
  generateEventId,
  EVENT_THRESHOLDS
} from '../models/Event';

/**
 * Detect common events across all sports
 * 
 * This is the primary event detection function used by all providers
 */
export function detectCommonEvents(
  oldGame: Game | null,
  newGame: Game
): Event[] {
  const events: Event[] = [];
  
  // Game start detection
  const gameStartEvent = detectGameStart(oldGame, newGame);
  if (gameStartEvent) events.push(gameStartEvent);
  
  // Game end detection
  const gameEndEvent = detectGameEnd(oldGame, newGame);
  if (gameEndEvent) events.push(gameEndEvent);
  
  // Only detect in-game events if game is live
  if (isGameLive(newGame)) {
    // Blowout detection
    const blowoutEvent = detectBlowout(oldGame, newGame);
    if (blowoutEvent) events.push(blowoutEvent);
    
    // Close game detection
    const closeGameEvent = detectCloseGame(oldGame, newGame);
    if (closeGameEvent) events.push(closeGameEvent);
    
    // Final period detection
    const finalPeriodEvent = detectFinalPeriod(oldGame, newGame);
    if (finalPeriodEvent) events.push(finalPeriodEvent);
  }
  
  // Postponed/cancelled detection
  const statusChangeEvent = detectStatusChange(oldGame, newGame);
  if (statusChangeEvent) events.push(statusChangeEvent);
  
  return events;
}

/**
 * Detect game start (SCHEDULED → LIVE)
 */
function detectGameStart(oldGame: Game | null, newGame: Game): Event | null {
  // Game just started if it wasn't live before and is now live
  const justStarted = oldGame?.status !== GameStatus.LIVE && 
                      newGame.status === GameStatus.LIVE;
  
  if (!justStarted) return null;
  
  return {
    id: generateEventId(newGame.id, EventType.GAME_START),
    type: EventType.GAME_START,
    priority: EventPriority.HIGH,
    gameId: newGame.id,
    sport: newGame.sport,
    detectedAt: new Date(),
    occurredAt: newGame.startTime || new Date(),
    title: 'Game Started',
    message: `${newGame.awayTeam.abbreviation} @ ${newGame.homeTeam.abbreviation} is now live!`,
    notified: false,
    targetAudience: {
      teams: [newGame.homeTeam.id, newGame.awayTeam.id]
    },
    metadata: {
      scheduledTime: newGame.scheduledTime,
      actualStartTime: newGame.startTime
    }
  };
}

/**
 * Detect game end (LIVE → FINAL)
 */
function detectGameEnd(oldGame: Game | null, newGame: Game): Event | null {
  // Game just ended if it was live before and is now final
  const justEnded = oldGame?.status === GameStatus.LIVE && 
                    newGame.status === GameStatus.FINAL;
  
  if (!justEnded) return null;
  
  // Determine winner
  const homeScore = newGame.homeTeam.score || 0;
  const awayScore = newGame.awayTeam.score || 0;
  
  let message: string;
  if (homeScore > awayScore) {
    message = `${newGame.homeTeam.abbreviation} defeats ${newGame.awayTeam.abbreviation} ${homeScore}-${awayScore}`;
  } else if (awayScore > homeScore) {
    message = `${newGame.awayTeam.abbreviation} defeats ${newGame.homeTeam.abbreviation} ${awayScore}-${homeScore}`;
  } else {
    message = `${newGame.awayTeam.abbreviation} and ${newGame.homeTeam.abbreviation} tie ${homeScore}-${awayScore}`;
  }
  
  return {
    id: generateEventId(newGame.id, EventType.GAME_END),
    type: EventType.GAME_END,
    priority: EventPriority.HIGH,
    gameId: newGame.id,
    sport: newGame.sport,
    detectedAt: new Date(),
    occurredAt: newGame.endTime || new Date(),
    title: 'Final Score',
    message,
    notified: false,
    targetAudience: {
      teams: [newGame.homeTeam.id, newGame.awayTeam.id]
    },
    metadata: {
      finalScore: {
        home: homeScore,
        away: awayScore
      }
    }
  };
}

/**
 * Detect blowout (large point differential)
 */
function detectBlowout(oldGame: Game | null, newGame: Game): Event | null {
  const differential = getPointDifferential(newGame);
  
  if (!differential || differential < EVENT_THRESHOLDS.BLOWOUT_POINT_DIFFERENTIAL) {
    return null;
  }
  
  // Only trigger once (check if old game was also a blowout)
  const oldDifferential = oldGame ? getPointDifferential(oldGame) : null;
  const wasAlreadyBlowout = oldDifferential && 
                            oldDifferential >= EVENT_THRESHOLDS.BLOWOUT_POINT_DIFFERENTIAL;
  
  if (wasAlreadyBlowout) return null;
  
  // Determine leading team
  const homeScore = newGame.homeTeam.score || 0;
  const awayScore = newGame.awayTeam.score || 0;
  const leadingTeam = homeScore > awayScore ? newGame.homeTeam : newGame.awayTeam;
  const trailingTeam = homeScore > awayScore ? newGame.awayTeam : newGame.homeTeam;
  
  return {
    id: generateEventId(newGame.id, EventType.BLOWOUT),
    type: EventType.BLOWOUT,
    priority: EventPriority.MEDIUM,
    gameId: newGame.id,
    sport: newGame.sport,
    detectedAt: new Date(),
    title: 'Blowout Alert',
    message: `${leadingTeam.abbreviation} is dominating ${trailingTeam.abbreviation} by ${differential} points`,
    notified: false,
    targetAudience: {
      teams: [newGame.homeTeam.id, newGame.awayTeam.id]
    },
    metadata: {
      differential,
      leadingTeam: leadingTeam.id
    }
  };
}

/**
 * Detect close game (small point differential in final period)
 */
function detectCloseGame(oldGame: Game | null, newGame: Game): Event | null {
  const differential = getPointDifferential(newGame);
  
  if (!differential || differential > EVENT_THRESHOLDS.CLOSE_GAME_POINT_DIFFERENTIAL) {
    return null;
  }
  
  // Only in final period or late in game
  if (!newGame.currentPeriod || !newGame.totalPeriods) {
    return null;
  }
  
  const isFinalPeriod = newGame.currentPeriod >= newGame.totalPeriods;
  if (!isFinalPeriod) return null;
  
  // Only trigger once
  const oldDifferential = oldGame ? getPointDifferential(oldGame) : null;
  const wasAlreadyClose = oldDifferential !== null && 
                          oldDifferential <= EVENT_THRESHOLDS.CLOSE_GAME_POINT_DIFFERENTIAL;
  
  if (wasAlreadyClose) return null;
  
  return {
    id: generateEventId(newGame.id, EventType.CLOSE_GAME),
    type: EventType.CLOSE_GAME,
    priority: EventPriority.HIGH,
    gameId: newGame.id,
    sport: newGame.sport,
    detectedAt: new Date(),
    title: 'Close Game!',
    message: `${newGame.awayTeam.abbreviation} @ ${newGame.homeTeam.abbreviation} is a nail-biter! Score within ${differential} points`,
    notified: false,
    targetAudience: {
      teams: [newGame.homeTeam.id, newGame.awayTeam.id]
    },
    metadata: {
      differential,
      period: newGame.currentPeriod
    }
  };
}

/**
 * Detect entering final period
 */
function detectFinalPeriod(oldGame: Game | null, newGame: Game): Event | null {
  if (!newGame.currentPeriod || !newGame.totalPeriods) {
    return null;
  }
  
  // Check if just entered final period
  const isInFinalPeriod = newGame.currentPeriod === newGame.totalPeriods;
  const wasInFinalPeriod = oldGame?.currentPeriod === oldGame?.totalPeriods;
  
  const justEnteredFinalPeriod = isInFinalPeriod && !wasInFinalPeriod;
  
  if (!justEnteredFinalPeriod) return null;
  
  const homeScore = newGame.homeTeam.score || 0;
  const awayScore = newGame.awayTeam.score || 0;
  
  return {
    id: generateEventId(newGame.id, EventType.FINAL_PERIOD),
    type: EventType.FINAL_PERIOD,
    priority: EventPriority.MEDIUM,
    gameId: newGame.id,
    sport: newGame.sport,
    detectedAt: new Date(),
    title: 'Final Period',
    message: `${newGame.awayTeam.abbreviation} ${awayScore} @ ${newGame.homeTeam.abbreviation} ${homeScore} - Final period underway!`,
    notified: false,
    targetAudience: {
      teams: [newGame.homeTeam.id, newGame.awayTeam.id]
    },
    metadata: {
      period: newGame.currentPeriod,
      score: { home: homeScore, away: awayScore }
    }
  };
}

/**
 * Detect postponed or cancelled games
 */
function detectStatusChange(oldGame: Game | null, newGame: Game): Event | null {
  // Postponed
  if (newGame.status === GameStatus.POSTPONED && 
      oldGame?.status !== GameStatus.POSTPONED) {
    return {
      id: generateEventId(newGame.id, EventType.GAME_POSTPONED),
      type: EventType.GAME_POSTPONED,
      priority: EventPriority.MEDIUM,
      gameId: newGame.id,
      sport: newGame.sport,
      detectedAt: new Date(),
      title: 'Game Postponed',
      message: `${newGame.awayTeam.abbreviation} @ ${newGame.homeTeam.abbreviation} has been postponed`,
      notified: false,
      targetAudience: {
        teams: [newGame.homeTeam.id, newGame.awayTeam.id]
      }
    };
  }
  
  // Cancelled
  if (newGame.status === GameStatus.CANCELLED && 
      oldGame?.status !== GameStatus.CANCELLED) {
    return {
      id: generateEventId(newGame.id, EventType.GAME_CANCELLED),
      type: EventType.GAME_CANCELLED,
      priority: EventPriority.MEDIUM,
      gameId: newGame.id,
      sport: newGame.sport,
      detectedAt: new Date(),
      title: 'Game Cancelled',
      message: `${newGame.awayTeam.abbreviation} @ ${newGame.homeTeam.abbreviation} has been cancelled`,
      notified: false,
      targetAudience: {
        teams: [newGame.homeTeam.id, newGame.awayTeam.id]
      }
    };
  }
  
  return null;
}

/**
 * Utility: Get threshold from environment or use default
 */
export function getEventThreshold(key: keyof typeof EVENT_THRESHOLDS): number {
  const envKey = `EVENT_THRESHOLD_${key}`;
  const envValue = process.env[envKey];
  
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  
  return EVENT_THRESHOLDS[key];
}
