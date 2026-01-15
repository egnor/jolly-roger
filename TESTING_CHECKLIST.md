# Performance Testing Checklist

Quick reference checklist for testing performance improvements.

## ✅ Pre-Testing Setup

- [ ] Meteor server is running (`meteor`)
- [ ] You have access to a hunt with 50+ puzzles (ideally 100+)
- [ ] Browser DevTools are available (Chrome recommended)
- [ ] MongoDB shell access (optional but helpful)

---

## 🧪 Quick Tests (5-10 minutes)

### Test 1: Viewer Filter Responsiveness ⚡ **CRITICAL**

**Location:** Puzzle list page with 100+ puzzles

**Steps:**
1. [ ] Open puzzle list page
2. [ ] Open Chrome DevTools → Performance tab
3. [ ] Click Record
4. [ ] Select a viewer from "Filter by viewer" dropdown
5. [ ] Stop recording
6. [ ] Check for long tasks (should be < 50ms)

**Pass:** ✅ No UI lag, filter feels instant
**Fail:** ❌ UI freezes or stutters

---

### Test 2: Browser Console Performance Test

**Location:** Puzzle list page

**Steps:**
1. [ ] Open browser console (F12)
2. [ ] Copy contents of `browser-perf-test.js` into console
3. [ ] Run: `testViewerFilterPerformance()`
4. [ ] Check results table

**Pass:** ✅ Average time < 100ms
**Fail:** ❌ Average time > 500ms

---

### Test 3: Command Handler Speed

**Location:** Any puzzle page

**Steps:**
1. [ ] Type `/users` in chat
2. [ ] Check response time (browser console or stopwatch)
3. [ ] Type `/recent` in chat
4. [ ] Check response time

**Pass:**
- ✅ `/users` responds in < 2 seconds
- ✅ `/recent` responds in < 1 second

**Fail:**
- ❌ Either command takes > 5 seconds

---

### Test 4: Rate Limiting

**Location:** Any puzzle page (requires OPENAI_API_KEY)

**Steps:**
1. [ ] Type `/summary` in chat
2. [ ] Wait for response
3. [ ] Immediately type `/summary` again
4. [ ] Verify you get "Please wait X seconds" message

**Pass:** ✅ Second request is blocked
**Fail:** ❌ Second request goes through immediately

---

## 🔧 Advanced Tests (Optional - 15-30 minutes)

### Test 5: Database Indexes

**Steps:**
1. [ ] Connect to MongoDB: `meteor mongo`
2. [ ] Run: `db.jr_subscribers.getIndexes()`
3. [ ] Verify `name_1_user_1` index exists

**Pass:** ✅ Compound index exists
**Fail:** ❌ Index missing

---

### Test 6: Drive Activity Polling

**Steps:**
1. [ ] Watch server logs: `meteor | grep "Fetching Drive activity"`
2. [ ] Note timestamps between messages
3. [ ] Calculate average interval

**Pass:** ✅ ~15 seconds between fetches (±5s)
**Fail:** ❌ ~5 seconds between fetches

---

### Test 7: Stress Test

**Location:** Puzzle list page

**Steps:**
1. [ ] Open browser console
2. [ ] Run: `stressTestViewerFilters(20)`
3. [ ] Wait for completion
4. [ ] Check results

**Pass:**
- ✅ Average time < 200ms per iteration
- ✅ Memory change < 10MB

**Fail:**
- ❌ Average time > 500ms
- ❌ Memory leak detected (>10MB increase)

---

## 📊 Results Summary

| Test | Status | Time/Metric | Notes |
|------|--------|-------------|-------|
| Viewer Filter | ⬜ | _____ ms | Target: <100ms |
| /users command | ⬜ | _____ s | Target: <2s |
| /recent command | ⬜ | _____ s | Target: <1s |
| Rate limiting | ⬜ | Pass/Fail | Should block 2nd request |
| Database indexes | ⬜ | Pass/Fail | name_1_user_1 exists |
| Drive polling | ⬜ | _____ s | Target: ~15s |
| Stress test | ⬜ | _____ ms/iter | Target: <200ms |

Legend: ⬜ Not tested | ✅ Pass | ⚠️ Warning | ❌ Fail

---

## 🚨 What to Do If Tests Fail

### Viewer filter is slow (> 200ms)
1. Check git status: `git diff imports/client/components/PuzzleListPage.tsx`
2. Verify changes are applied (look for `Subscribers.find({}).fetch()`)
3. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+F5)
4. Check browser console for JavaScript errors

### Commands are slow (> 5 seconds)
1. Check server logs for errors
2. Verify pagination was applied: `git diff imports/server/hooks/CommandHooks.ts`
3. Check if puzzle has abnormally large data (10,000+ messages)
4. Try on a different puzzle

### Rate limiting not working
1. Check `OPENAI_API_KEY` is set: `echo $OPENAI_API_KEY`
2. Verify changes: `git diff imports/server/hooks/CommandHooks.ts`
3. Restart server: Stop and run `meteor` again
4. Check server console for rate limit logs

### Indexes not created
1. Check server logs on startup for "Creating new index"
2. Manually create: `db.jr_subscribers.createIndex({ name: 1, user: 1 })`
3. Verify permissions on database

---

## ✅ Success Criteria

**Minimum for deployment:**
- ✅ Viewer filter is responsive (< 200ms)
- ✅ No UI freezing or jank
- ✅ Commands respond in reasonable time

**Ideal state:**
- ✅ All quick tests pass
- ✅ Database indexes created
- ✅ Rate limiting works
- ✅ Stress test shows no memory leaks

---

## 🚀 After Testing

If all tests pass:
```bash
# Commit any final fixes
git add -A
git commit -m "Verified performance improvements - ready for deployment"

# Push to branch
git push origin LeftOut-exploration
```

If critical tests fail:
```bash
# Consider rollback
git revert HEAD

# Or investigate specific issues
# See TESTING_GUIDE.md for detailed troubleshooting
```

---

## 📞 Need Help?

1. Review [TESTING_GUIDE.md](TESTING_GUIDE.md) for detailed instructions
2. Check [PERFORMANCE_IMPROVEMENTS.md](PERFORMANCE_IMPROVEMENTS.md) for technical details
3. Review Chrome DevTools Performance documentation
4. Check server logs for error messages

---

**Testing completed by:** _______________
**Date:** _______________
**Overall status:** ⬜ Pass | ⬜ Fail | ⬜ Needs investigation
