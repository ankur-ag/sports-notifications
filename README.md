# Sports Notifications Backend

A sport-agnostic push notification backend built on Firebase Cloud Functions, designed to send real-time notifications for live sports events.

## 🏗️ Architecture

### Design Principles

- **Sport-agnostic**: Normalized data model works across NBA, NFL, MLB, Soccer, etc.
- **Cost-conscious**: Minimal API calls, efficient polling, free-tier friendly
- **Scalable**: Firebase Cloud Functions auto-scale with demand
- **Extensible**: Easy to add new sports via provider pattern
- **iOS-first**: Optimized for Apple Push Notifications via FCM

### Core Components

```
/src
  /models          - Data models (Game, Event, UserPreferences)
  /providers       - Sport data providers (SportProvider, NBAProvider)
  /services        - External services (Firestore, FCM)
  /engine          - Core logic (event detection, notification dispatch)
  /jobs            - Scheduled tasks (fetch schedule, poll games)
  index.ts         - Firebase Cloud Functions exports
```

### Data Flow

```
1. Daily Schedule Fetch (6 AM UTC)
   ├─ Fetch today's games from sport API
   └─ Store in Firestore

2. Live Game Polling (every 2-5 minutes)
   ├─ Query Firestore for live games
   ├─ Fetch updated data from sport API
   ├─ Compare old vs new state
   ├─ Detect events (game start, end, blowout, etc.)
   ├─ Query users subscribed to teams
   ├─ Send FCM notifications
   └─ Update game state in Firestore

3. Event Detection
   ├─ Game lifecycle: START, END, POSTPONED
   ├─ Score-based: BLOWOUT, CLOSE_GAME
   └─ Time-based: FINAL_PERIOD, OVERTIME
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Firebase project with Firestore and Cloud Functions enabled
- NBA API key (optional for free tier): https://www.balldontlie.io

### Installation

```bash
cd sports-notifications
npm install
```

### Configuration

1. **Firebase Setup**
   ```bash
   firebase login
   firebase init
   # Select:
   # - Firestore
   # - Functions (TypeScript)
   # - Use existing project
   ```

2. **Environment Variables**
   ```bash
   firebase functions:config:set \
     nba.api_key="your-nba-api-key" \
     event.thresholds.blowout="20" \
     event.thresholds.close_game="5"
   ```

3. **Firestore Indexes**
   
   Create these indexes in Firebase Console:
   - Collection: `games`
     - Fields: `status` (ASC), `scheduledTime` (ASC)
   - Collection: `games`
     - Fields: `scheduledTime` (ASC), `status` (ASC)

### Local Development

```bash
# Build TypeScript
npm run build

# Run emulators
npm run serve

# Test functions locally
firebase functions:shell
```

### Deployment

```bash
# Deploy all functions
npm run deploy

# Deploy specific function
firebase deploy --only functions:scheduledFetchDailySchedule
```

## 📋 Available Functions

### Scheduled Functions

| Function | Schedule | Purpose |
|----------|----------|---------|
| `scheduledFetchDailySchedule` | Daily at 6 AM UTC | Fetch today's game schedule |
| `scheduledPollLiveGames` | Every 5 minutes | Poll live games for events |
| `scheduledPollScheduledGames` | Every 2 minutes | Catch game starts |

### HTTP Functions (Testing)

| Function | Method | Purpose |
|----------|--------|---------|
| `manualFetchSchedule` | GET | Manually trigger schedule fetch |
| `manualPollGame` | GET | Poll a specific game |
| `testNotification` | POST | Send test FCM notification |
| `getStats` | GET | Get polling statistics |

#### Example HTTP Calls

```bash
# Fetch schedule for a specific date
curl "https://your-region-your-project.cloudfunctions.net/manualFetchSchedule?date=2024-01-15"

# Poll a specific game
curl "https://your-region-your-project.cloudfunctions.net/manualPollGame?gameId=nba_12345"

# Send test notification
curl -X POST "https://your-region-your-project.cloudfunctions.net/testNotification" \
  -H "Content-Type: application/json" \
  -d '{"fcmToken":"your-fcm-token-here"}'

# Get stats
curl "https://your-region-your-project.cloudfunctions.net/getStats"
```

## 🏀 Supported Sports

### Currently Implemented

- **NBA** - Via balldontlie.io API (free tier available)

### Coming Soon

- **NFL** - American Football
- **MLB** - Baseball
- **NHL** - Hockey
- **Soccer** - Major leagues

## 📊 Event Types

| Event | Priority | When Triggered |
|-------|----------|----------------|
| `GAME_START` | HIGH | Game transitions from SCHEDULED to LIVE |
| `GAME_END` | HIGH | Game transitions from LIVE to FINAL |
| `CLOSE_GAME` | HIGH | Score within 5 points in final period |
| `BLOWOUT` | MEDIUM | Point differential exceeds 20 |
| `FINAL_PERIOD` | MEDIUM | Entering final quarter/period |
| `OVERTIME` | HIGH | Game goes into overtime |
| `GAME_POSTPONED` | MEDIUM | Game is postponed |
| `GAME_CANCELLED` | MEDIUM | Game is cancelled |

## 🔧 Configuration

### Environment Variables

Set via Firebase Functions config:

```bash
# NBA API
firebase functions:config:set nba.api_key="your-key"

