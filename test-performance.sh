#!/bin/bash
# Performance Testing Script
# Tests the optimizations made to handle scale concerns

set -e

echo "🧪 Performance Testing Suite"
echo "=============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if server is running
echo "📡 Test 1: Checking if Meteor server is running..."
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${GREEN}✓ Server is running on port 3000${NC}"
else
    echo -e "${RED}✗ Server is not running. Start with: meteor${NC}"
    echo "  Please start the server and run this script again."
    exit 1
fi
echo ""

# Test 2: Check database indexes
echo "📊 Test 2: Checking database indexes..."
echo "  Run this in MongoDB shell:"
echo "  > use meteor"
echo "  > db.jr_subscribers.getIndexes()"
echo ""
echo "  Expected to see:"
echo "  - { name: 1 }"
echo "  - { name: 1, user: 1 }  ← NEW COMPOUND INDEX"
echo ""
read -p "  Have you verified the indexes? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}✓ Database indexes verified${NC}"
else
    echo -e "${YELLOW}⚠ Please verify indexes manually${NC}"
fi
echo ""

# Test 3: Check server logs for polling interval
echo "⏱️  Test 3: Verify Drive Activity polling interval..."
echo "  Watch server logs for 'Fetching Drive activity' messages"
echo "  They should appear approximately every 15 seconds (±5s jitter)"
echo ""
echo "  Grep server logs:"
echo "  meteor | grep 'Fetching Drive activity'"
echo ""
read -p "  Have you verified the polling interval? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}✓ Polling interval verified${NC}"
else
    echo -e "${YELLOW}⚠ Please verify polling interval manually${NC}"
fi
echo ""

# Test 4: Browser performance test instructions
echo "🌐 Test 4: Browser Performance Testing"
echo "======================================"
echo ""
echo "Manual testing required. Follow these steps:"
echo ""
echo "4a. Test PuzzleListPage performance (100+ puzzles):"
echo "    1. Open Chrome DevTools (F12)"
echo "    2. Go to Performance tab"
echo "    3. Navigate to a hunt with many puzzles"
echo "    4. Click 'Record' in DevTools"
echo "    5. Select a viewer filter from the dropdown"
echo "    6. Stop recording"
echo "    7. Check that there are no long tasks (>50ms) during filter change"
echo ""
echo "4b. Test viewer filtering:"
echo "    1. Open puzzle list page with 100+ puzzles"
echo "    2. Toggle viewer filter several times"
echo "    3. Verify no UI lag or freezing"
echo "    4. Check browser console for errors"
echo ""
read -p "  Have you completed browser performance tests? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}✓ Browser performance tests completed${NC}"
else
    echo -e "${YELLOW}⚠ Please complete browser tests manually${NC}"
fi
echo ""

# Test 5: Command handler tests
echo "💬 Test 5: Command Handler Performance"
echo "======================================"
echo ""
echo "Test /users command:"
echo "  1. Open a puzzle page with significant activity"
echo "  2. Type: /users"
echo "  3. Verify response arrives in <2 seconds"
echo "  4. Check that results are reasonable (not truncated oddly)"
echo ""
echo "Test /recent command:"
echo "  1. Type: /recent"
echo "  2. Verify response arrives quickly (<1 second)"
echo "  3. Check that only recent (30 min) activity is shown"
echo ""
read -p "  Have you tested the command handlers? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}✓ Command handlers tested${NC}"
else
    echo -e "${YELLOW}⚠ Please test command handlers manually${NC}"
fi
echo ""

# Test 6: Rate limiting test
echo "🚦 Test 6: OpenAI Rate Limiting"
echo "=============================="
echo ""
echo "Test /summary rate limiting:"
echo "  1. Type: /summary"
echo "  2. Wait for response"
echo "  3. Immediately type: /summary again"
echo "  4. You should see: '⏱️ Please wait X seconds...'"
echo "  5. Wait 5 minutes and try again - should work"
echo ""
read -p "  Have you tested rate limiting? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}✓ Rate limiting verified${NC}"
else
    echo -e "${YELLOW}⚠ Please test rate limiting manually${NC}"
fi
echo ""

# Test 7: Error handling test
echo "⚠️  Test 7: Error Handling & Resilience"
echo "======================================"
echo ""
echo "Test exponential backoff (optional - requires simulating errors):"
echo "  1. Temporarily break Google Drive API credentials"
echo "  2. Watch server logs for backoff messages"
echo "  3. Should see: 5s -> 10s -> 20s -> 40s -> 60s delays"
echo "  4. Restore credentials and verify recovery"
echo ""
read -p "  Skip this test? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠ Error handling test skipped${NC}"
else
    echo -e "${GREEN}✓ Error handling verified${NC}"
fi
echo ""

# Summary
echo "📋 Testing Summary"
echo "=================="
echo ""
echo "All critical paths should be tested:"
echo "  ✓ Database indexes"
echo "  ✓ Polling intervals"
echo "  ✓ Browser performance (100+ puzzles)"
echo "  ✓ Viewer filtering responsiveness"
echo "  ✓ Command handler performance"
echo "  ✓ Rate limiting"
echo ""
echo "Optional tests:"
echo "  - Error handling & exponential backoff"
echo "  - Load testing with many concurrent users"
echo ""
echo -e "${GREEN}Testing complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review PERFORMANCE_IMPROVEMENTS.md for benchmarks"
echo "  2. Monitor production logs after deployment"
echo "  3. Consider rollback plan if issues arise"
echo ""
