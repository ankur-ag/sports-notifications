/**
 * Sports Notifications Backend - Main entry point
 * 
 * Firebase Cloud Functions v2 configuration
 * 
 * Deployed functions:
 * 1. fetchDailySchedule - Scheduled function (daily at 6 AM UTC)
 * 2. pollLiveGames - Scheduled function (every 5 minutes)
 * 3. pollScheduledGames - Scheduled function (every 2 minutes during game times)
 * 
 * Manual trigger functions (for testing):
 * 4. manualFetchSchedule - HTTP trigger
 * 5. manualPollGame - HTTP trigger
 * 6. testNotification - HTTP trigger
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';

// Import providers
import { createNBAProvider } from './providers/NBAProvider';
import { ProviderRegistry } from './providers/SportProvider';

// Import jobs
import { fetchDailySchedule, fetchScheduleForDate, validateProviders } from './jobs/fetchDailySchedule';
import { pollLiveGames, pollScheduledGames, pollGameById, getPollingStats } from './jobs/pollLiveGames';

// Import services
import { fcmService } from './services/fcm';

/**
 * Initialize providers on cold start
 */
function initializeProviders(): void {
  console.log('[Init] Initializing sport providers');

  // Register NBA provider (no API key needed - uses free NBA JSON endpoints)
  const nbaProvider = createNBAProvider();
  ProviderRegistry.register(nbaProvider);

  // Add more providers here as they are implemented
  // Example:
  // const nflProvider = createNFLProvider(process.env.NFL_API_KEY);
  // ProviderRegistry.register(nflProvider);

  console.log('[Init] Providers registered:', ProviderRegistry.getSupportedSports());

  // Validate configuration
  const isValid = validateProviders();
  if (!isValid) {
    console.error('[Init] Some providers have invalid configuration');
  }
}

// Initialize providers
initializeProviders();

/**
 * Scheduled function: Fetch daily schedule
 * 
 * Schedule: Daily at 6:00 AM UTC
 * Timezone: UTC
 * 
 * This fetches the day's game schedule for all supported sports
 * and stores them in Firestore.
 */
export const scheduledFetchDailySchedule = onSchedule(
  {
    schedule: '0 14 * * *', // Cron: Every day at 2:00 PM UTC
    timeZone: 'UTC',
    memory: '256MiB',
    timeoutSeconds: 120, // 2 minutes max
  },
  async (event) => {
    console.log('[CloudFunction] scheduledFetchDailySchedule triggered');

    try {
      await fetchDailySchedule();
      console.log('[CloudFunction] scheduledFetchDailySchedule completed successfully');
    } catch (error) {
      console.error('[CloudFunction] scheduledFetchDailySchedule failed:', error);
      throw error;
    }
  }
);

/**
 * Scheduled function: Poll active games
 * 
 * Schedule: Every 10 minutes
 * 
 * This polls games that are either:
 * 1. Currently LIVE (to detect events and send notifications)
 * 2. Scheduled to start within 30 minutes (to catch game starts)
 * 
 * Only runs when there are active games. Does not poll outside of game schedules.
 */
export const scheduledPollLiveGames = onSchedule(
  {
    schedule: '*/10 * * * *', // Cron: Every 10 minutes
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 120, // 2 minutes max
  },
  async (event) => {
    console.log('[CloudFunction] scheduledPollLiveGames triggered');

    try {
      // Poll both live games and games starting soon in a single job
      console.log('[CloudFunction] Polling live games...');
      await pollLiveGames();

      console.log('[CloudFunction] Polling scheduled games starting soon...');
      await pollScheduledGames();

      console.log('[CloudFunction] scheduledPollLiveGames completed successfully');
    } catch (error) {
      console.error('[CloudFunction] scheduledPollLiveGames failed:', error);
      throw error;
    }
  }
);

/**
 * HTTP function: Manual fetch schedule
 * 
 * Useful for testing or one-off schedule fetches
 * 
 * Query params:
 * - date: ISO date string (optional, defaults to today)
 * 
 * Example: https://your-function-url/manualFetchSchedule?date=2024-01-15
 */
