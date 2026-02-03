/**
 * Daily schedule fetch job
 * 
 * Purpose: Fetch and store the day's game schedule for all supported sports
 * 
 * Schedule: Runs once per day at 6:00 AM UTC (configurable)
 * 
 * Cost optimization:
 * - Single API call per sport per day
 * - Stores games in Firestore for quick access by polling job
 * - Estimated cost: ~1-5 API calls/day depending on number of sports
 * 
 * Flow:
 * 1. Get current date
 * 2. For each registered sport provider:
 *    a. Fetch schedule for today
 *    b. Store games in Firestore
 * 3. Log summary
 */

import { gameRepository } from '../services/firestore';
import { ProviderRegistry } from '../providers/SportProvider';

/**
 * Fetch today's schedule for all sports
 */
export async function fetchDailySchedule(): Promise<void> {
  console.log('[FetchDailySchedule] Starting daily schedule fetch');
  
  const today = new Date();
  console.log(`[FetchDailySchedule] Fetching schedule for ${today.toISOString()}`);
  
  try {
    const providers = ProviderRegistry.getAllProviders();
    
    if (providers.length === 0) {
      console.warn('[FetchDailySchedule] No providers registered');
      return;
    }
    
    console.log(`[FetchDailySchedule] Found ${providers.length} sport providers`);
    
    let totalGames = 0;
    
    // Fetch schedule for each sport
    for (const provider of providers) {
      try {
        console.log(`[FetchDailySchedule] Fetching ${provider.sport} schedule`);
        
        const games = await provider.fetchSchedule(today);
        
        console.log(`[FetchDailySchedule] Found ${games.length} ${provider.sport} games`);
        
        if (games.length > 0) {
          // Store games in Firestore
          await gameRepository.saveGames(games);
          totalGames += games.length;
        }
        
      } catch (error) {
        console.error(`[FetchDailySchedule] Error fetching ${provider.sport} schedule:`, error);
        // Continue processing other sports
      }
    }
    
    console.log(`[FetchDailySchedule] Successfully fetched ${totalGames} games total`);
    
  } catch (error) {
    console.error('[FetchDailySchedule] Fatal error:', error);
    throw error;
  }
}

/**
 * Fetch schedule for a specific date
 * 
 * Useful for backfilling or fetching future schedules
 */
export async function fetchScheduleForDate(date: Date): Promise<void> {
  console.log(`[FetchDailySchedule] Fetching schedule for ${date.toISOString()}`);
  
  try {
    const providers = ProviderRegistry.getAllProviders();
    let totalGames = 0;
    
    for (const provider of providers) {
      try {
        const games = await provider.fetchSchedule(date);
        
        if (games.length > 0) {
          await gameRepository.saveGames(games);
          totalGames += games.length;
        }
        
      } catch (error) {
        console.error(`[FetchDailySchedule] Error fetching ${provider.sport} for ${date}:`, error);
      }
    }
    
    console.log(`[FetchDailySchedule] Fetched ${totalGames} games for ${date.toISOString()}`);
    
  } catch (error) {
    console.error('[FetchDailySchedule] Error:', error);
    throw error;
  }
}

/**
 * Fetch schedules for a date range
 * 
 * Useful for initial setup or after downtime
 */
export async function fetchScheduleForDateRange(
  startDate: Date,
  endDate: Date
): Promise<void> {
  console.log(`[FetchDailySchedule] Fetching schedules from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  const currentDate = new Date(startDate);
  let daysProcessed = 0;
  
  while (currentDate <= endDate) {
    try {
      await fetchScheduleForDate(new Date(currentDate));
      daysProcessed++;
      
      // Add delay to respect API rate limits
      await sleep(1000); // 1 second between requests
      
    } catch (error) {
      console.error(`[FetchDailySchedule] Error fetching ${currentDate.toISOString()}:`, error);
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  console.log(`[FetchDailySchedule] Processed ${daysProcessed} days`);
}

/**
 * Utility: Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate that all providers are configured correctly
 * 
 * Should be called before running any scheduled jobs
 */
export function validateProviders(): boolean {
  const providers = ProviderRegistry.getAllProviders();
  
  if (providers.length === 0) {
    console.error('[FetchDailySchedule] No providers registered!');
    return false;
  }
  
  let allValid = true;
  
  for (const provider of providers) {
    const isValid = provider.validateConfiguration();
    
    if (!isValid) {
      console.error(`[FetchDailySchedule] Provider ${provider.sport} configuration is invalid`);
      allValid = false;
    } else {
      console.log(`[FetchDailySchedule] Provider ${provider.sport} is valid`);
    }
  }
  
  return allValid;
}
