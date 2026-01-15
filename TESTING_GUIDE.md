# Performance Testing Guide

This guide will help you verify that all performance optimizations are working correctly.

## Prerequisites

- Meteor server running (`meteor`)
- At least one hunt with 50+ puzzles (preferably 100+)
- Chrome or Firefox with DevTools
- Access to MongoDB shell (optional but recommended)

---

## Quick Start

```bash
./test-performance.sh
```

This interactive script will guide you through all tests.

---

## Detailed Test Plan

### 🟢 Test 1: Database Indexes (Server-Side)

**What:** Verify the new compound index on Subscribers collection was created.

**How:**
1. Connect to MongoDB:
   ```bash
   meteor mongo
   ```

2. List indexes on jr_subscribers:
   ```javascript
   db.jr_subscribers.getIndexes()
   ```

3. **Expected Output:** You should see:
   ```javascript
   [
     { v: 2, key: { _id: 1 }, name: '_id_' },
     { v: 2, key: { server: 1 }, name: 'server_1' },
     { v: 2, key: { 'context.hunt': 1 }, name: 'context.hunt_1' },
     { v: 2, key: { name: 1 }, name: 'name_1' },
     { v: 2, key: { name: 1, user: 1 }, name: 'name_1_user_1' }  // ← NEW!
   ]
   ```

4. **Pass Criteria:** `name_1_user_1` index exists

**Why:** This compound index optimizes viewer filtering queries.

---

### 🟢 Test 2: Drive Activity Polling Interval (Server-Side)

**What:** Verify polling interval increased from 5s to 15s.

**How:**
1. Watch server logs:
   ```bash
   meteor | grep "Fetching Drive activity"
   ```

2. **Expected Output:** Messages appear approximately every 15 seconds (±5s jitter):
   ```
   [2026-01-14 14:30:15] Fetching Drive activity
   [2026-01-14 14:30:27] Fetching Drive activity  (12s later)
   [2026-01-14 14:30:44] Fetching Drive activity  (17s later)
   ```

3. **Pass Criteria:** Average interval is 10-20 seconds (not 4-6 seconds)

**Why:** Reduces Google Drive API calls by 66%.

---

### 🔴 Test 3: PuzzleListPage Performance (Client-Side - CRITICAL)

**What:** Verify viewer filtering doesn't cause UI lag with 100+ puzzles.

**Setup:**
1. Navigate to a hunt with 100+ puzzles
2. Open Chrome DevTools (F12) → Performance tab
3. Click "Record" (circle icon)

**Test Steps:**
1. Select a viewer from the "Filter by viewer" dropdown
2. Wait 1 second
3. Clear the filter
4. Stop recording in DevTools

**Analysis:**
1. In the Performance timeline, look for long tasks (yellow/red bars)
2. Check the "Main" thread for any blocks > 50ms
3. Look at the flame chart - should NOT see thousands of Minimongo queries

**Expected Results:**
- No tasks longer than 50ms
- Smooth 60fps scrolling
- Filter change feels instant (<100ms)
- **BEFORE FIX:** You'd see 1000+ `Subscribers.find()` calls
- **AFTER FIX:** You should see 1-2 `Subscribers.find()` calls

**Pass Criteria:**
- ✅ Filter changes feel instant
- ✅ No UI freezing or jank
- ✅ Performance timeline shows smooth operation

**Screenshot:**
Take a screenshot of the Performance timeline showing the optimization.

---

### 🟡 Test 4: Command Handler Performance (Client-Side)

#### Test 4a: `/users` Command

**Setup:**
1. Open a puzzle with significant activity (100+ chat messages)
2. Open browser console to see timing

**Test:**
1. Type in chat: `/users`
2. Measure response time

**Expected:**
- Response arrives in < 2 seconds
- Shows all active users with their activity counts
- No browser console errors

**Pass Criteria:**
- ✅ Response time < 2 seconds
- ✅ Data looks complete and reasonable
- ✅ No errors in console

#### Test 4b: `/recent` Command

**Test:**
1. Type in chat: `/recent`
2. Verify shows only last 30 minutes of activity

**Expected:**
- Response arrives in < 1 second
- Only shows recent (last 30 min) activity
- Activity counts are reasonable

**Pass Criteria:**
- ✅ Fast response (< 1 second)
- ✅ Only recent activity shown

---

### 🟡 Test 5: Rate Limiting (Client-Side)

#### Test 5a: OpenAI /summary Rate Limit

**Prerequisites:** `OPENAI_API_KEY` must be set in environment.

**Test:**
1. Type: `/summary`
2. Wait for AI response (5-10 seconds)
3. **Immediately** type: `/summary` again
4. Check response

**Expected:**
```
⏱️ Please wait X seconds before requesting another summary for this puzzle.
```
(where X is close to 300 seconds = 5 minutes)

5. Wait the specified time
6. Type: `/summary` again
7. Should work normally

**Pass Criteria:**
- ✅ Second request is blocked with wait message
- ✅ After waiting, request succeeds
- ✅ Rate limit is per (puzzle, user) pair

