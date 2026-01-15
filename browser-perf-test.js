/**
 * Browser Performance Testing Utilities
 *
 * Copy-paste these functions into your browser console to test performance.
 * Run from the puzzle list page.
 */

// Test 1: Measure viewer filter performance
async function testViewerFilterPerformance() {
  console.log('🧪 Testing viewer filter performance...');

  // Find the viewer filter dropdown
  const filterDropdown = document.querySelector('select[aria-label*="viewer" i], select:has(option[value=""])');
  if (!filterDropdown) {
    console.error('❌ Could not find viewer filter dropdown');
    return;
  }

  // Get available viewers (skip first "All puzzles" option)
  const viewers = Array.from(filterDropdown.options).slice(1);
  if (viewers.length === 0) {
    console.warn('⚠️ No viewers found in dropdown. Open some puzzles first.');
    return;
  }

  console.log(`Found ${viewers.length} viewers to test`);

  // Test filter performance
  const results = [];

  for (let i = 0; i < Math.min(3, viewers.length); i++) {
    const viewer = viewers[i];
    console.log(`Testing filter for: ${viewer.text}`);

    // Measure filter application time
    const startTime = performance.now();
    filterDropdown.value = viewer.value;
    filterDropdown.dispatchEvent(new Event('change', { bubbles: true }));

    // Wait for React to re-render
    await new Promise(resolve => setTimeout(resolve, 100));

    const endTime = performance.now();
    const duration = endTime - startTime;

    results.push({
      viewer: viewer.text,
      duration: duration.toFixed(2) + 'ms'
    });

    // Clear filter
    filterDropdown.value = '';
    filterDropdown.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.table(results);

  const avgTime = results.reduce((sum, r) => sum + parseFloat(r.duration), 0) / results.length;

  if (avgTime < 100) {
    console.log(`✅ PASS: Average filter time ${avgTime.toFixed(2)}ms (target: <100ms)`);
  } else if (avgTime < 500) {
    console.log(`⚠️ WARN: Average filter time ${avgTime.toFixed(2)}ms (acceptable but could be better)`);
  } else {
    console.log(`❌ FAIL: Average filter time ${avgTime.toFixed(2)}ms (target: <100ms)`);
  }

  return results;
}

// Test 2: Count Subscribers queries during filter
function countSubscribersQueries() {
  console.log('🔍 Monitoring Subscribers.find() calls...');
  console.log('Apply a viewer filter and watch for query count.');

  // Intercept Minimongo queries (if accessible)
  let queryCount = 0;
  const originalLog = console.debug;

  console.debug = function(...args) {
    if (args[0] && args[0].includes && args[0].includes('Subscribers')) {
      queryCount++;
    }
    return originalLog.apply(console, args);
  };

  // Reset counter
  window.resetQueryCount = () => {
    queryCount = 0;
    console.log('Query counter reset');
  };

  window.getQueryCount = () => {
    console.log(`Subscribers queries: ${queryCount}`);
    return queryCount;
  };

  console.log('Use window.resetQueryCount() to reset, window.getQueryCount() to check');
  console.log('Expected: 1-2 queries (optimized) vs 100+ queries (unoptimized)');
}

// Test 3: Measure command response time
async function testCommandPerformance(command) {
  console.log(`⏱️ Testing ${command} command performance...`);

  // Find chat input
  const chatInput = document.querySelector('textarea[placeholder*="message" i], textarea[aria-label*="chat" i]');
  if (!chatInput) {
    console.error('❌ Could not find chat input. Open a puzzle page first.');
    return;
  }

  console.log('Monitoring for command response...');

  // Watch for new chat messages
  const startTime = performance.now();
  let responseReceived = false;

  // Create a MutationObserver to watch for new messages
  const chatContainer = chatInput.closest('[class*="chat" i]') || document.body;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0 && !responseReceived) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        responseReceived = true;

        console.log(`✅ Response received in ${duration.toFixed(0)}ms`);

        if (command === '/users' && duration < 2000) {
          console.log('✅ PASS: /users responded in <2s');
        } else if (command === '/recent' && duration < 1000) {
          console.log('✅ PASS: /recent responded in <1s');
        } else if (command === '/summary' && duration < 10000) {
          console.log('✅ PASS: /summary responded in <10s');
        }

        observer.disconnect();
      }
    }
  });

  observer.observe(chatContainer, { childList: true, subtree: true });

  // Type the command
  chatInput.value = command;
  chatInput.dispatchEvent(new Event('input', { bubbles: true }));

  // Submit (look for submit button or form)
  const submitButton = chatInput.closest('form')?.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.click();
  } else {
    // Try pressing Enter
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13 });
    chatInput.dispatchEvent(enterEvent);
  }

  console.log('⏳ Waiting for response...');

  // Timeout after 15 seconds
  setTimeout(() => {
    if (!responseReceived) {
      observer.disconnect();
      console.error('❌ No response received within 15 seconds');
    }
  }, 15000);
}

