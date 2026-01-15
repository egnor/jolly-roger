# Performance Testing - Quick Start

This directory contains comprehensive testing tools for the performance optimizations.

## 🚀 Quick Start (5 minutes)

1. **Ensure server is running:**
   ```bash
   meteor
   ```

2. **Run interactive test script:**
   ```bash
   ./test-performance.sh
   ```

3. **Open browser to puzzle list page** and run browser tests (see below)

---

## 📁 Testing Files

| File | Purpose | When to Use |
|------|---------|-------------|
| **TESTING_CHECKLIST.md** | Quick reference checklist | Start here - printable checklist |
| **TESTING_GUIDE.md** | Detailed testing procedures | When you need step-by-step instructions |
| **test-performance.sh** | Interactive test script | Automated/guided server-side testing |
| **browser-perf-test.js** | Browser console utilities | Client-side performance measurement |
| **verify-db-indexes.js** | MongoDB index verification | Database-level testing |
| **PERFORMANCE_IMPROVEMENTS.md** | Technical documentation | Understanding what was changed |

---

## 🎯 Recommended Testing Flow

### For Quick Verification (10 min):
```
1. ✅ TESTING_CHECKLIST.md → Check quick tests
2. ✅ Run ./test-performance.sh
3. ✅ Browser console: Run browser-perf-test.js
4. ✅ Done!
```

### For Comprehensive Testing (30 min):
```
1. ✅ Read TESTING_GUIDE.md
2. ✅ Run ./test-performance.sh (all tests)
3. ✅ Browser console: Run all browser tests
4. ✅ MongoDB: Run verify-db-indexes.js
5. ✅ Chrome DevTools: Performance profiling
6. ✅ Fill out TESTING_CHECKLIST.md
```

---

## 🧪 Browser Testing (Chrome DevTools)

### Setup:
1. Open puzzle list page with 100+ puzzles
2. Press F12 to open DevTools
3. Copy contents of `browser-perf-test.js`
4. Paste into Console tab
5. Press Enter

### Run Tests:
```javascript
// Quick performance test (recommended first)
testViewerFilterPerformance()

// Measure specific commands
testCommandPerformance("/users")
testCommandPerformance("/recent")

// Stress test
stressTestViewerFilters(20)

// Get performance snapshot
takePerformanceSnapshot()
```

### Example Output:
```
🧪 Testing viewer filter performance...
Found 5 viewers to test
Testing filter for: Alice Smith
Testing filter for: Bob Jones
Testing filter for: Carol White

┌─────────┬──────────────┬──────────┐
│ (index) │   viewer     │ duration │
├─────────┼──────────────┼──────────┤
│    0    │ 'Alice Smith'│ '45.20ms'│
│    1    │ 'Bob Jones'  │ '38.50ms'│
│    2    │ 'Carol White'│ '41.80ms'│
└─────────┴──────────────┴──────────┘

✅ PASS: Average filter time 41.83ms (target: <100ms)
```

---

## 🗄️ Database Testing

### Quick Check:
```bash
meteor mongo
```

Then in MongoDB shell:
```javascript
db.jr_subscribers.getIndexes()
```

Look for:
```javascript
{ name: "name_1_user_1", key: { name: 1, user: 1 } }
```

### Automated Check:
```bash
meteor mongo < verify-db-indexes.js
```

---

## 📊 What Each Test Validates

| Test | What It Checks | Critical? | Pass Criteria |
|------|---------------|-----------|---------------|
| **Viewer Filter Perf** | PuzzleListPage optimization | ✅ YES | < 100ms |
| **/users Command** | Pagination working | ⚠️ High | < 2 seconds |
| **/recent Command** | Pagination working | ⚠️ High | < 1 second |
| **Rate Limiting** | OpenAI cost control | ⚠️ High | Blocks 2nd request |
| **DB Indexes** | Index auto-creation | ⚠️ High | Compound index exists |
| **Drive Polling** | API call reduction | 🔵 Medium | ~15s interval |
| **Stress Test** | Memory leaks | 🔵 Medium | No leaks detected |

