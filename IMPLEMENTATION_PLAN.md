# Implementation Plan: Puzzle List Viewer Display & Filtering

## Overview
Add real-time viewer displays with status indicators to the puzzle list and implement filtering by who's working on puzzles. This addresses feature request #1 and #2 from [issue #2012](https://github.com/deathandmayhem/jolly-roger/issues/2012).

Based on enhancements from the Palindrome fork, we'll show:
- Who is currently viewing each puzzle (with avatars)
- Activity status (active/idle/away) with colored indicators
- Filter puzzles by specific users

---

## Phase 1: Client-Side Visibility Tracking

### Goal
Track whether the puzzle page tab is in the foreground (visible) or background (hidden).

### Files to Modify
- `imports/client/components/PuzzlePage.tsx`

### Implementation

**1.1 Add visibility state tracking**

Add state and effect to track `document.visibilityState`:

```typescript
// Near the top of PuzzlePage component, after existing useState declarations
const [isVisible, setIsVisible] = useState<DocumentVisibilityState>(
  document.visibilityState
);

// Add useEffect to listen for visibility changes
useEffect(() => {
  const handleVisibilityChange = () => {
    setIsVisible(document.visibilityState);
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}, []);
```

**1.2 Update subscribers subscription**

Modify the existing `useSubscribe("subscribers.inc", ...)` call to include visibility:

```typescript
// Find the existing useSubscribe call (around line 2107-2111)
// Change from:
useSubscribe("subscribers.inc", subscribersTopic, {
  puzzle: puzzleId,
  hunt: huntId,
});

// To:
useSubscribe("subscribers.inc", subscribersTopic, {
  puzzle: puzzleId,
  hunt: huntId,
  visible: isVisible,  // Add this
});
```

**Estimated Effort:** 15-30 minutes

---

## Phase 2: Server-Side Subscriber Enhancement

### Goal
Track visibility and last activity timestamp for each subscriber.

### Files to Modify
- `imports/server/subscribers.ts`

### Implementation

**2.1 Update Subscribers model to include metadata**

The current implementation stores basic subscriber info. We need to extract and track:
- `updatedAt`: Timestamp of last activity (from document modification time)
- `visible`: Whether the puzzle tab is in foreground

**2.2 Enhance `subscribers.fetch` publication**

Modify the publication to aggregate per-user instead of per-connection:

```typescript
// In subscribers.fetch publication
Meteor.publish("subscribers.fetch", function subscribersFetch(name: string) {
  check(name, String);

  // Group subscribers by user
  const userAggregates = new Map<string, {
    visible: boolean;
    updatedAt: Date;
    displayName?: string;
  }>();

  const handle = Subscribers.find({ name }).observeChanges({
    added: (_id, doc) => {
      const { user, context } = doc;
      if (!user) return;

      // Extract visibility from context
      const visible = context?.visible === "visible";
      const updatedAt = doc.updatedAt || new Date();

      // Get or create user aggregate
      let aggregate = userAggregates.get(user);
      if (!aggregate) {
        aggregate = {
          visible: false,
          updatedAt: new Date(0),
          displayName: undefined,
        };
        userAggregates.set(user, aggregate);
      }

      // Update aggregate: visible if ANY connection is visible
      aggregate.visible = aggregate.visible || visible;
      // Use most recent updatedAt
      if (updatedAt > aggregate.updatedAt) {
        aggregate.updatedAt = updatedAt;
      }

      // Publish updated aggregate
      this.changed("subscribers", `${name}:${user}`, {
        user,
        visible: aggregate.visible,
        updatedAt: aggregate.updatedAt,
      });
    },

    changed: (_id, fields) => {
      // Similar logic for updates
      // ...
    },

    removed: (_id) => {
      // Clean up when all connections for a user disconnect
      // ...
    },
  });

  this.ready();
  this.onStop(() => handle.stop());
});
```

**Note:** This is simplified pseudocode. The actual implementation needs to handle:
- Multiple connections per user
- Proper cleanup when individual connections drop
- Fetching display names from MeteorUsers

