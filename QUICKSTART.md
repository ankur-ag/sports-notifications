# Sports Notifications Backend - Quick Start Guide

Get up and running in 10 minutes.

## Prerequisites

- Node.js 18+ installed
- Firebase CLI installed: `npm install -g firebase-tools`
- Firebase project created (free tier is fine)
- (Optional) NBA API key from https://www.balldontlie.io

## Step 1: Firebase Project Setup

```bash
# Login to Firebase
firebase login

# Navigate to project directory
cd sports-notifications

# Initialize Firebase
firebase init
```

Select:
- **Firestore**: Yes (default rules are fine for now)
- **Functions**: Yes
  - Language: TypeScript
  - ESLint: Yes
  - Install dependencies: Yes
- **Use existing project**: Select your Firebase project

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Configure Environment Variables

### Option A: Firebase Functions Config (Recommended)

```bash
# Optional: Set NBA API key (free tier works without it)
firebase functions:config:set nba.api_key="your-api-key-here"

# Configure event thresholds (optional, has defaults)
firebase functions:config:set \
  event.thresholds.blowout="20" \
  event.thresholds.close_game="5"
```

### Option B: Local .env File (Development Only)

```bash
cp .env.example .env
# Edit .env and add your values
```

## Step 4: Create Firestore Indexes

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Navigate to **Firestore Database** → **Indexes**
4. Create composite index:
   - Collection: `games`
   - Fields: 
     - `status` (Ascending)
     - `scheduledTime` (Ascending)

Or use the Firebase CLI:
```bash
firebase deploy --only firestore:indexes
```

## Step 5: Build and Deploy

```bash
# Build TypeScript
npm run build

# Deploy to Firebase
npm run deploy
```

This will deploy all Cloud Functions. First deployment takes 2-5 minutes.

## Step 6: Test Your Setup

### Test 1: Fetch Today's Schedule

```bash
# Get your function URL from deployment output, then:
curl "https://us-central1-your-project.cloudfunctions.net/manualFetchSchedule"
```

Expected response:
```json
{
  "success": true,
  "message": "Fetched today's schedule"
}
```

### Test 2: Check Firestore

1. Go to Firebase Console → Firestore
2. Look for `games` collection
3. Should see today's NBA games (if any are scheduled)

### Test 3: Send Test Notification

You'll need an FCM token from your iOS app:

```bash
curl -X POST "https://us-central1-your-project.cloudfunctions.net/testNotification" \
  -H "Content-Type: application/json" \
  -d '{"fcmToken":"YOUR_FCM_TOKEN_HERE"}'
```

### Test 4: Check Polling Stats

```bash
curl "https://us-central1-your-project.cloudfunctions.net/getStats"
```

Expected response:
```json
{
  "success": true,
  "stats": {
    "liveGamesCount": 0,
    "scheduledTodayCount": 5,
    "supportedSports": ["NBA"],
    "timestamp": "2024-01-15T12:00:00.000Z"
  }
}
```

## Step 7: Verify Scheduled Functions

The following functions will now run automatically:

- **fetchDailySchedule**: Every day at 6 AM UTC
- **pollLiveGames**: Every 5 minutes
- **pollScheduledGames**: Every 2 minutes

Check logs:
```bash
firebase functions:log
```

## Step 8: iOS App Integration

### Add User Preferences to Firestore

When a user signs up or updates preferences in your iOS app, save to Firestore:

```
Collection: users/{userId}/preferences/notifications

Document structure:
{
  userId: "user123",
  fcmToken: "token-from-ios",
  platform: "ios",
  enabled: true,
  sports: {
    NBA: {
      enabled: true,
      teams: ["nba_team_1", "nba_team_2"],
      eventTypes: ["GAME_START", "GAME_END", "CLOSE_GAME"]
    }
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Get Team IDs

Team IDs follow the format: `nba_team_{id}`

Common NBA teams:
- Lakers: `nba_team_14`
- Warriors: `nba_team_10`
- Celtics: `nba_team_2`

To find team IDs:
1. Fetch a game from the API
2. Check the `homeTeam.id` and `awayTeam.id` fields

## Troubleshooting

### Functions not deploying?

```bash
# Check Node version
node --version  # Should be 18+

# Clean and rebuild
rm -rf lib node_modules
npm install
npm run build
npm run deploy
```

### No games fetched?

- Check if there are NBA games scheduled today
- Verify API key is set (if using one)
- Check function logs: `firebase functions:log --only scheduledFetchDailySchedule`

### Firestore permission denied?

Update Firestore rules (for development only):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // Development only!
    }
  }
}
```

**Note**: In production, use proper security rules.

### Function timeout?

Increase timeout in `src/index.ts`:
```typescript
timeoutSeconds: 540  // 9 minutes
```

## Next Steps

✅ Functions deployed and running
✅ Schedule fetching working
✅ Test notification sent

Now you can:
1. **Monitor logs**: `firebase functions:log`
2. **Add more users**: Create user preferences in Firestore
3. **Wait for live games**: Functions will auto-detect events and notify users
4. **Add more sports**: Implement additional providers (NFL, MLB, etc.)

## Cost Monitoring

Check your usage in Firebase Console:
- Functions → Usage
- Firestore → Usage

Free tier limits:
- Cloud Functions: 2M invocations/month
- Firestore: 50K reads, 20K writes, 20K deletes per day

Typical usage: ~5,000-10,000 function invocations per day (well within free tier).

## Getting Help

- Check logs: `firebase functions:log`
- Review [README.md](./README.md) for detailed docs
- Firebase documentation: https://firebase.google.com/docs/functions

---

**You're all set! 🎉**

Your backend is now running and will automatically:
- Fetch schedules daily
- Poll live games
- Detect events
- Send notifications to subscribed users
