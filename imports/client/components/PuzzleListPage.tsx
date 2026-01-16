import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons/faCaretDown";
import { faCaretRight } from "@fortawesome/free-solid-svg-icons/faCaretRight";
import { faCircleXmark } from "@fortawesome/free-solid-svg-icons/faCircleXmark";
import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  type ComponentPropsWithRef,
  type FC,
  useCallback,
  useId,
  useMemo,
  useRef,
} from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import FormSelect from "react-bootstrap/FormSelect";
import InputGroup from "react-bootstrap/InputGroup";
import ToggleButton from "react-bootstrap/ToggleButton";
import ToggleButtonGroup from "react-bootstrap/ToggleButtonGroup";
import { useParams, useSearchParams } from "react-router-dom";
import styled, { css } from "styled-components";
import { sortedBy } from "../../lib/listUtils";
import Bookmarks from "../../lib/models/Bookmarks";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import type { PuzzleType } from "../../lib/models/Puzzles";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import puzzleActivityForHunt from "../../lib/publications/puzzleActivityForHunt";
import puzzlesForPuzzleList from "../../lib/publications/puzzlesForPuzzleList";
import {
  filteredPuzzleGroups,
  puzzleGroupsByRelevance,
} from "../../lib/puzzle-sort-and-group";
import { computeSolvedness } from "../../lib/solvedness";
import createPuzzle from "../../methods/createPuzzle";
import {
  useHuntPuzzleListCollapseGroups,
  useHuntPuzzleListDisplayMode,
  useHuntPuzzleListShowSolved,
  useOperatorActionsHiddenForHunt,
} from "../hooks/persisted-state";
import useFocusRefOnFindHotkey from "../hooks/useFocusRefOnFindHotkey";
import useSubscribeAvatars from "../hooks/useSubscribeAvatars";
import useSubscribeDisplayNames from "../hooks/useSubscribeDisplayNames";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import { compilePuzzleMatcher } from "../search";
import { Subscribers } from "../subscribers";
import HuntNav from "./HuntNav";
import PuzzleList from "./PuzzleList";
import type {
  PuzzleModalFormHandle,
  PuzzleModalFormSubmitPayload,
} from "./PuzzleModalForm";
import PuzzleModalForm from "./PuzzleModalForm";
import RelatedPuzzleGroup, { PuzzleGroupDiv } from "./RelatedPuzzleGroup";
import RelatedPuzzleList from "./RelatedPuzzleList";
import { mediaBreakpointDown } from "./styling/responsive";

const SectionHeader = styled.div`
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5em;
  color: ${(props) => props.theme.colors.text};
`;

const StatsAndActionsBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5em 0;
  margin-bottom: 0.75em;
  font-size: 0.875rem;
  flex-wrap: wrap;
  gap: 1em;

  ${mediaBreakpointDown(
    "sm",
    css`
      flex-direction: column;
      align-items: flex-start;
    `,
  )}
`;

const StatsText = styled.div`
  color: ${(props) => props.theme.colors.text};
  font-weight: 500;

  span {
    margin-right: 1em;
  }

  strong {
    font-weight: 600;
  }
`;

const ActionsGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 1em;

  ${mediaBreakpointDown(
    "sm",
    css`
      width: 100%;
      justify-content: flex-start;
    `,
  )}
`;

const FiltersContainer = styled.div`
  background-color: ${(props) =>
    props.theme.basicMode === "dark" ? "#2b2b2b" : "#f8f9fa"};
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 3px;
  padding: 0.5em 0.75em;
  margin-bottom: 0.75em;

  .btn {
    padding: 3px 6px;
    font-size: 0.8125rem;
  }

  .form-label {
    margin-bottom: 0.15rem;
    font-size: 0.8125rem;
  }

  .form-control,
  .form-select {
    padding: 3px 6px;
    font-size: 0.8125rem;
  }
`;

const ViewControls = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5em;
`;

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5em;
  flex-wrap: wrap;

  ${mediaBreakpointDown(
    "sm",
    css`
      gap: 1em;
    `,
  )}
`;

const SearchContainer = styled.div`
  flex: 1;
  min-width: 250px;
`;

const ControlGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5em;
  font-size: 0.875rem;
  white-space: nowrap;
`;

const ControlLabel = styled.span`
  color: ${(props) => props.theme.colors.text};
  font-weight: 500;
  white-space: nowrap;