**Estimated Effort:** 2-3 hours (requires careful handling of connection lifecycle)

---

## Phase 3: ViewerAvatars Component

### Goal
Create a reusable component that displays viewer avatars with status indicators.

### Files to Create
- `imports/client/components/ViewerAvatars.tsx`

### Implementation

**3.1 Create the component**

```typescript
import { useTracker } from "meteor/react-meteor-data";
import styled from "styled-components";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Subscribers from "../Subscribers";
import Avatar from "./Avatar";

const ViewerContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
`;

const AvatarWrapper = styled.div`
  position: relative;
  display: inline-block;
`;

const StatusDot = styled.div<{ status: "active" | "idle" | "away" }>`
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid white;
  background-color: ${(props) => {
    switch (props.status) {
      case "active":
        return "#28a745"; // Green
      case "idle":
        return "#ffc107"; // Yellow
      case "away":
        return "#6c757d"; // Grey
      default:
        return "#6c757d";
    }
  }};
`;

interface ViewerAvatarsProps {
  huntId: string;
  puzzleId: string;
  maxDisplay?: number; // Max avatars to show before "+N more"
  size?: number; // Avatar size in pixels
}

const ViewerAvatars = ({
  huntId,
  puzzleId,
  maxDisplay = 5,
  size = 24,
}: ViewerAvatarsProps) => {
  const viewers = useTracker(() => {
    const subscribersTopic = `puzzle:${puzzleId}`;
    const subscribers = Subscribers.find({ name: subscribersTopic }).fetch();

    return subscribers.map((sub) => {
      const user = MeteorUsers.findOne(sub.user);
      const now = Date.now();
      const lastSeen = sub.updatedAt ? now - sub.updatedAt.getTime() : Infinity;

      // Determine status
      const isActive = sub.visible || lastSeen < 60000; // < 1 min
      const isIdle = !isActive && lastSeen < 300000; // 1-5 min
      const status = isActive ? "active" : isIdle ? "idle" : "away";

      return {
        userId: sub.user,
        displayName: user?.displayName || "Unknown",
        status,
        lastSeen,
      };
    });
  }, [puzzleId]);

  // Sort by status (active first) then by lastSeen
  const sortedViewers = [...viewers].sort((a, b) => {
    const statusOrder = { active: 0, idle: 1, away: 2 };
    if (a.status !== b.status) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return a.lastSeen - b.lastSeen;
  });

  const displayedViewers = sortedViewers.slice(0, maxDisplay);
  const remainingCount = sortedViewers.length - maxDisplay;

  if (viewers.length === 0) {
    return null;
  }

  return (
    <ViewerContainer>
      {displayedViewers.map((viewer) => (
        <AvatarWrapper key={viewer.userId}>
          <Avatar userId={viewer.userId} size={size} />
          <StatusDot status={viewer.status} />
        </AvatarWrapper>
      ))}
      {remainingCount > 0 && <span>+{remainingCount}</span>}
    </ViewerContainer>
  );
};

export default ViewerAvatars;
```

**3.2 Add tooltip with viewer names**

Enhance with react-bootstrap's `OverlayTrigger` to show names on hover:

```typescript
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";

// In the render:
<OverlayTrigger
  placement="top"
  overlay={
    <Tooltip id={`viewer-${viewer.userId}`}>
      {viewer.displayName} ({viewer.status})
    </Tooltip>
  }
>
  <AvatarWrapper>
    <Avatar userId={viewer.userId} size={size} />
    <StatusDot status={viewer.status} />
  </AvatarWrapper>