// Test 4: Performance snapshot
function takePerformanceSnapshot() {
  console.log('📊 Performance Snapshot');
  console.log('======================');

  // Memory usage (if available)
  if (performance.memory) {
    console.log('Memory Usage:');
    console.log(`  Used: ${(performance.memory.usedJSHeapSize / 1048576).toFixed(2)} MB`);
    console.log(`  Total: ${(performance.memory.totalJSHeapSize / 1048576).toFixed(2)} MB`);
    console.log(`  Limit: ${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`);
  }

  // Navigation timing
  if (performance.getEntriesByType) {
    const navigation = performance.getEntriesByType('navigation')[0];
    if (navigation) {
      console.log('\nPage Load Timing:');
      console.log(`  DOM Interactive: ${navigation.domInteractive.toFixed(0)}ms`);
      console.log(`  DOM Complete: ${navigation.domComplete.toFixed(0)}ms`);
      console.log(`  Load Complete: ${navigation.loadEventEnd.toFixed(0)}ms`);
    }
  }

  // Resource timing
  const resources = performance.getEntriesByType('resource');
  console.log(`\nResources Loaded: ${resources.length}`);

  // Puzzle count (estimate)
  const puzzleElements = document.querySelectorAll('[data-puzzle-id], [class*="puzzle" i]');
  console.log(`Puzzle Elements: ${puzzleElements.length}`);

  console.log('\n💡 Tip: Run performance.mark() and performance.measure() for detailed profiling');
}

// Test 5: Stress test viewer filtering
async function stressTestViewerFilters(iterations = 10) {
  console.log(`🔥 Stress testing viewer filters (${iterations} iterations)...`);

  const filterDropdown = document.querySelector('select[aria-label*="viewer" i], select:has(option[value=""])');
  if (!filterDropdown) {
    console.error('❌ Could not find viewer filter dropdown');
    return;
  }

  const viewers = Array.from(filterDropdown.options).slice(1);
  if (viewers.length === 0) {
    console.warn('⚠️ No viewers found');
    return;
  }

  const startTime = performance.now();
  const startMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;

  for (let i = 0; i < iterations; i++) {
    // Pick a random viewer
    const randomViewer = viewers[Math.floor(Math.random() * viewers.length)];

    filterDropdown.value = randomViewer.value;
    filterDropdown.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 50));

    // Clear filter
    filterDropdown.value = '';
    filterDropdown.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const endTime = performance.now();
  const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;

  const totalTime = endTime - startTime;
  const avgTime = totalTime / iterations;
  const memoryDelta = (endMemory - startMemory) / 1048576; // MB

  console.log(`\n📊 Stress Test Results:`);
  console.log(`  Total time: ${totalTime.toFixed(0)}ms`);
  console.log(`  Average per iteration: ${avgTime.toFixed(2)}ms`);
  console.log(`  Memory change: ${memoryDelta.toFixed(2)} MB`);

  if (avgTime < 100) {
    console.log('  ✅ PASS: Performance is excellent');
  } else if (avgTime < 200) {
    console.log('  ⚠️ OK: Performance is acceptable');
  } else {
    console.log('  ❌ FAIL: Performance needs improvement');
  }

  if (Math.abs(memoryDelta) > 10) {
    console.log('  ⚠️ WARNING: Significant memory change detected (possible leak)');
  }
}

// Helper: Print available tests
function help() {
  console.log('🧪 Available Performance Tests:');
  console.log('================================');
  console.log('');
  console.log('testViewerFilterPerformance()    - Measure filter performance (recommended)');
  console.log('testCommandPerformance("/users") - Measure /users command response time');
  console.log('testCommandPerformance("/recent") - Measure /recent command response time');
  console.log('countSubscribersQueries()        - Monitor database query count');
  console.log('stressTestViewerFilters(10)      - Stress test with 10 iterations');
  console.log('takePerformanceSnapshot()        - Get current performance metrics');
  console.log('');
  console.log('💡 Tip: Run testViewerFilterPerformance() first to get baseline metrics');
  console.log('');
}

// Auto-run help on load
help();