`;

const BottomRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1em;
  font-size: 0.8125rem;
  flex-wrap: wrap;
`;

const SearchFormGroup = styled(FormGroup)`
  margin-bottom: 0;
  width: 100%;
`;

const ViewerFilterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5em;
  white-space: nowrap;
`;

const SearchFormLabel = styled(FormLabel)`
  display: none;
`;

const ClearSearchButton = styled.button`
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: #6c757d;
  font-size: 1rem;
  line-height: 1;
  display: flex;
  align-items: center;
  z-index: 10;

  &:hover {
    color: #495057;
  }

  &:focus {
    outline: none;
  }
`;

const SearchInputGroup = styled(InputGroup)`
  position: relative;

  .form-control {
    padding-right: 2rem;

    &::placeholder {
      color: #adb5bd;
      font-style: italic;
      opacity: 1;
    }
  }
`;

// Unused but kept for potential future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ViewerFilterChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.25rem;
`;

const CompactFormSelect = styled(FormSelect)`
  padding: 3px 6px;
  font-size: 0.8125rem;
  min-width: 150px;
`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ViewerChip = styled.span<{
  $active: boolean;
  $status: "active" | "idle" | "away";
}>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
  font-size: 0.8125rem;
  font-weight: normal;
  transition: all 0.2s ease;
  max-width: 180px;
  min-width: 0;
  background-color: ${(props) => {
    if (props.$active) {
      // Active filter - use bright primary colors
      switch (props.$status) {
        case "active":
          return "#28a745"; // Solid green
        case "idle":
          return "#ffc107"; // Solid yellow
        case "away":
        default:
          return "#6c757d"; // Solid grey
      }
    }
    // Inactive filter - use light background colors
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
    if (props.$active) {
      return "#ffffff"; // White text when active
    }
    // Dark text for light backgrounds
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
      if (props.$active) {
        // Darker borders when active
        switch (props.$status) {
          case "active":
            return "#1e7e34";
          case "idle":
            return "#d39e00";
          case "away":
          default:
            return "#545b62";
        }
      }
      // Light borders when inactive
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

  &:hover {
    opacity: 0.85;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _StatusDot = styled.span<{ $status: "active" | "idle" | "away" }>`
  display: inline-block;
  width: 7px;
  height: 7px;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ViewerFilterName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 140px;
  flex-shrink: 1;
`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _OperatorActionsFormGroup = styled(FormGroup)`
  ${mediaBreakpointDown(
    "xs",
    css`
      grid-column: 1;
    `,
  )}
`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _AddPuzzleFormGroup = styled(FormGroup)`
  justify-self: end;
  ${mediaBreakpointDown(
    "xs",
    css`
      justify-self: start;
    `,
  )}
`;

const StyledToggleButtonGroup = styled(ToggleButtonGroup)`
  @media (width < 360px) {
    width: 100%;
  }
`;

const StyledButton: FC<ComponentPropsWithRef<typeof Button>> = styled(Button)`
  @media (width < 360px) {
    width: 100%;
  }
`;

const BookmarkedSection = styled.div`
  background-color: ${(props) =>
    props.theme.basicMode === "dark" ? "#4a4020" : "#fff3cd"};
  border: 1px solid
    ${(props) => (props.theme.basicMode === "dark" ? "#8a7a40" : "#ffe69c")};
  border-radius: 3px;
  padding: 0.5em 0.75em;
  margin-bottom: 0.75em;

  ${PuzzleGroupDiv} {
    margin-bottom: 0;
  }
`;

const MainPuzzleListSection = styled.div`
  background-color: ${(props) => props.theme.colors.background};
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 3px;
  padding: 0.5em 0.75em;

  ${PuzzleGroupDiv} {
    padding-left: 0.5em;
    border-left: 2px solid ${(props) => props.theme.colors.border};
    margin-left: 0.25em;

    &:not(:last-child) {
      margin-bottom: 0.75em;
    }
  }
`;

const PuzzleListToolbar = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.5em;
  font-size: 0.8125rem;
  color: ${(props) =>
    props.theme.basicMode === "dark" ? "#adb5bd" : "#6c757d"};
`;

const ExpandCollapseButton = styled(Button)`
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  line-height: 1.2;
  margin-left: 0.25rem;
`;

const HuntNavWrapper = styled.div`
  display: none;
  ${mediaBreakpointDown(
    "sm",
    css`
      display: flex;
      width: 100%;
      margin-bottom: 8px;
    `,
  )}
`;

const PuzzleListView = ({
  huntId,
  canAdd,
  canUpdate,
  loading,
}: {
  huntId: string;
  canAdd: boolean;
  canUpdate: boolean;
  loading: boolean;
}) => {
  const allPuzzles = useTracker(
    () => Puzzles.find({ hunt: huntId }).fetch(),
    [huntId],
  );
  const allTags = useTracker(
    () => Tags.find({ hunt: huntId }).fetch(),
    [huntId],
  );

  // Calculate hunt-wide stats
  const huntStats = useMemo(() => {
    const allTagsById = new Map(allTags.map((t) => [t._id, t]));

    // Helper function to check if a puzzle is a meta
    const isMeta = (puzzle: PuzzleType): boolean => {
      return puzzle.tags.some((tagId) => {
        const tag = allTagsById.get(tagId);
        return (
          tag &&
          (tag.name === "is:meta" ||
            tag.name === "is:metameta" ||
            tag.name.startsWith("meta-for:"))
        );
      });
    };

    const metas = allPuzzles.filter(isMeta);
    const regularPuzzles = allPuzzles.filter((p) => !isMeta(p));

    return {
      metasSolved: metas.filter((p) => computeSolvedness(p) === "solved")
        .length,
      metasTotal: metas.length,
      puzzlesSolved: regularPuzzles.filter(
        (p) => computeSolvedness(p) === "solved",
      ).length,
      puzzlesTotal: regularPuzzles.length,
    };
  }, [allPuzzles, allTags]);

  const bookmarked = useTracker(() => {
    const bookmarks = Bookmarks.find({ hunt: huntId, user: Meteor.userId()! })
      .fetch()
      .map((b) => b.puzzle);
    return new Set(bookmarks);
  }, [huntId]);

  const deletedPuzzles = useTracker(
    () =>
      !canUpdate || loading
        ? undefined
        : Puzzles.findDeleted({ hunt: huntId }).fetch(),
    [canUpdate, huntId, loading],
  );

  // Subscribe to viewers for all puzzles in the hunt
  useTracker(() => {
    allPuzzles.forEach((puzzle) => {
      const subscribersTopic = `puzzle:${puzzle._id}`;
      Meteor.subscribe("subscribers.fetch", subscribersTopic);
    });
  }, [allPuzzles]);

  const [searchParams, setSearchParams] = useSearchParams();
  const searchString = searchParams.get("q") ?? "";
  const viewerFilter = searchParams.get("viewer") ?? "";
  const addModalRef = useRef<PuzzleModalFormHandle>(null);
  const searchBarRef = useRef<HTMLInputElement>(null);
  const [displayMode, setDisplayMode] = useHuntPuzzleListDisplayMode(huntId);
  const [showSolved, setShowSolved] = useHuntPuzzleListShowSolved(huntId);
  const [huntPuzzleListCollapseGroups, setHuntPuzzleListCollapseGroups] =
    useHuntPuzzleListCollapseGroups(huntId);
  const expandAllGroups = useCallback(() => {
    setHuntPuzzleListCollapseGroups({});
  }, [setHuntPuzzleListCollapseGroups]);

  const collapseAllGroups = useCallback(() => {
    // Get all group IDs and set them to collapsed
    const allGroupIds = puzzleGroupsByRelevance(allPuzzles, allTags).map(
      (g) => g.sharedTag?._id ?? "(no group specified)",
    );
    const collapsed = Object.fromEntries(allGroupIds.map((id) => [id, true]));
    setHuntPuzzleListCollapseGroups(collapsed);
  }, [allPuzzles, allTags, setHuntPuzzleListCollapseGroups]);

  const allGroupsExpanded =
    displayMode === "group" &&
    Object.values(huntPuzzleListCollapseGroups).every(
      (collapsed) => !collapsed,
    );

  const [operatorActionsHidden, setOperatorActionsHidden] =
    useOperatorActionsHiddenForHunt(huntId);
  const setOperatorActionsHiddenString = useCallback(
    (value: string) => {
      setOperatorActionsHidden(value === "hide");
    },
    [setOperatorActionsHidden],
  );

  useFocusRefOnFindHotkey(searchBarRef);

  const onAdd = useCallback(
    (
      state: PuzzleModalFormSubmitPayload,
      callback: (error?: Error) => void,
    ) => {
      const { docType, ...rest } = state;
      if (!docType) {
        callback(new Error("No docType provided"));
        return;
      }

      function onAddComplete(error?: Error) {
        if (!error && addModalRef.current) {
          addModalRef.current.reset();
        }
        callback(error);
      }

      createPuzzle.call({ docType, ...rest }, onAddComplete);
    },
    [],
  );

  const setSearchString = useCallback(
    (val: string) => {
      const u = new URLSearchParams(searchParams);
      if (val) {
        u.set("q", val);
      } else {
        u.delete("q");
      }

      setSearchParams(u);
    },
    [searchParams, setSearchParams],
  );

  const setViewerFilter = useCallback(
    (val: string) => {
      const u = new URLSearchParams(searchParams);
      if (val) {
        u.set("viewer", val);
      } else {
        u.delete("viewer");
      }

      setSearchParams(u);
    },
    [searchParams, setSearchParams],
  );

  const onSearchStringChange: NonNullable<FormControlProps["onChange"]> =
    useCallback(
      (e) => {
        setSearchString(e.currentTarget.value);
      },
      [setSearchString],
    );

  const puzzlesMatchingSearchString = useCallback(
    (puzzles: PuzzleType[]): PuzzleType[] => {
      const searchKeys = searchString.split(" ");
      if (searchKeys.length === 1 && searchKeys[0] === "") {
        // No search query, so no need to do fancy search computation
        return puzzles;
      } else {
        const searchKeysWithEmptyKeysRemoved = searchKeys.filter((key) => {
          return key.length > 0;
        });
        const isInteresting = compilePuzzleMatcher(
          allTags,
          searchKeysWithEmptyKeysRemoved,
        );
        return puzzles.filter(isInteresting);
      }
    },
    [searchString, allTags],
  );

  // Get all unique viewers across all puzzles
  // Filter to only include users who have been active in the last 30 minutes
  // OPTIMIZED: Fetch only subscribers for this hunt's puzzles with server-side filtering
  const allViewers = useTracker(() => {
    const viewersMap = new Map<
      string,
      {
        userId: string;
        displayName: string;
        status: "active" | "idle" | "away";
        mostRecentActivity: number;
      }
    >();
    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000; // 30 minutes in ms

    // Build array of puzzle topics to use in MongoDB $in query
    const puzzleTopics = allPuzzles.map((puzzle) => `puzzle:${puzzle._id}`);

    // Fetch ONLY subscribers for this hunt's puzzles using server-side filtering
    // This is much faster than fetching all subscribers and filtering client-side
    const relevantSubscribers = Subscribers.find({
      name: { $in: puzzleTopics },
    }).fetch();

    relevantSubscribers.forEach((sub) => {
      // Only include users who are visible OR were active in last 30 min
      const lastSeen = sub.updatedAt ? sub.updatedAt.getTime() : 0;
      const isRecentlyActive = sub.visible || lastSeen > thirtyMinutesAgo;

      if (isRecentlyActive) {
        const user = MeteorUsers.findOne(sub.user);
        if (user?.displayName) {
          // Determine status based on visibility and time
          const isActive = sub.visible || now - lastSeen < 60000; // < 1 min
          const isIdle = !isActive && now - lastSeen < 300000; // 1-5 min
          const status: "active" | "idle" | "away" = isActive
            ? "active"
            : isIdle
              ? "idle"
              : "away";

          // Update or add viewer (keep most active status across puzzles)
          const existing = viewersMap.get(sub.user);
          if (!existing || lastSeen > existing.mostRecentActivity) {
            viewersMap.set(sub.user, {
              userId: sub.user,
              displayName: user.displayName,
              status,
              mostRecentActivity: lastSeen,
            });
          }
        }
      }
    });

    return Array.from(viewersMap.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }, [allPuzzles]);

  // OPTIMIZED: Build a lookup map of puzzle->viewers to avoid repeated queries
  const puzzleViewersMap = useTracker(() => {
    const map = new Map<string, Set<string>>();

    // Build array of puzzle topics to use in MongoDB $in query
    const puzzleTopics = allPuzzles.map((puzzle) => `puzzle:${puzzle._id}`);

    // Fetch ONLY subscribers for this hunt's puzzles using server-side filtering
    const allSubscribers = Subscribers.find({
      name: { $in: puzzleTopics },
    }).fetch();

    allSubscribers.forEach((sub) => {
      // Extract puzzle ID from topic name like "puzzle:abc123"
      if (sub.name.startsWith("puzzle:")) {
        const puzzleId = sub.name.substring("puzzle:".length);
        if (!map.has(puzzleId)) {
          map.set(puzzleId, new Set());
        }
        map.get(puzzleId)!.add(sub.user);
      }
    });

    return map;
  }, [allPuzzles]);

  const puzzlesMatchingViewerFilter = useCallback(
    (puzzles: PuzzleType[]): PuzzleType[] => {
      if (!viewerFilter) {
        return puzzles;
      }
      return puzzles.filter((puzzle) => {
        const viewers = puzzleViewersMap.get(puzzle._id);
        return viewers?.has(viewerFilter) || false;
      });
    },
    [viewerFilter, puzzleViewersMap],
  );

  const puzzlesMatchingSolvedFilter = useCallback(
    (puzzles: PuzzleType[]): PuzzleType[] => {
      if (showSolved) {
        return puzzles;
      } else {
        return puzzles.filter((puzzle) => {
          // Items with no expected answer are always shown, since they're
          // generally pinned administrivia.
          const solvedness = computeSolvedness(puzzle);
          return solvedness !== "solved";
        });
      }
    },
    [showSolved],
  );

  const clearSearch = useCallback(() => {
    setSearchString("");
  }, [setSearchString]);

  const setShowSolvedString = useCallback(
    (value: string) => {
      setShowSolved(value === "show");
    },
    [setShowSolved],
  );

  const showAddModal = useCallback(() => {
    if (addModalRef.current) {
      addModalRef.current.show();
    }
  }, []);

  const renderList = useCallback(
    (
      retainedPuzzles: PuzzleType[],
      retainedDeletedPuzzles: PuzzleType[] | undefined,
      solvedOverConstrains: boolean,
      allPuzzlesCount: number,
    ) => {
      const maybeMatchWarning = solvedOverConstrains && (
        <Alert variant="info">
          No matches found in unsolved puzzles; showing matches from solved
          puzzles
        </Alert>
      );
      const retainedIds = new Set(retainedPuzzles.map((puzzle) => puzzle._id));
      const filterMessage = `Showing ${retainedPuzzles.length} of ${allPuzzlesCount} items`;

      const bookmarkedPuzzles = retainedPuzzles.filter((puzzle) =>
        bookmarked.has(puzzle._id),
      );

      let listComponent;
      let listControls;
      // biome-ignore lint/style/useDefaultSwitchClause: migration from eslint
      switch (displayMode) {
        case "group": {
          // We group and sort first, and only filter afterward, to avoid losing the
          // relative group structure as a result of removing some puzzles from
          // consideration.
          const unfilteredGroups = puzzleGroupsByRelevance(allPuzzles, allTags);
          const puzzleGroups = filteredPuzzleGroups(
            unfilteredGroups,
            retainedIds,
          );
          listComponent = puzzleGroups.map((g) => {
            const suppressedTagIds = [];
            if (g.sharedTag) {
              suppressedTagIds.push(g.sharedTag._id);
            }
            return (
              <RelatedPuzzleGroup
                key={g.sharedTag ? g.sharedTag._id : "ungrouped"}
                huntId={huntId}
                group={g}
                noSharedTagLabel="(no group specified)"
                bookmarked={bookmarked}
                allTags={allTags}
                includeCount={false}
                canUpdate={canUpdate}
                suppressedTagIds={suppressedTagIds}
                trackPersistentExpand={searchString === ""}
              />
            );
          });
          listControls = (
            <ExpandCollapseButton
              variant="outline-secondary"
              size="sm"
              onClick={allGroupsExpanded ? collapseAllGroups : expandAllGroups}
              title={
                allGroupsExpanded ? "Collapse all groups" : "Expand all groups"
              }
            >
              <FontAwesomeIcon
                icon={allGroupsExpanded ? faCaretDown : faCaretRight}
              />{" "}
              {allGroupsExpanded ? "Collapse all" : "Expand all"}
            </ExpandCollapseButton>
          );
          break;
        }
        case "unlock": {
          const puzzlesByUnlock = sortedBy(allPuzzles, (p) => {
            return p.createdAt;
          });
          const retainedPuzzlesByUnlock = puzzlesByUnlock.filter((p) =>
            retainedIds.has(p._id),
          );
          listComponent = (
            <PuzzleList
              puzzles={retainedPuzzlesByUnlock}
              bookmarked={bookmarked}
              allTags={allTags}
              canUpdate={canUpdate}
            />
          );
          listControls = null;
          break;
        }
      }
      return (
        <div>
          {maybeMatchWarning}
          {bookmarkedPuzzles.length > 0 && (
            <BookmarkedSection>
              <SectionHeader>Bookmarked</SectionHeader>
              <PuzzleGroupDiv>
                <RelatedPuzzleList
                  key="bookmarked"
                  relatedPuzzles={bookmarkedPuzzles}
                  sharedTag={undefined}
                  bookmarked={bookmarked}
                  allTags={allTags}
                  canUpdate={canUpdate}
                  suppressedTagIds={[]}
                />
              </PuzzleGroupDiv>
            </BookmarkedSection>
          )}
          <MainPuzzleListSection>
            <SectionHeader>Puzzles</SectionHeader>
            <PuzzleListToolbar>
              <div>{filterMessage}</div>
              {listControls}
            </PuzzleListToolbar>
            {listComponent}
            {retainedDeletedPuzzles && retainedDeletedPuzzles.length > 0 && (
              <RelatedPuzzleGroup
                key="deleted"
                huntId={huntId}
                group={{ puzzles: retainedDeletedPuzzles, subgroups: [] }}
                noSharedTagLabel="Deleted puzzles (operator only)"
                bookmarked={bookmarked}
                allTags={allTags}
                includeCount={false}
                canUpdate={canUpdate}
                suppressedTagIds={[]}
                trackPersistentExpand={searchString === ""}
              />
            )}
          </MainPuzzleListSection>
        </div>
      );
    },
    [
      huntId,
      displayMode,
      allPuzzles,
      allTags,
      canUpdate,
      searchString,
      allGroupsExpanded,
      expandAllGroups,
      collapseAllGroups,
      bookmarked,
    ],
  );

  const idPrefix = useId();

  const operatorModeToggle = canAdd && (
    <ControlGroup>
      <ControlLabel>Operator mode:</ControlLabel>
      <StyledToggleButtonGroup
        type="radio"
        name="operator-actions"
        value={operatorActionsHidden ? "hide" : "show"}
        onChange={setOperatorActionsHiddenString}
      >
        <ToggleButton
          id={`${idPrefix}-operator-actions-show-button`}
          variant="outline-secondary"
          value="show"
          size="sm"
        >
          On
        </ToggleButton>
        <ToggleButton
          id={`${idPrefix}-operator-actions-hide-button`}
          variant="outline-secondary"
          value="hide"
          size="sm"
        >
          Off
        </ToggleButton>
      </StyledToggleButtonGroup>
    </ControlGroup>
  );

  const addPuzzleButton = canAdd && (
    <StyledButton variant="primary" onClick={showAddModal} size="sm">
      <FontAwesomeIcon icon={faPlus} /> Add puzzle
    </StyledButton>
  );

  const matchingSearch = puzzlesMatchingSearchString(allPuzzles);
  const matchingSearchAndViewer = puzzlesMatchingViewerFilter(matchingSearch);
  const matchingSearchAndViewerAndSolved = puzzlesMatchingSolvedFilter(
    matchingSearchAndViewer,
  );
  // Normally, we'll just show matchingSearchAndViewerAndSolved, but if that produces
  // no results, and there *is* a solved puzzle that is not being displayed due
  // to the solved filter, then show that and a note that we're showing solved
  // puzzles because no unsolved puzzles matched.
  const solvedOverConstrains =
    matchingSearchAndViewer.length > 0 &&
    matchingSearchAndViewerAndSolved.length === 0;
  const retainedPuzzles = solvedOverConstrains
    ? matchingSearchAndViewer
    : matchingSearchAndViewerAndSolved;
  const retainedDeletedPuzzles =
    deletedPuzzles && puzzlesMatchingSearchString(deletedPuzzles);

  return (
    <div>
      {canAdd && (
        <PuzzleModalForm
          huntId={huntId}
          tags={allTags}
          ref={addModalRef}
          onSubmit={onAdd}
        />
      )}
      <StatsAndActionsBar>
        <StatsText>
          <span>
            <strong>Metas:</strong> {huntStats.metasSolved}/{huntStats.metasTotal}
          </span>
          <span>
            <strong>Puzzles:</strong> {huntStats.puzzlesSolved}/
            {huntStats.puzzlesTotal}
          </span>
        </StatsText>
        {canAdd && (
          <ActionsGroup>
            {operatorModeToggle}
            {addPuzzleButton}
          </ActionsGroup>
        )}
      </StatsAndActionsBar>
      <FiltersContainer>
        <SectionHeader>Filters</SectionHeader>
        <ViewControls>
          <TopRow>
            <SearchContainer>
              <SearchFormGroup controlId={`${idPrefix}-puzzle-search`}>
                <SearchFormLabel>Search</SearchFormLabel>
                <SearchInputGroup>
                  <FormControl
                    as="input"
                    type="text"
                    ref={searchBarRef}
                    placeholder="Search by name, answer, tag, etc."
                    value={searchString}
                    onChange={onSearchStringChange}
                  />
                  {searchString && (
                    <ClearSearchButton
                      type="button"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      <FontAwesomeIcon icon={faCircleXmark} />
                    </ClearSearchButton>
                  )}
                </SearchInputGroup>
              </SearchFormGroup>
            </SearchContainer>
            <ControlGroup>
              <ControlLabel>Show:</ControlLabel>
              <StyledToggleButtonGroup
                type="radio"
                name="show-solved"
                value={showSolved ? "show" : "hide"}
                onChange={setShowSolvedString}
              >
                <ToggleButton
                  id={`${idPrefix}-solved-show-button`}
                  variant="outline-secondary"
                  value="show"
                  size="sm"
                >
                  All
                </ToggleButton>
                <ToggleButton
                  id={`${idPrefix}-solved-hide-button`}
                  variant="outline-secondary"
                  value="hide"
                  size="sm"
                >
                  Unsolved
                </ToggleButton>
              </StyledToggleButtonGroup>
            </ControlGroup>
            <ControlGroup>
              <ControlLabel>Organize by:</ControlLabel>
              <StyledToggleButtonGroup
                type="radio"
                name="puzzle-view"
                value={displayMode}
                onChange={setDisplayMode}
              >
                <ToggleButton
                  id={`${idPrefix}-view-group-button`}
                  variant="outline-secondary"
                  value="group"
                  size="sm"
                >
                  Group
                </ToggleButton>
                <ToggleButton
                  id={`${idPrefix}-view-unlock-button`}
                  variant="outline-secondary"
                  value="unlock"
                  size="sm"
                >
                  Unlock
                </ToggleButton>
              </StyledToggleButtonGroup>
            </ControlGroup>
          </TopRow>
          <BottomRow>
            <ViewerFilterGroup>
              <ControlLabel>Filter by:</ControlLabel>
              <CompactFormSelect
                value={viewerFilter}
                onChange={(e) => setViewerFilter(e.target.value)}
              >
                <option value="">All viewers</option>
                {allViewers.map((viewer) => (
                  <option key={viewer.userId} value={viewer.userId}>
                    {viewer.displayName}
                  </option>
                ))}
              </CompactFormSelect>
            </ViewerFilterGroup>
          </BottomRow>
        </ViewControls>
      </FiltersContainer>
      {renderList(
        retainedPuzzles,
        retainedDeletedPuzzles,
        solvedOverConstrains,
        allPuzzles.length,
      )}
    </div>
  );
};

const PuzzleListPage = () => {
  const huntId = useParams<"huntId">().huntId!;

  // Assertion is safe because hunt is already subscribed and checked by HuntApp
  const hunt = useTracker(() => Hunts.findOne(huntId)!, [huntId]);
  const { canAdd, canUpdate } = useTracker(() => {
    return {
      canAdd: userMayWritePuzzlesForHunt(Meteor.user(), hunt),
      canUpdate: userMayWritePuzzlesForHunt(Meteor.user(), hunt),
    };
  }, [hunt]);

  const puzzlesLoading = useTypedSubscribe(puzzlesForPuzzleList, {
    huntId,
    includeDeleted: canUpdate,
  });
  const loading = puzzlesLoading();

  // Don't bother including this in loading - it's ok if they trickle in
  useTypedSubscribe(puzzleActivityForHunt, { huntId });
  useSubscribeDisplayNames(huntId);
  useSubscribeAvatars(huntId);

  return loading ? (
    <span>loading...</span>
  ) : (
    <div>
      <HuntNavWrapper>
        <HuntNav />
      </HuntNavWrapper>

      <PuzzleListView
        huntId={huntId}
        canAdd={canAdd}
        canUpdate={canUpdate}
        loading={loading}
      />
    </div>
  );
};

export default PuzzleListPage;
