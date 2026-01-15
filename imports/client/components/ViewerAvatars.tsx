import { useTracker } from "meteor/react-meteor-data";
import { useMemo } from "react";
import styled from "styled-components";
import { Subscribers } from "../subscribers";

const ViewerContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const ViewerBadge = styled.span<{ $status: "active" | "idle" | "away" }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  max-width: 200px;
  min-width: 0;
  background-color: ${(props) => {
    switch (props.$status) {
      case "active":
        return "#d4edda"; // Light green
      case "idle":
        return "#fff3cd"; // Light yellow
      case "away":
        return "#e2e3e5"; // Light grey
      default:
        return "#e2e3e5";
    }
  }};
  color: ${(props) => {
    switch (props.$status) {
      case "active":
        return "#155724"; // Dark green
      case "idle":
        return "#856404"; // Dark yellow
      case "away":
        return "#383d41"; // Dark grey
      default:
        return "#383d41";
    }
  }};
  border: 1px solid
    ${(props) => {
      switch (props.$status) {
        case "active":
          return "#c3e6cb";
        case "idle":
          return "#ffeaa7";
        case "away":
          return "#d6d8db";
        default:
          return "#d6d8db";
      }
    }};

  > * {
    flex-shrink: 0;
  }
`;

const StatusDot = styled.span<{ $status: "active" | "idle" | "away" }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: ${(props) => {
    switch (props.$status) {
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

const ViewerName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 150px;
  flex-shrink: 1;
`;

const ViewerCount = styled.span`
  font-size: 0.875rem;
  color: #666;
  margin-left: 0.25rem;
`;

interface ViewerAvatarsProps {
  puzzleId: string;
  maxDisplay?: number; // Max viewers to show before "+N more"
  size?: number; // Deprecated: no longer used (kept for backwards compatibility)
  showCount?: boolean; // Deprecated: count is now always shown in "+N more"
}

const ViewerAvatars = ({
  puzzleId,
  maxDisplay = 5,
  size: _size, // Deprecated parameter, ignored
  showCount: _showCount, // Deprecated parameter, ignored
}: ViewerAvatarsProps) => {
  const viewers = useTracker(() => {
    const subscribersTopic = `puzzle:${puzzleId}`;
    const subscribers = Subscribers.find({ name: subscribersTopic }).fetch();

    return subscribers.map((sub) => {
      const now = Date.now();
      const lastSeen = sub.updatedAt ? now - sub.updatedAt.getTime() : Infinity;

      // Determine status based on visibility and time
      const isActive = sub.visible || lastSeen < 60000; // < 1 min
      const isIdle = !isActive && lastSeen < 300000; // 1-5 min
      const status: "active" | "idle" | "away" = isActive
        ? "active"
        : isIdle
          ? "idle"
          : "away";

      return {
        userId: sub.user,
        // Use displayName from subscription (denormalized) to avoid N+1 queries
        displayName: sub.displayName || "Unknown",
        status,
        lastSeen,
        visible: sub.visible || false,
      };
    });
  }, [puzzleId]);

  // Sort by status (active first) then by lastSeen
  const sortedViewers = useMemo(() => {
    return [...viewers].sort((a, b) => {
      const statusOrder: Record<"active" | "idle" | "away", number> = {
        active: 0,
        idle: 1,
        away: 2,
      };
      if (a.status !== b.status) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return a.lastSeen - b.lastSeen;
    });
  }, [viewers]);

  const displayedViewers = sortedViewers.slice(0, maxDisplay);
  const remainingCount = sortedViewers.length - maxDisplay;

  if (viewers.length === 0) {
    return null;
  }

  return (
    <ViewerContainer>
      {displayedViewers.map((viewer) => (
        <ViewerBadge key={viewer.userId} $status={viewer.status}>
          <StatusDot $status={viewer.status} />
          <ViewerName>{viewer.displayName}</ViewerName>
        </ViewerBadge>
      ))}
      {remainingCount > 0 && <ViewerCount>+{remainingCount} more</ViewerCount>}
    </ViewerContainer>
  );
};

export default ViewerAvatars;
