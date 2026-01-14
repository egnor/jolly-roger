import { useTracker } from "meteor/react-meteor-data";
import { useMemo } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import styled from "styled-components";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { Subscribers } from "../subscribers";
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
  width: 24px;
  height: 24px;
  flex-shrink: 0;
`;

const StatusDot = styled.div<{ $status: "active" | "idle" | "away" }>`
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid white;
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

const ViewerCount = styled.span`
  font-size: 0.875rem;
  color: #666;
  margin-left: 0.25rem;
`;

interface ViewerAvatarsProps {
  puzzleId: string;
  maxDisplay?: number; // Max avatars to show before "+N more"
  size?: number; // Avatar size in pixels
  showCount?: boolean; // Show viewer count text
}

const ViewerAvatars = ({
  puzzleId,
  maxDisplay = 5,
  size = 24,
  showCount = true,
}: ViewerAvatarsProps) => {
  const viewers = useTracker(() => {
    const subscribersTopic = `puzzle:${puzzleId}`;
    const subscribers = Subscribers.find({ name: subscribersTopic }).fetch();

    return subscribers.map((sub) => {
      const user = MeteorUsers.findOne(sub.user);
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
        displayName: user?.displayName || "Unknown",
        googleProfilePicture: user?.googleProfilePicture,
        discordAccount: user?.discordAccount,
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
        <OverlayTrigger
          key={viewer.userId}
          placement="top"
          overlay={
            <Tooltip id={`viewer-${viewer.userId}-${puzzleId}`}>
              {viewer.displayName} ({viewer.status})
            </Tooltip>
          }
        >
          <AvatarWrapper>
            <Avatar
              _id={viewer.userId}
              displayName={viewer.displayName}
              googleProfilePicture={viewer.googleProfilePicture}
              discordAccount={viewer.discordAccount}
              size={size}
            />
            <StatusDot $status={viewer.status} />
          </AvatarWrapper>
        </OverlayTrigger>
      ))}
      {remainingCount > 0 && <ViewerCount>+{remainingCount} more</ViewerCount>}
      {showCount && viewers.length > 0 && (
        <ViewerCount>({viewers.length})</ViewerCount>
      )}
    </ViewerContainer>
  );
};

export default ViewerAvatars;
