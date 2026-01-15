import { Meteor } from "meteor/meteor";
import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons/faCaretDown";
import { faCaretRight } from "@fortawesome/free-solid-svg-icons/faCaretRight";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styled from "styled-components";
import Flags from "../../Flags";
import { RECENT_ACTIVITY_TIME_WINDOW_MS } from "../../lib/config/webrtc";
import MeteorUsers from "../../lib/models/MeteorUsers";
import CallHistories from "../../lib/models/mediasoup/CallHistories";
import Peers from "../../lib/models/mediasoup/Peers";
import relativeTimeFormat from "../../lib/relativeTimeFormat";
import type { Action, CallState } from "../hooks/useCallState";
import { CallJoinState } from "../hooks/useCallState";
import useSubscribeAvatars from "../hooks/useSubscribeAvatars";
import { Subscribers } from "../subscribers";
import { trace } from "../tracing";
import { PREFERRED_AUDIO_DEVICE_STORAGE_KEY } from "./AudioConfig";
import Avatar from "./Avatar";
import CallSection from "./CallSection";
import { PuzzlePagePadding } from "./styling/constants";
import {
  AVActions,
  AVButton,
  ChatterSubsection,
  ChatterSubsectionHeader,
  PeopleListDiv,
} from "./styling/PeopleComponents";

interface ViewerSubscriber {
  user: string;
  name: string | undefined;
  status: "active" | "idle" | "away";
  tab: string | undefined;
}

const ViewerChipsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.25rem 0;
`;

const ViewerChip = styled.span<{ $status: "active" | "idle" | "away" }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
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
  width: 10px;
  height: 10px;
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

const ViewerPersonBox = ({
  user: _user,
  name,
  status,
  tab: _tab,
}: ViewerSubscriber) => {
  return (
    <ViewerChip $status={status}>
      <StatusDot $status={status} />
      <ViewerName>{name || "Unknown"}</ViewerName>
    </ViewerChip>
  );
};

const PeopleListHeader = styled(ChatterSubsectionHeader)`
  padding-left: 1rem;
  text-indent: -1rem;
`;

const ChatterSection = styled.section`
  flex: 0;
  background-color: ${({ theme }) => theme.colors.chatterSectionBackground};
  font-size: 12px;
  line-height: 12px;
  padding: ${PuzzlePagePadding};