# Event thresholds
firebase functions:config:set \
  event.thresholds.blowout="20" \
  event.thresholds.close_game="5" \
  event.thresholds.comeback="15"

# Feature flags
firebase functions:config:set \
  features.use_emoji="true"
```

Access in code:
```typescript
const apiKey = process.env.NBA_API_KEY;
```

### Polling Intervals

Adjust in `src/index.ts`:

```typescript
// Poll live games every 10 minutes (instead of 5)
schedule: '*/10 * * * *'

// Poll scheduled games every 5 minutes (instead of 2)
schedule: '*/5 * * * *'
```

### Event Thresholds

Adjust in `src/models/Event.ts`:

```typescript
export const EVENT_THRESHOLDS = {
  BLOWOUT_POINT_DIFFERENTIAL: 25,      // Increase for less sensitive
  CLOSE_GAME_POINT_DIFFERENTIAL: 7,    // Increase to notify later
  COMEBACK_POINT_DIFFERENTIAL: 20,     // Increase for bigger comebacks
};
```

## 💰 Cost Estimates

### API Calls Per Day

- **Daily schedule fetch**: 1 call per sport
- **Live game polling**: ~50-100 calls (10 games × 5-10 polls)
- **Total**: ~100-200 API calls/day

### Firebase Costs (free tier limits)

- **Cloud Functions**: 2M invocations/month (plenty)
- **Firestore**: 50K reads/day, 20K writes/day (sufficient)
- **FCM**: Unlimited (free)

**Estimated monthly cost**: $0-5 (within free tier for most use cases)

## 🧪 Testing

### Unit Tests (TODO)

```bash
npm test
```

### Integration Tests

1. **Test schedule fetch**
   ```bash
   curl "https://your-function-url/manualFetchSchedule"
   ```

2. **Test notification**
   - Get FCM token from your iOS app
   - Send test notification via `testNotification` function

3. **Monitor logs**
   ```bash
   firebase functions:log --only scheduledPollLiveGames
   ```

## 📱 iOS Integration

### Setup FCM in iOS App

1. Add Firebase iOS SDK to your app
2. Configure FCM in AppDelegate
3. Request notification permissions
4. Get FCM token and store in user preferences

### Example Swift Code

```swift
import FirebaseMessaging

// Request permissions
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
    if granted {
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }
}

// Get FCM token
Messaging.messaging().token { token, error in
    if let token = token {
        // Send to your backend
        self.saveUserPreferences(fcmToken: token)
    }
}
```

## 🔍 Monitoring

### Cloud Functions Dashboard

View metrics in Firebase Console:
- Function executions
- Error rates
- Execution times
- Memory usage

### Logs

```bash
# View all logs
firebase functions:log

# View specific function
firebase functions:log --only scheduledPollLiveGames

# Tail logs
firebase functions:log --only scheduledPollLiveGames --limit 50
```

### Alerts

Set up alerts in Firebase Console for:
- Function errors
- High execution time
- Failed invocations

## 🛠️ Adding a New Sport

1. **Create provider** (e.g., `NFLProvider.ts`)
   ```typescript
   export class NFLProvider extends BaseSportProvider {
     readonly sport = Sport.NFL;
     
     async fetchSchedule(date: Date): Promise<Game[]> {
       // Implement
     }
     
     async fetchGame(gameId: string): Promise<Game> {
       // Implement
     }
   }
   ```

2. **Register provider** in `src/index.ts`
   ```typescript
   const nflProvider = createNFLProvider(process.env.NFL_API_KEY);
   ProviderRegistry.register(nflProvider);
   ```

3. **Add sport to enum** in `src/models/Game.ts`
   ```typescript
   export enum Sport {
     NBA = 'NBA',
     NFL = 'NFL', // Add this
   }
   ```

That's it! The rest of the system is sport-agnostic.

## 📚 Additional Documentation

- [Architecture Details](./ARCHITECTURE.md) (TODO)
- [API Reference](./API.md) (TODO)
- [Deployment Guide](./DEPLOYMENT.md) (TODO)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

## 📄 License

MIT

## 🙋 Support

For questions or issues:
- File a GitHub issue
- Check Firebase documentation
- Review logs for error details
