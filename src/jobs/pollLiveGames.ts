/**
 * Live games polling job
 * 
 * Purpose: Poll live games to detect events and send notifications
 * 
 * Schedule: Runs every 5-10 minutes when games are in progress
 * 
 * Cost optimization:
 * - Only polls games that are currently live
 * - Configurable polling interval (balance freshness vs. API costs)
 * - Skips games that have ended
 * - Estimated cost: ~50-100 API calls/day for 10-15 live games
 * 
 * Flow:
 * 1. Get all live games from Firestore
 * 2. For each live game:
 *    a. Fetch updated game data from provider
 *    b. Compare with stored state
 *    c. Detect events
 *    d. Send notifications
 *    e. Update stored game state
 * 3. Log summary
 */

import {gameRepository} from '../services/firestore';
import {notificationEngine} from '../engine/notificationEngine';
import {ProviderRegistry} from '../providers/SportProvider';
import {Game, GameStatus} from '../models/Game';

/**
 * Poll all live games and send notifications for detected events
 */
export async function pollLiveGames(): Promise<void> {
  console.log('[PollLiveGames] Starting live games poll');
  
  try {
    // Get all live games from Firestore
    const liveGames = await gameRepository.getLiveGames();
    
    if (liveGames.length === 0) {
      console.log('[PollLiveGames] No live games to poll');
      return;
    }
    
    console.log(`[PollLiveGames] Found ${liveGames.length} live games to poll`);
    
    let totalNotifications = 0;
    let gamesProcessed = 0;
    let errors = 0;
    
    // Process each game
    for (const storedGame of liveGames) {
      try {
        const notificationsSent = await pollSingleGame(storedGame);
        totalNotifications += notificationsSent;
        gamesProcessed++;
        
        // Add small delay between API calls to respect rate limits
        await sleep(500); // 500ms between games
      } catch (error) {
        console.error(`[PollLiveGames] Error polling game ${storedGame.id}:`, error);
        errors++;
        // Continue processing other games
      }
    }
    
    console.log(`[PollLiveGames] Poll complete: ${gamesProcessed}/${liveGames.length} games processed, ${totalNotifications} notifications sent, ${errors} errors`);
  } catch (error) {
    console.error('[PollLiveGames] Fatal error:', error);
    throw error;
  }
}

/**
 * Poll a single game for updates
 * 
 * @param storedGame - The game state from Firestore
 * @returns Number of notifications sent
 */
async function pollSingleGame(storedGame: Game): Promise<number> {
  try {
    console.log(`[PollLiveGames] Polling game ${storedGame.id}`);
    
    // Get the provider for this sport
    const provider = ProviderRegistry.getProvider(storedGame.sport);
    
    // Fetch updated game data from provider
    const updatedGame = await provider.fetchGame(storedGame.externalId);
    
    console.log(`[PollLiveGames] Game ${storedGame.id} status: ${updatedGame.status}`);
    
    // Process the game update through notification engine
    const notificationsSent = await notificationEngine.processGameUpdate(
      storedGame,
      updatedGame,
      provider
    );
    
    // Save updated game state to Firestore
    await gameRepository.saveGame(updatedGame);
    
    return notificationsSent;
  } catch (error) {
    console.error(`[PollLiveGames] Error in pollSingleGame:`, error);
    throw error;
  }
}

/**
 * Poll games that are scheduled to start soon
 * 
 * Purpose: Catch games transitioning from SCHEDULED to LIVE
 * 
 * This should run more frequently (e.g., every 2-3 minutes) during game times
 */
export async function pollScheduledGames(): Promise<void> {
  console.log('[PollLiveGames] Polling scheduled games');
  
  try {
    // Get games scheduled for today
    const today = new Date();
    const todaysGames = await gameRepository.getGamesByDate(today);
    
    // Filter for games that are scheduled and might start soon
    const scheduledGames = todaysGames.filter((game) => 
      game.status === GameStatus.SCHEDULED &&
      isGameStartingSoon(game)
    );
    
    if (scheduledGames.length === 0) {
      console.log('[PollLiveGames] No scheduled games starting soon');
      return;
    }
    
    console.log(`[PollLiveGames] Found ${scheduledGames.length} games starting soon`);
    
    // Poll each scheduled game
    for (const game of scheduledGames) {
      try {
        await pollSingleGame(game);
        await sleep(500);
      } catch (error) {
        console.error(`[PollLiveGames] Error polling scheduled game ${game.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[PollLiveGames] Error polling scheduled games:', error);
    throw error;
  }
}

/**
 * Check if a game is starting soon (within 30 minutes)
 */
function isGameStartingSoon(game: Game): boolean {
  const now = new Date();
  const scheduledTime = new Date(game.scheduledTime);
  
  // Check if game is within 30 minutes before or after scheduled time
  const diffMinutes = (scheduledTime.getTime() - now.getTime()) / (1000 * 60);
  
  return diffMinutes >= -30 && diffMinutes <= 30;
}

/**
 * Poll a specific game by ID (useful for testing or manual triggers)
 */
export async function pollGameById(gameId: string): Promise<void> {
  console.log(`[PollLiveGames] Manually polling game ${gameId}`);
  
  try {
    const storedGame = await gameRepository.getGame(gameId);
    
    if (!storedGame) {
      console.error(`[PollLiveGames] Game ${gameId} not found in database`);
      return;
    }
    
    const notificationsSent = await pollSingleGame(storedGame);
    
    console.log(`[PollLiveGames] Manual poll complete: ${notificationsSent} notifications sent`);
  } catch (error) {
    console.error(`[PollLiveGames] Error in manual poll:`, error);
    throw error;
  }
}

/**
 * Utility: Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get polling statistics (useful for monitoring)
 */
export async function getPollingStats(): Promise<{
  liveGamesCount: number;
  scheduledTodayCount: number;
}> {
  try {
    const liveGames = await gameRepository.getLiveGames();
    const today = new Date();
    const todaysGames = await gameRepository.getGamesByDate(today);
    
    return {
      liveGamesCount: liveGames.length,
      scheduledTodayCount: todaysGames.filter((g) => g.status === GameStatus.SCHEDULED).length
    };
  } catch (error) {
    console.error('[PollLiveGames] Error getting stats:', error);
    return {
      liveGamesCount: 0,
      scheduledTodayCount: 0
    };
  }
}