`;

// ChatPeople is the component that deals with all user presence and
// WebRTC call subscriptions, state, and visualization.
const ChatPeople = ({
  huntId,
  puzzleId,
  disabled,
  onHeightChange,
  callState,
  callDispatch,
  joinCall,
}: {
  huntId: string;
  puzzleId: string;
  disabled: boolean;
  onHeightChange: () => void;
  callState: CallState;
  callDispatch: React.Dispatch<Action>;
  joinCall: () => void;
}) => {
  const chatterRef = useRef<HTMLDivElement>(null);

  const { audioControls, audioState } = callState;

  const [callersExpanded, setCallersExpanded] = useState<boolean>(true);
  const [viewersExpanded, setViewersExpanded] = useState<boolean>(true);

  const subscriberTopic = `puzzle:${puzzleId}`;
  const subscribersLoading = useSubscribe("subscribers.fetch", subscriberTopic);
  const callMembersLoading = useSubscribe(
    "mediasoup:metadata",
    huntId,
    puzzleId,
  );
  const avatarsLoading = useSubscribeAvatars(huntId);

  const loading =
    subscribersLoading() || callMembersLoading() || avatarsLoading();

  // A note on this feature flag: we still do the subs for call *metadata* for
  // simplicity even when webrtc is flagged off; we simply avoid rendering
  // anything in the UI (which prevents clients from subbing to 'mediasoup:join'
  // or doing signalling).
  const rtcDisabled = useTracker(() => Flags.active("disable.webrtc"), []);

  const recentVoiceActivity = useTracker(
    () => CallHistories.findOne({ call: puzzleId })?.lastActivity,
    [puzzleId],
  );
  const [voiceActivityRelative, setVoiceActivityRelative] = useState<string>();
  useEffect(() => {
    let interval: number | undefined;
    if (recentVoiceActivity) {
      const formatter = () =>
        relativeTimeFormat(recentVoiceActivity, {
          minimumUnit: Meteor.isDevelopment ? "second" : "minute",
        });
      setVoiceActivityRelative(formatter());
      interval = Meteor.setInterval(() => {
        setVoiceActivityRelative(formatter());
      }, RECENT_ACTIVITY_TIME_WINDOW_MS);
    }
    return () => {
      if (interval) {
        Meteor.clearInterval(interval);
      }
    };
  }, [recentVoiceActivity]);

  const { unknown, viewers, rtcViewers } = useTracker(() => {
    if (loading) {
      return {
        unknown: 0,
        viewers: [],
        rtcViewers: [],
        selfPeer: undefined,
      };
    }

    const now = Date.now();
    let unknownCount = 0;
    const viewersAcc: ViewerSubscriber[] = [];

    const rtcViewersAcc: ViewerSubscriber[] = [];
    const rtcViewerIndex: Record<string, boolean> = {};

    const rtcParticipants = Peers.find({
      hunt: huntId,
      call: puzzleId,
    }).fetch();
    rtcParticipants.forEach((p) => {
      const user = MeteorUsers.findOne(p.createdBy);
      if (!user?.displayName) {
        unknownCount += 1;
        return;
      }

      // RTC participants are always "active"
      // If the same user is joined twice (from two different tabs), dedupe in
      // the viewer listing. (We include both in rtcParticipants still.)
      rtcViewersAcc.push({
        user: user._id,
        name: user.displayName,
        status: "active",
        tab: p.tab,
      });
      rtcViewerIndex[user._id] = true;
    });

    Subscribers.find({ name: subscriberTopic }).forEach((s) => {
      if (rtcViewerIndex[s.user]) {
        // already counted among rtcViewers, don't duplicate
        return;
      }

      const user = MeteorUsers.findOne(s.user);
      if (!user?.displayName) {
        unknownCount += 1;
        return;
      }

      // Calculate status based on visibility and last activity
      const lastSeen = s.updatedAt ? s.updatedAt.getTime() : 0;
      const timeSinceLastSeen = now - lastSeen;
      const isActive = s.visible || timeSinceLastSeen < 60000; // < 1 min
      const isIdle = !isActive && timeSinceLastSeen < 300000; // 1-5 min
      const status: "active" | "idle" | "away" = isActive
        ? "active"
        : isIdle
          ? "idle"
          : "away";

      viewersAcc.push({
        user: s.user,
        name: user.displayName,
        status,
        tab: undefined,
      });
    });

    return {
      unknown: unknownCount,
      viewers: viewersAcc,
      rtcViewers: rtcViewersAcc,
    };
  }, [loading, subscriberTopic, huntId, puzzleId]);

  const toggleCallersExpanded = useCallback(() => {
    setCallersExpanded((prevState) => {
      return !prevState;
    });
  }, []);

  const toggleViewersExpanded = useCallback(() => {
    setViewersExpanded((prevState) => {
      return !prevState;
    });
  }, []);

  const { muted, deafened } = audioControls;

  // biome-ignore lint/correctness/useExhaustiveDependencies(disabled): We want the parent to re-render when anything might have changed our rendered size
  useLayoutEffect(() => {
    trace("ChatPeople useLayoutEffect", {
      loading,
      rtcViewers: rtcViewers.length,
      viewers: viewers.length,
      callersExpanded,
      viewersExpanded,
      callState,
      voiceActivityRelative,
    });
    // Notify parent whenever we might have changed size:
    // * on viewers or rtcViewers counts change
    // * on expand/collapse of the callers or viewers
    // * when joining the audiocall
    onHeightChange();
  }, [
    onHeightChange,
    loading,
    rtcViewers.length,
    viewers.length,
    callersExpanded,
    viewersExpanded,
    callState,
    voiceActivityRelative,
    disabled,
  ]);

  trace("ChatPeople render", { loading });

  if (loading) {
    return null;
  }

  // TODO: find osme way to factor this out other than "immediately invoked fat-arrow function"
  const callersSubsection = (() => {
    const callersHeaderIcon = callersExpanded ? faCaretDown : faCaretRight;
    switch (callState.callState) {
      case CallJoinState.CHAT_ONLY:
      case CallJoinState.REQUESTING_STREAM: {
        const joinLabel =
          rtcViewers.length > 0 ? "Join audio call" : "Start audio call";
        return (
          <>
            <AVActions>
              <AVButton variant="primary" size="sm" onClick={joinCall}>
                {joinLabel}
              </AVButton>
            </AVActions>
            <ChatterSubsection>
              <PeopleListHeader onClick={toggleCallersExpanded}>
                <FontAwesomeIcon fixedWidth icon={callersHeaderIcon} />
                {`${rtcViewers.length} caller${
                  rtcViewers.length !== 1 ? "s" : ""
                }`}
                {voiceActivityRelative && (
                  <>
                    {" (last voice activity: "}
                    {voiceActivityRelative})
                  </>
                )}
              </PeopleListHeader>
              <PeopleListDiv $collapsed={!callersExpanded}>
                <ViewerChipsContainer>
                  {rtcViewers.map((viewer) => (
                    <ViewerPersonBox
                      key={`person-${viewer.user}-${viewer.tab}`}
                      {...viewer}
                    />
                  ))}
                </ViewerChipsContainer>
              </PeopleListDiv>
            </ChatterSubsection>
          </>
        );
      }
      case CallJoinState.IN_CALL:
        return (
          <CallSection
            muted={muted || deafened}
            deafened={deafened}
            audioContext={audioState!.audioContext!}
            localStream={audioState!.mediaSource!}
            callersExpanded={callersExpanded}
            onToggleCallersExpanded={toggleCallersExpanded}
            callState={callState}
            callDispatch={callDispatch}
          />
        );
      case CallJoinState.STREAM_ERROR:
        return <div>{`ERROR GETTING MIC: ${callState.error?.message}`}</div>;
      default:
        // Unreachable.  TypeScript knows this, but eslint doesn't.
        return <div />;
    }
  })();

  const totalViewers = viewers.length + unknown;
  const viewersHeaderIcon = viewersExpanded ? faCaretDown : faCaretRight;
  return (
    <ChatterSection>
      {!rtcDisabled && !disabled && callersSubsection}
      <ChatterSubsection ref={chatterRef}>
        <PeopleListHeader onClick={toggleViewersExpanded}>
          <FontAwesomeIcon fixedWidth icon={viewersHeaderIcon} />
          {`${totalViewers} viewer${totalViewers !== 1 ? "s" : ""}`}
        </PeopleListHeader>
        <PeopleListDiv $collapsed={!viewersExpanded}>
          <ViewerChipsContainer>
            {viewers.map((viewer) => (
              <ViewerPersonBox key={`person-${viewer.user}`} {...viewer} />
            ))}
          </ViewerChipsContainer>
        </PeopleListDiv>
      </ChatterSubsection>
    </ChatterSection>
  );
};

export default ChatPeople;