</OverlayTrigger>
```

**Estimated Effort:** 1-2 hours

---

## Phase 4: Integrate into Puzzle List ✅ **COMPLETE**

### Goal
Display viewer avatars in the puzzle list view.

### Implementation Decision
**Approach:** Show ViewerAvatars **inside sparkline tooltip** rather than directly in puzzle rows.

**Rationale:**
- Keeps puzzle list UI clean and uncluttered
- Provides detailed viewer info on-demand (hover over sparkline)
- No performance concerns with 100+ puzzles (no extra subscriptions needed)
- Sparklines already show activity, avatars add "who" context

### Files Modified
- `imports/client/components/PuzzleActivity.tsx` (lines 89-197)

### Implementation

**Added to sparkline tooltip:**

```typescript
const sparklineTooltip = (
  <Tooltip id={`${idPrefix}-sparkline`}>
    <div>People working on this puzzle:</div>
    {showViewers && (
      <div style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
        <ViewerAvatars
          puzzleId={puzzleId}
          maxDisplay={10}
          size={24}
          showCount={true}
        />
      </div>
    )}
    {/* Rest of tooltip content... */}
  </Tooltip>
);
```

**Benefits:**
- No additional subscriptions required (puzzles already subscribed on PuzzlePage)
- No visual clutter in main puzzle list
- User gets rich context when interested (hover to see who's active)
- Easy to toggle via `showViewers` prop if needed

**Estimated Effort:** 30 minutes (complete)

---

## Phase 5: Filter by Viewer

### Goal
Add UI to filter puzzle list by who's currently viewing/working on them.

### Files to Modify
- `imports/client/components/PuzzleListPage.tsx` (or wherever filters are)
- `imports/client/components/PuzzleList.tsx`

### Implementation

**5.1 Add filter state**

```typescript
// In PuzzleListPage or PuzzleList component
const [viewerFilter, setViewerFilter] = useState<string | null>(null);
```

**5.2 Add filter UI dropdown**

```typescript
import Form from "react-bootstrap/Form";

