/**
 * Message builder - constructs notification messages with personalization and formatting.
 * 
 * Design philosophy:
 * - Template-based: Easy to customize messages per event type
 * - Personalization: Can customize based on user preferences (favorite teams)
 * - Emoji support: Makes notifications more engaging (use sparingly)
 * - A/B testing ready: Can experiment with different message formats
 * 
 * Note: This is currently a utility module. The messageBuilder is not heavily used yet
 * because events already contain title/message fields. This module is for future
 * enhancements like personalization and A/B testing.
 */

import { Event, EventType } from '../models/Event';
import { Game } from '../models/Game';
import { UserPreferences } from '../models/UserPreferences';

/**
 * Message template interface
 */
interface MessageTemplate {
  title: string;
  body: string;
  emoji?: string;
}

/**
 * Build a notification message for an event
 * 
 * @param event - The event to build a message for
 * @param game - The associated game
 * @param user - Optional user preferences for personalization
 */
export function buildEventMessage(
  event: Event,
  game?: Game,
  user?: UserPreferences
): MessageTemplate {
  // For now, use the message from the event itself
  // In the future, we can customize based on user preferences
  
  const template: MessageTemplate = {
    title: event.title,
    body: event.message
  };
  
  // Add emoji based on event type (optional)
  if (shouldUseEmoji()) {
    template.emoji = getEmojiForEventType(event.type);
  }
  
  // Future: Personalize based on user's favorite teams
  // if (user && game) {
  //   template.title = personalizeTitle(template.title, game, user);
  // }
  
  return template;
}

/**
 * Get emoji for event type
 */
function getEmojiForEventType(eventType: EventType): string | undefined {
  const emojiMap: Record<EventType, string> = {
    [EventType.GAME_START]: '🏀',
    [EventType.GAME_END]: '🎯',
    [EventType.CLOSE_GAME]: '🔥',
    [EventType.BLOWOUT]: '💥',
    [EventType.UPSET]: '😱',
    [EventType.GAME_POSTPONED]: '⏸️',
    [EventType.GAME_CANCELLED]: '❌',
    [EventType.HALFTIME]: '⏱️',
    [EventType.FINAL_PERIOD]: '⏰',
    [EventType.OVERTIME]: '⚡',
    [EventType.COMEBACK]: '🚀',
    [EventType.RIVALRY_GAME]: '⚔️',
    [EventType.PLAYOFF_GAME]: '🏆',
    [EventType.CUSTOM]: '📢'
  };
  
  return emojiMap[eventType];
}

/**
 * Check if emojis should be used (can be controlled via environment variable)
 */
function shouldUseEmoji(): boolean {
  return process.env.USE_EMOJI === 'true';
}

/**
 * Generate a message for game start
 */
export function buildGameStartMessage(game: Game): MessageTemplate {
  return {
    title: 'Game Started! 🏀',
    body: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation} is now live!`
  };
}

/**
 * Generate a message for game end
 */
export function buildGameEndMessage(game: Game): MessageTemplate {
  const homeScore = game.homeTeam.score || 0;
  const awayScore = game.awayTeam.score || 0;
  
  let body: string;
  if (homeScore > awayScore) {
    body = `Final: ${game.homeTeam.abbreviation} ${homeScore}, ${game.awayTeam.abbreviation} ${awayScore}`;
  } else {
    body = `Final: ${game.awayTeam.abbreviation} ${awayScore}, ${game.homeTeam.abbreviation} ${homeScore}`;
  }
  
  return {
    title: 'Final Score 🎯',
    body
  };
}

/**
 * Generate a message for close game
 */
export function buildCloseGameMessage(game: Game): MessageTemplate {
  const differential = Math.abs((game.homeTeam.score || 0) - (game.awayTeam.score || 0));
  
  return {
    title: 'Close Game! 🔥',
    body: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation} is within ${differential} points!`
  };
}

/**
 * Generate a message for blowout
 */
export function buildBlowoutMessage(game: Game): MessageTemplate {
  const homeScore = game.homeTeam.score || 0;
  const awayScore = game.awayTeam.score || 0;
  const differential = Math.abs(homeScore - awayScore);
  
  const leadingTeam = homeScore > awayScore ? game.homeTeam : game.awayTeam;
  const trailingTeam = homeScore > awayScore ? game.awayTeam : game.homeTeam;
  
  return {
    title: 'Blowout Alert 💥',
    body: `${leadingTeam.abbreviation} is dominating ${trailingTeam.abbreviation} by ${differential} points`
  };
}

/**
 * Personalize message title based on user's favorite teams
 * 
 * Example: "Your Lakers are winning!" vs "Lakers are winning!"
 */
function personalizeTitle(title: string, game: Game, user: UserPreferences): string {
  // Check if user follows any of the teams in this game
  for (const [_sport, prefs] of Object.entries(user.sports)) {
    if (prefs?.teams) {
      if (prefs.teams.includes(game.homeTeam.id)) {
        return title.replace(game.homeTeam.abbreviation, `Your ${game.homeTeam.abbreviation}`);
      }
      if (prefs.teams.includes(game.awayTeam.id)) {
        return title.replace(game.awayTeam.abbreviation, `Your ${game.awayTeam.abbreviation}`);
      }
    }
  }
  
  return title;
}

// Export to avoid unused function warning (for future use)
export { personalizeTitle };

/**
 * Format score for display
 */
export function formatScore(game: Game): string {
  return `${game.awayTeam.abbreviation} ${game.awayTeam.score || 0} @ ${game.homeTeam.abbreviation} ${game.homeTeam.score || 0}`;
}

/**
 * Format time remaining
 */
export function formatTimeRemaining(game: Game): string {
  if (!game.clock) return '';
  
  const period = game.currentPeriod || 0;
  const periodLabel = getPeriodLabel(game.sport, period);
  
  return `${game.clock} ${periodLabel}`;
}

/**
 * Get period label based on sport
 */
function getPeriodLabel(sport: string, period: number): string {
  switch (sport) {
    case 'NBA':
    case 'NFL':
      return `Q${period}`;
    case 'NHL':
      return `P${period}`;
    case 'MLB':
      return `Inning ${period}`;
    case 'SOCCER':
      return period === 1 ? '1st Half' : '2nd Half';
    default:
      return `Period ${period}`;
  }
}
