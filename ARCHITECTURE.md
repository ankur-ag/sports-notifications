# Sports Notifications Backend - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Firebase Cloud Functions                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐     ┌──────────────────┐                 │
│  │ Scheduled Jobs   │     │ HTTP Functions   │                 │
│  ├──────────────────┤     ├──────────────────┤                 │
│  │ • Daily Schedule │     │ • Manual Fetch   │                 │
│  │ • Poll Live      │     │ • Test Notify    │                 │
│  │ • Poll Scheduled │     │ • Get Stats      │                 │
│  └────────┬─────────┘     └──────────────────┘                 │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────┐                   │
│  │         Notification Engine             │                   │
│  │  ┌────────────────────────────────┐    │                   │
│  │  │  Event Detector                │    │                   │
│  │  │  • Compare game states         │    │                   │
│  │  │  • Generate events             │    │                   │
│  │  └────────────────────────────────┘    │                   │
│  │  ┌────────────────────────────────┐    │                   │
│  │  │  Notification Dispatcher       │    │                   │
│  │  │  • Query target users          │    │                   │
│  │  │  • Send FCM notifications      │    │                   │
│  │  └────────────────────────────────┘    │                   │
│  └─────────────────────────────────────────┘                   │
│           │                         │                           │
│           ▼                         ▼                           │
│  ┌────────────────┐       ┌────────────────┐                  │
│  │   Providers    │       │   Services     │                  │
│  ├────────────────┤       ├────────────────┤                  │
│  │ • NBAProvider  │       │ • Firestore    │                  │
│  │ • NFLProvider  │       │ • FCM          │                  │
│  │ • MLBProvider  │       └────────────────┘                  │
│  └────────────────┘                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
           │                         │
           ▼                         ▼
    ┌─────────────┐          ┌──────────────┐
    │ Sports APIs │          │  Firestore   │
    │ (balldontlie)│         │   Database   │
    └─────────────┘          └──────────────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │  iOS App    │
                              │  (via FCM)  │
                              └─────────────┘
```

## Component Details

### 1. Models Layer

**Purpose**: Define data structures used throughout the system

**Components**:
- `Game.ts`: Normalized game representation (sport-agnostic)
- `Event.ts`: Detectable game events and their metadata
- `UserPreferences.ts`: User notification subscriptions

**Design Philosophy**:
- Sport-agnostic: Same models work for all sports
- Strongly typed: TypeScript interfaces for type safety
- Extensible: Easy to add fields without breaking existing code

### 2. Providers Layer

**Purpose**: Abstract sport-specific APIs into a common interface

**Components**:
- `SportProvider.ts`: Interface that all providers implement
- `NBAProvider.ts`: NBA-specific implementation
- `BaseSportProvider.ts`: Shared logic for common events

**Contract**:
```typescript
interface SportProvider {
  fetchSchedule(date: Date): Promise<Game[]>
  fetchGame(gameId: string): Promise<Game>
  detectEvents(old: Game, new: Game): Event[]
  validateConfiguration(): boolean
}
```

**Extensibility**: Add new sports by implementing SportProvider interface

### 3. Services Layer

**Purpose**: Handle external service integrations

**Components**:

#### Firestore Service
- **Collections**:
  - `games/{gameId}`: Game state storage
  - `events/{eventId}`: Event audit trail
  - `users/{userId}/preferences/notifications`: User subscriptions

- **Indexes**:
  - `games`: (status, scheduledTime) for querying live games
  - Collection group: For querying users by team

#### FCM Service
- Send individual notifications
- Send batch notifications (up to 500 tokens)
- Handle invalid tokens
- Platform-specific payloads (iOS APNs, Android)

### 4. Engine Layer

**Purpose**: Core business logic for event detection and notification

**Components**:

#### Event Detector (`eventDetector.ts`)
- Pure functions: No side effects
- Idempotent: Same input → same events
- Detects:
  - Lifecycle events: START, END, POSTPONED
  - Score events: BLOWOUT, CLOSE_GAME
  - Time events: FINAL_PERIOD, OVERTIME

**Algorithm**:
```
function detectEvents(oldGame, newGame):
  events = []
  
  if game transitioned to LIVE:
    events.push(GAME_START)
  
  if game transitioned to FINAL:
    events.push(GAME_END)
  
  if game is LIVE:
    differential = abs(home.score - away.score)
    
    if differential > BLOWOUT_THRESHOLD:
      events.push(BLOWOUT)
    
    if differential < CLOSE_THRESHOLD and in_final_period:
      events.push(CLOSE_GAME)
  
  return events
```

#### Notification Engine (`notificationEngine.ts`)
- Orchestrates event → notification flow
- Prevents duplicate notifications (checks Firestore)
- Queries target users
- Dispatches to FCM
- Marks events as notified

**Flow**:
```
1. Receive events from detector
2. For each event:
   a. Check if already notified (Firestore lookup)
   b. Save event to Firestore
   c. Query users subscribed to teams in event
   d. Filter by user preferences (quiet hours, event types)
   e. Send batch FCM notification
   f. Mark event as notified
```

#### Message Builder (`messageBuilder.ts`)
- Template-based message generation
- Future: Personalization based on favorite teams
- Future: A/B testing different message formats

### 5. Jobs Layer

**Purpose**: Scheduled tasks that keep the system running

**Components**:

#### Daily Schedule Fetch (`fetchDailySchedule.ts`)
- **Schedule**: Daily at 6 AM UTC
- **Purpose**: Fetch today's games for all sports
- **Cost**: 1 API call per sport per day
- **Output**: Games stored in Firestore with SCHEDULED status

#### Live Games Polling (`pollLiveGames.ts`)
- **Schedule**: Every 5 minutes
- **Purpose**: Poll live games for score updates
- **Cost**: ~1 API call per live game per poll
- **Logic**:
  1. Query Firestore for games with status=LIVE
  2. For each game: fetch updated data from provider
  3. Compare old vs new state
  4. Detect events
  5. Send notifications
  6. Update game in Firestore

#### Scheduled Games Polling
- **Schedule**: Every 2 minutes
- **Purpose**: Catch game starts (SCHEDULED → LIVE)
- **Logic**: Poll games scheduled within ±30 minutes of now

## Data Flow Diagrams

### Schedule Fetch Flow

```
Daily at 6 AM UTC
       │
       ▼