---

### 🟢 Test 6: Viewer Filtering Accuracy (Client-Side)

**What:** Verify the optimized viewer filtering still works correctly.

**Test:**
1. Open puzzle list with multiple active users
2. Note which puzzles show viewers in tooltips (hover over sparklines)
3. Select a specific user from "Filter by viewer" dropdown
4. Verify only puzzles that user is viewing are shown

**Pass Criteria:**
- ✅ Filter accurately shows only puzzles with selected viewer
- ✅ Clearing filter shows all puzzles again
- ✅ Quick filter badges (if visible) work correctly

---

### 🔵 Test 7: Exponential Backoff (Optional - Advanced)

**What:** Verify Drive Activity fetcher uses exponential backoff on errors.

**Setup (requires server access):**
1. Temporarily invalidate Google Drive credentials
2. Watch server logs for error messages

**Expected Log Output:**
```
Error fetching drive activity { consecutiveErrors: 1, backoffMs: 5000 }
Error fetching drive activity { consecutiveErrors: 2, backoffMs: 10000 }
Error fetching drive activity { consecutiveErrors: 3, backoffMs: 20000 }
Error fetching drive activity { consecutiveErrors: 4, backoffMs: 40000 }
Error fetching drive activity { consecutiveErrors: 5, backoffMs: 60000 }
Error fetching drive activity { consecutiveErrors: 6, backoffMs: 60000 }
```

**Pass Criteria:**
- ✅ Backoff doubles each time: 5s → 10s → 20s → 40s → 60s (max)
- ✅ Stays at 60s max after hitting ceiling

**Recovery Test:**
1. Restore valid credentials
2. Verify fetcher recovers automatically
3. Check `consecutiveErrors` resets to 0

---

## Load Testing (Optional)

### Simulate High Load

**Tools:** You can use browser automation or multiple browser windows.

**Test Scenario:**
1. Open 5-10 browser tabs
2. Each tab navigates to puzzle list page
3. Randomly filter by different viewers
4. Monitor:
   - Server CPU usage (should stay < 50%)
   - Memory usage (should not spike)
   - Response times (should stay consistent)

**Pass Criteria:**
- ✅ Server handles multiple concurrent users smoothly
- ✅ No memory leaks over 5-10 minutes
- ✅ Response times stay consistent

---

## Performance Benchmarks

Record these metrics before/after for comparison:

| Metric | Target | Your Result |
|--------|--------|-------------|
| PuzzleListPage filter time (100 puzzles) | < 100ms | _____ ms |
| `/users` response time | < 2s | _____ s |
| `/recent` response time | < 1s | _____ s |
| Drive API calls per hour | ~240 | _____ |
| UI lag when filtering | None | _____ |

---

## Troubleshooting

### Issue: Compound index not created

**Solution:**
1. Check server logs for index creation errors
2. Manually create index:
   ```javascript
   db.jr_subscribers.createIndex({ name: 1, user: 1 })
   ```

### Issue: Viewer filtering still slow

**Check:**
1. Open browser DevTools → Performance
2. Look for excessive Minimongo queries
3. Verify changes were applied: `git diff HEAD~1 imports/client/components/PuzzleListPage.tsx`

### Issue: Rate limiting not working

**Check:**
1. Server logs for rate limit cache initialization
2. Verify OPENAI_API_KEY is set
3. Try clearing browser cache

---

## Rollback Procedure

If any critical issues are found:

```bash
# Rollback all performance changes
git revert HEAD

# Or rollback specific files:
git checkout HEAD~1 -- imports/client/components/PuzzleListPage.tsx
git checkout HEAD~1 -- imports/server/hooks/CommandHooks.ts
git checkout HEAD~1 -- imports/server/gdriveActivityFetcher.ts
git checkout HEAD~1 -- imports/server/models/Subscribers.ts

# Restart server
meteor
```

---

## Success Criteria Summary

All tests passing means:

- ✅ **Critical:** PuzzleListPage with 100+ puzzles is responsive
- ✅ **Critical:** Viewer filtering has no UI lag
- ✅ **High:** Database indexes are created
- ✅ **High:** Command handlers respond quickly
- ✅ **High:** Rate limiting prevents abuse
- ✅ **Medium:** Drive polling interval is optimized
- ✅ **Medium:** Error backoff works correctly

---

## Next Steps After Testing

1. ✅ All tests pass → Deploy to production
2. ⚠️ Some tests fail → Review PERFORMANCE_IMPROVEMENTS.md for debugging
3. ❌ Critical tests fail → Consider rollback and investigation

---

## Questions?

Check these resources:
- [PERFORMANCE_IMPROVEMENTS.md](PERFORMANCE_IMPROVEMENTS.md) - Detailed technical documentation
- Chrome DevTools Performance docs: https://developer.chrome.com/docs/devtools/performance/
- MongoDB index documentation: https://www.mongodb.com/docs/manual/indexes/

Good luck with testing! 🚀