// Get all unique viewers across all puzzles
const allViewers = useTracker(() => {
  const viewerSet = new Set<string>();
  puzzles.forEach((puzzle) => {
    const subscribersTopic = `puzzle:${puzzle._id}`;
    const subs = Subscribers.find({ name: subscribersTopic }).fetch();
    subs.forEach((sub) => viewerSet.add(sub.user));
  });

  return Array.from(viewerSet).map((userId) => {
    const user = MeteorUsers.findOne(userId);
    return {
      userId,
      displayName: user?.displayName || "Unknown",
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
}, [puzzles]);

// Render filter dropdown
<Form.Group>
  <Form.Label>Filter by viewer:</Form.Label>
  <Form.Select
    value={viewerFilter || ""}
    onChange={(e) => setViewerFilter(e.target.value || null)}
  >
    <option value="">All puzzles</option>
    {allViewers.map((viewer) => (
      <option key={viewer.userId} value={viewer.userId}>
        {viewer.displayName}
      </option>
    ))}
  </Form.Select>
</Form.Group>
```

**5.3 Apply filter to puzzle list**

```typescript
const filteredPuzzles = useMemo(() => {
  if (!viewerFilter) return puzzles;

  return puzzles.filter((puzzle) => {
    const subscribersTopic = `puzzle:${puzzle._id}`;
    const subs = Subscribers.find({ name: subscribersTopic }).fetch();
    return subs.some((sub) => sub.user === viewerFilter);
  });
}, [puzzles, viewerFilter]);

// Use filteredPuzzles instead of puzzles for rendering
```

**5.4 Add quick filter chips**

For better UX, add clickable user chips to quickly filter:

```typescript
<div>
  {allViewers.slice(0, 10).map((viewer) => (
    <Badge
      key={viewer.userId}
      bg={viewerFilter === viewer.userId ? "primary" : "secondary"}
      onClick={() => setViewerFilter(
        viewerFilter === viewer.userId ? null : viewer.userId
      )}
      style={{ cursor: "pointer", margin: "0.25rem" }}
    >
      {viewer.displayName}
    </Badge>
  ))}
</div>
```

**Estimated Effort:** 1-2 hours

---

## Phase 6: Performance Optimization (Optional)

### Potential Issues
- 100+ subscriptions (one per puzzle) could be heavy
- Real-time updates for all puzzles might cause excessive re-renders

### Solutions

**6.1 Bulk subscription endpoint**

Create a single subscription that returns all viewers for a hunt:

```typescript
// Server: imports/server/publications/viewersForHunt.ts
Meteor.publish("viewersForHunt", function (huntId: string) {
  check(huntId, String);

  // Return all subscribers for puzzles in this hunt
  return Subscribers.find({
    "context.hunt": huntId,
  });
});
```

**6.2 Virtualization**

Only render (and subscribe to) visible puzzles in the list:

```typescript
import { FixedSizeList } from "react-window";

// Only subscribe to puzzles in the current viewport
// This requires more complex implementation
```

**Estimated Effort:** 2-4 hours

---

## Testing Plan

1. **Unit Tests**
   - ViewerAvatars renders correctly with different viewer counts
   - Status calculation (active/idle/away) works correctly
   - Filter logic properly filters puzzles

2. **Integration Tests**
   - Open puzzle in multiple tabs, verify visibility tracking
   - Switch tabs, verify status changes (green → yellow → grey)
   - Open puzzle on multiple devices, verify aggregation

3. **Manual Testing**
   - Large hunt (100+ puzzles) - check performance
   - Multiple users viewing same puzzle
   - Filter by different users
   - Compare to Palindrome fork behavior

---

## Rollout Strategy

### Phase 1: Behind Feature Flag (Week 1)
- Implement visibility tracking
- Test with small group
- Verify performance impact

### Phase 2: Soft Launch (Week 2)
- Add viewer avatars to puzzle list
- Keep sparklines as fallback
- Gather user feedback

### Phase 3: Full Release (Week 3)
- Add filtering functionality
- Remove sparklines (or make optional)
- Document new features

---

## Migration Notes

### Backward Compatibility
- Existing code still works (visibility is optional)
- Sparklines can coexist with viewer avatars
- No database migrations needed

### Rollback Plan
- Remove `visible` from subscription context
- Revert ViewerAvatars component
- Restore sparklines

---

## Estimated Total Effort

| Phase | Effort | Complexity | Status |
|-------|--------|------------|--------|
| 1. Visibility Tracking | 0.5 hours | Low | ✅ Complete |
| 2. Server Enhancement | 2-3 hours | Medium | ✅ Complete |
| 3. ViewerAvatars Component | 1-2 hours | Low-Medium | ✅ Complete |
| 4. Puzzle List Integration (Tooltip) | 0.5 hours | Low | ✅ Complete |
| 5. Filter by Viewer | 1-2 hours | Low-Medium | ✅ Complete |
| 6. Performance Optimization | 2-4 hours | Medium-High | ⏭️ Deferred (not needed yet) |
| Testing & Refinement | 2-3 hours | Medium | ⏭️ Ongoing |

**Original Estimate: 10-16 hours** (1.5-2 full work days)
**Actual Core Development: ~8-10 hours** ✅ **Complete**

**Remaining (Optional):**
- Performance optimization (only if issues arise with 100+ puzzles)
- Additional testing and user feedback iteration

---

## Learning Resources

### React Concepts Needed
- `useState` and `useEffect` hooks
- `useMemo` for derived state
- Component composition
- Conditional rendering

### Meteor Concepts Needed
- Publications and subscriptions
- `useTracker` hook for reactive data
- Collection queries (`.find()`, `.fetch()`)
- Meteor Methods vs Publications

### Recommended Learning Path
1. [React Hooks Documentation](https://react.dev/reference/react)
2. [Meteor Guide - Publications](https://guide.meteor.com/data-loading.html)
3. Read existing `ChatPeople.tsx` component (good example)
4. Read existing `PuzzleActivity.tsx` component (what we're replacing)

---

## Next Steps

1. Review this plan with the team
2. Set up local development environment (`meteor`)
3. Start with Phase 1 (easiest, low risk)
4. Test each phase before moving to next
5. Get feedback from users after Phase 4

---

## Questions to Resolve

1. **Performance:** Should we implement bulk subscriptions from the start, or wait and see if individual subscriptions are a problem?

2. **UI Design:** Should we completely replace sparklines, or show both viewers + sparklines?

3. **Feature Flag:** Should we put this behind a feature flag for gradual rollout?

4. **Mobile:** How should viewer avatars display on mobile/narrow screens?

5. **Privacy:** Should users be able to opt out of being shown as "viewing" puzzles?