[Scheduled Function Triggered]
       │
       ▼
For each registered sport:
       │
       ├──> [Call provider.fetchSchedule(today)]
       │           │
       │           ▼
       │    [External Sports API]
       │           │
       │           ▼
       │    [Transform to Game model]
       │           │
       ▼           ▼
[Batch save games to Firestore]
       │
       ▼
[Log summary and exit]
```

### Event Detection & Notification Flow

```
Every 5 minutes
       │
       ▼
[Poll Live Games Function]
       │
       ▼
[Query Firestore: status=LIVE]
       │
       ▼
For each live game:
       │
       ├──> [Fetch from provider API]
       │           │
       │           ▼
       │    [Compare old vs new]
       │           │
       │           ▼
       │    [Detect events]
       │           │
       │           ├──> No events? → Skip
       │           │
       │           ├──> Events found!
       │           │         │
       │           │         ▼
       │           │  [Check if already notified]
       │           │         │
       │           │         ├──> Already notified? → Skip
       │           │         │
       │           │         ▼
       │           │  [Save event to Firestore]
       │           │         │
       │           │         ▼
       │           │  [Query users by team]
       │           │         │
       │           │         ▼
       │           │  [Filter by preferences]
       │           │         │
       │           │         ▼
       │           │  [Send FCM notifications]
       │           │         │
       │           │         ▼
       │           │  [Mark event as notified]
       │           │
       │           ▼
       │    [Save updated game state]
       │
       ▼
[Log results and exit]
```

## Scalability Considerations

### Current Design (0-10K users)
- Direct Firestore queries for user targeting
- Sequential game processing
- Single-region deployment

### Medium Scale (10K-100K users)
- Introduce team subscriptions collection:
  ```
  /team_subscriptions/{teamId}/users/{userId}
  ```
- Parallel game processing
- Batch Firestore writes
- Multi-region functions

### Large Scale (100K+ users)
- Pub/Sub for event distribution
- Separate function per sport
- Redis/Memorystore for caching
- User segmentation
- Rate limiting per user

## Security & Privacy

### Data Protection
- User preferences stored in Firestore with security rules
- No personally identifiable information (PII) in events
- FCM tokens encrypted at rest by Firebase

### Access Control
- Cloud Functions use service account (admin privileges)
- Firestore rules prevent direct client writes
- HTTP functions can add authentication (TODO)

### Compliance
- GDPR: Allow users to delete their data
- COPPA: No data collection from children
- iOS: Request notification permissions

## Monitoring & Observability

### Metrics to Track
- Function execution counts
- Function error rates
- API call counts (cost monitoring)
- Notification delivery rates
- Event detection rates

### Logging Strategy
- Structured logs with prefixes: `[Component] Message`
- Log levels: Info, Warning, Error
- Include context: game IDs, event IDs, user counts

### Alerts
- Function errors > 5%
- API failures
- No games fetched (potential API issue)
- No notifications sent when games are live

## Cost Optimization

### API Calls
- **Current**: ~100-200 calls/day
- **Strategy**: Only poll live games, skip finished games
- **Future**: WebSocket APIs for live updates (if available)

### Cloud Functions
- **Current**: ~300-500 invocations/day
- **Optimization**: Batch processing, early exits
- **Future**: Use Pub/Sub for event-driven architecture

### Firestore
- **Current**: ~1,000 reads/writes per day
- **Optimization**: Denormalized data, minimal updates
- **Future**: Cache frequently accessed data

## Future Enhancements

### Near-term
1. Add more sports (NFL, MLB, NHL)
2. Implement comeback detection
3. Add user-facing API for preferences management
4. Enhance message personalization

### Long-term
1. Machine learning for upset prediction
2. Real-time scores via WebSocket
3. Social features (share events, reactions)
4. Video highlights integration
5. Multi-language support
6. Analytics dashboard

## Testing Strategy

### Unit Tests
- Pure functions: eventDetector, messageBuilder
- Mock external services: Firestore, FCM, APIs

### Integration Tests
- Test with Firebase emulators
- Mock sport API responses
- Verify Firestore writes

### End-to-End Tests
- Deploy to staging environment
- Use test FCM tokens
- Verify notifications received on device

### Load Tests
- Simulate 1,000 concurrent users
- Test batch notification performance
- Monitor function scaling

## Deployment Strategy

### Environments
1. **Development**: Local emulators
2. **Staging**: Separate Firebase project
3. **Production**: Main Firebase project

### CI/CD (Future)
```
GitHub Push → GitHub Actions
     │
     ├──> Run tests
     ├──> Build TypeScript
     ├──> Deploy to staging
     ├──> Run E2E tests
     └──> Deploy to production (if tests pass)
```

### Rollback Strategy
- Firebase versions: Roll back to previous deployment
- Feature flags: Disable features without redeployment
- Database: Keep event audit trail for debugging

---

This architecture is designed to be:
- ✅ **Sport-agnostic**: Easy to add new sports
- ✅ **Cost-effective**: Minimal API calls and compute
- ✅ **Scalable**: Can grow from 100 to 100K users
- ✅ **Maintainable**: Clear separation of concerns
- ✅ **Observable**: Comprehensive logging and monitoring