export const manualFetchSchedule = onRequest(
  {
    memory: '256MiB',
    timeoutSeconds: 60, // 1 minute
  },
  async (request, response) => {
    console.log('[CloudFunction] manualFetchSchedule triggered');

    try {
      const dateParam = request.query.date as string;

      if (dateParam) {
        const date = new Date(dateParam);
        await fetchScheduleForDate(date);
        response.json({
          success: true,
          message: `Fetched schedule for ${date.toISOString()}`
        });
      } else {
        await fetchDailySchedule();
        response.json({
          success: true,
          message: 'Fetched today\'s schedule'
        });
      }
    } catch (error: any) {
      console.error('[CloudFunction] manualFetchSchedule failed:', error);
      response.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * HTTP function: Manual poll game
 * 
 * Useful for testing or manually triggering a game poll
 * 
 * Query params:
 * - gameId: Game ID to poll (required)
 * 
 * Example: https://your-function-url/manualPollGame?gameId=nba_12345
 */
export const manualPollGame = onRequest(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (request, response) => {
    console.log('[CloudFunction] manualPollGame triggered');

    try {
      const gameId = request.query.gameId as string;

      if (!gameId) {
        console.log('[CloudFunction] No gameId provided, running full pollLiveGames cycle');
        await pollLiveGames();
        response.json({
          success: true,
          message: 'Triggered full live games poll successfully'
        });
        return;
      }

      await pollGameById(gameId);

      response.json({
        success: true,
        message: `Polled game ${gameId}`
      });
    } catch (error: any) {
      console.error('[CloudFunction] manualPollGame failed:', error);
      response.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * HTTP function: Test notification
 * 
 * Send a test notification to a specific FCM token
 * 
 * Body (JSON):
 * - fcmToken: FCM token to send to (required)
 * 
 * Example:
 * POST https://your-function-url/testNotification
 * Body: { "fcmToken": "your-fcm-token" }
 */
export const testNotification = onRequest(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request, response) => {
    console.log('[CloudFunction] testNotification triggered');

    try {
      if (request.method !== 'POST') {
        response.status(405).json({
          success: false,
          error: 'Method not allowed. Use POST.'
        });
        return;
      }

      const { fcmToken } = request.body;

      if (!fcmToken) {
        response.status(400).json({
          success: false,
          error: 'fcmToken is required in request body'
        });
        return;
      }

      const success = await fcmService.sendTestNotification(fcmToken);

      if (success) {
        response.json({
          success: true,
          message: 'Test notification sent successfully'
        });
      } else {
        response.status(500).json({
          success: false,
          error: 'Failed to send test notification'
        });
      }
    } catch (error: any) {
      console.error('[CloudFunction] testNotification failed:', error);
      response.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * HTTP function: Get polling stats
 * 
 * Returns statistics about current polling state
 * 
 * Example: https://your-function-url/getStats
 */
export const getStats = onRequest(
  {
    memory: '128MiB',
    timeoutSeconds: 30,
  },
  async (request, response) => {
    console.log('[CloudFunction] getStats triggered');

    try {
      const stats = await getPollingStats();

      response.json({
        success: true,
        stats: {
          ...stats,
          supportedSports: ProviderRegistry.getSupportedSports(),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('[CloudFunction] getStats failed:', error);
      response.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * HTTP function: Health check
 * 
 * Simple health check endpoint to verify functions are working
 * 
 * Example: https://your-function-url/healthCheck
 */
export const healthCheck = onRequest(
  {
    memory: '128MiB',
    timeoutSeconds: 10,
  },
  async (request, response) => {
    console.log('[CloudFunction] healthCheck triggered');

    response.json({
      success: true,
      message: 'Sports Notifications Backend is healthy',
      timestamp: new Date().toISOString(),
      providers: ProviderRegistry.getSupportedSports()
    });
  }
);