---

## 🎓 Performance Profiling Tips

### Chrome DevTools Performance Tab:

1. **Record a profile:**
   - Click Record button (circle)
   - Apply viewer filter
   - Wait 1 second
   - Stop recording

2. **What to look for:**
   - **Long tasks** (yellow/red bars) - should be < 50ms
   - **Frame rate** - should stay at 60fps
   - **Main thread** - should not be blocked
   - **Memory** - should not increase continuously

3. **Flame chart analysis:**
   - Before optimization: Thousands of `Subscribers.find()` calls
   - After optimization: 1-2 `Subscribers.find()` calls

### Example Good Result:
```
Main Thread:
  ████ (38ms) - Event: change
    ██ (5ms) - Subscribers.find()
    ███ (12ms) - React render
  ████ (42ms) - Event: change (clear filter)
    ██ (4ms) - Subscribers.find()
    ███ (13ms) - React render
```

### Example Bad Result (Pre-optimization):
```
Main Thread:
  ███████████████████ (850ms) - Event: change
    ██████ (400ms) - Subscribers.find() x 120 puzzles!!!
    ████ (150ms) - React render
```

---

## 🐛 Troubleshooting

### "Viewer filter is still slow"

**Check:**
1. Hard refresh browser (Cmd+Shift+R)
2. Verify changes applied:
   ```bash
   git diff HEAD~1 imports/client/components/PuzzleListPage.tsx
   ```
3. Look for `Subscribers.find({}).fetch()` in the code
4. Check browser console for errors

**Fix:**
```bash
# Ensure latest code
git status
git pull origin LeftOut-exploration

# Restart browser
# Hard refresh page
```

### "Database index not found"

**Check:**
```bash
meteor mongo
db.jr_subscribers.getIndexes()
```

**Fix:**
```javascript
// In meteor mongo shell:
db.jr_subscribers.createIndex({ name: 1, user: 1 })
```

Or restart server (indexes auto-create on startup).

### "Commands still slow"

**Check server logs:**
```bash
meteor | grep "Error\|WARN"
```

**Verify pagination:**
```bash
git diff HEAD~1 imports/server/hooks/CommandHooks.ts | grep "limit:"
```

Should see limits like `limit: 5000`, `limit: 2000`, etc.

---

## ✅ Success Checklist

Before marking as "Ready for Production":

- [ ] All quick tests pass (TESTING_CHECKLIST.md)
- [ ] Browser performance profiling shows <100ms filter time
- [ ] No JavaScript errors in console
- [ ] Database indexes exist
- [ ] Commands respond quickly
- [ ] Rate limiting works
- [ ] No memory leaks in stress test
- [ ] Server logs show ~15s polling interval
- [ ] All changes committed to git

---

## 📞 Support

If you need help:

1. **Check the guides:**
   - TESTING_GUIDE.md - Detailed procedures
   - PERFORMANCE_IMPROVEMENTS.md - Technical details

2. **Review git changes:**
   ```bash
   git diff HEAD~1
   git log -1 --stat
   ```

3. **Check server logs:**
   ```bash
   meteor | tee server.log
   ```

4. **Browser DevTools:**
   - Console for JavaScript errors
   - Performance for profiling
   - Network for API calls

---

## 🚀 Next Steps

After successful testing:

1. **Mark tests as complete** in TESTING_CHECKLIST.md
2. **Document any issues** found
3. **Commit test results:**
   ```bash
   git add TESTING_CHECKLIST.md
   git commit -m "Performance testing complete - all tests pass"
   ```
4. **Deploy** or merge to main branch
5. **Monitor production** logs for first few hours

---

**Good luck with testing!** 🎉

Remember: Performance testing is about finding issues **before** they affect users. Take your time and be thorough.
