import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons/faCaretDown";
import { faEraser } from "@fortawesome/free-solid-svg-icons/faEraser";
import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  type ComponentPropsWithRef,
  type FC,
  useCallback,
  useId,
  useRef,
} from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import ButtonToolbar from "react-bootstrap/ButtonToolbar";
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

const ViewControls = styled.div<{ $canAdd?: boolean }>`
  display: grid;
  grid-template-columns: auto auto auto 1fr;
  align-items: end;
  gap: 1em;
  margin-bottom: 1em;
  ${(props) =>
    props.$canAdd &&
    mediaBreakpointDown(
      "xs",
      css`
        grid-template-columns: 1fr 1fr;
      `,
    )}

  @media (width < 360px) {
    /* For very narrow viewports (like iPad Split View) */
    grid-template-columns: 100%;
  }

  .btn {
    /* Inputs and Button Toolbars are not quite the same height */
    padding-top: 7px;
    padding-bottom: 7px;
  }
`;

const SearchFormGroup = styled(FormGroup)<{ $canAdd?: boolean }>`
  grid-column: ${(props) => (props.$canAdd ? 1 : 3)} / -1;
  ${mediaBreakpointDown(
    "sm",
    css`
      grid-column: 1 / -1;
    `,
  )}
`;

const SearchFormLabel = styled(FormLabel)<{ $canAdd?: boolean }>`
  display: ${(props) => (props.$canAdd ? "none" : "inline-block")};
  ${mediaBreakpointDown(
    "sm",
    css`
      display: none;
    `,
  )}
`;

const ViewerFilterChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const ViewerChip = styled.span<{
  $active: boolean;
  $status: "active" | "idle" | "away";
}>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  padding: 0.375rem 0.625rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: normal;
  transition: all 0.2s ease;
  max-width: 200px;
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

const ViewerFilterName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 150px;
  flex-shrink: 1;
`;

const OperatorActionsFormGroup = styled(FormGroup)`
  ${mediaBreakpointDown(
    "xs",
    css`
      order: -1;
    `,
  )}
`;

const AddPuzzleFormGroup = styled(FormGroup)`
  justify-self: end;
  ${mediaBreakpointDown(
    "xs",
    css`
      justify-self: auto;
      order: -1;
    `,
  )}

  @media (width < 360px) {
    order: -2;
  }
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

const PuzzleListToolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.5em;
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
  const canExpandAllGroups =
    displayMode === "group" &&
    Object.values(huntPuzzleListCollapseGroups).some((collapsed) => collapsed);

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

  const toggleViewerFilter = useCallback(
    (userId: string) => {
      if (viewerFilter === userId) {
        setViewerFilter("");
      } else {
        setViewerFilter(userId);
      }
    },
    [viewerFilter, setViewerFilter],
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

    allPuzzles.forEach((puzzle) => {
      const subscribersTopic = `puzzle:${puzzle._id}`;
      const subscribers = Subscribers.find({ name: subscribersTopic }).fetch();
      subscribers.forEach((sub) => {
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
    });
    return Array.from(viewersMap.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }, [allPuzzles]);

  const puzzlesMatchingViewerFilter = useCallback(
    (puzzles: PuzzleType[]): PuzzleType[] => {
      if (!viewerFilter) {
        return puzzles;
      }
      return puzzles.filter((puzzle) => {
        const subscribersTopic = `puzzle:${puzzle._id}`;
        const subscribers = Subscribers.find({
          name: subscribersTopic,
        }).fetch();
        return subscribers.some((sub) => sub.user === viewerFilter);
      });
    },
    [viewerFilter],
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
            <Button
              variant="secondary"
              size="sm"
              disabled={!canExpandAllGroups}
              onClick={expandAllGroups}
            >
              <FontAwesomeIcon icon={faCaretDown} /> Expand all
            </Button>
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
          <PuzzleListToolbar>
            <div>{listControls}</div>
            <div>{filterMessage}</div>
          </PuzzleListToolbar>
          {bookmarkedPuzzles.length > 0 && (
            <PuzzleGroupDiv>
              <div>Bookmarked</div>
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
          )}
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
      canExpandAllGroups,
      expandAllGroups,
      bookmarked,
    ],
  );

  const idPrefix = useId();

  const addPuzzleContent = canAdd && (
    <>
      <PuzzleModalForm
        huntId={huntId}
        tags={allTags}
        ref={addModalRef}
        onSubmit={onAdd}
      />
      <OperatorActionsFormGroup>
        <FormLabel>Operator Interface</FormLabel>
        <ButtonToolbar>
          <StyledToggleButtonGroup
            type="radio"
            name="operator-actions"
            defaultValue="show"
            value={operatorActionsHidden ? "hide" : "show"}
            onChange={setOperatorActionsHiddenString}
          >
            <ToggleButton
              id={`${idPrefix}-operator-actions-hide-button`}
              variant="outline-info"
              value="hide"
            >
              Off
            </ToggleButton>
            <ToggleButton
              id={`${idPrefix}-operator-actions-show-button`}
              variant="outline-info"
              value="show"
            >
              On
            </ToggleButton>
          </StyledToggleButtonGroup>
        </ButtonToolbar>
      </OperatorActionsFormGroup>
      <AddPuzzleFormGroup>
        <StyledButton variant="primary" onClick={showAddModal}>
          <FontAwesomeIcon icon={faPlus} /> Add a puzzle
        </StyledButton>
      </AddPuzzleFormGroup>
    </>
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
      <ViewControls $canAdd={canAdd}>
        <FormGroup>
          <FormLabel>Organize by</FormLabel>
          <ButtonToolbar>
            <StyledToggleButtonGroup
              type="radio"
              name="puzzle-view"
              defaultValue="group"
              value={displayMode}
              onChange={setDisplayMode}
            >
              <ToggleButton
                id={`${idPrefix}-view-group-button`}
                variant="outline-info"
                value="group"
              >
                Group
              </ToggleButton>
              <ToggleButton
                id={`${idPrefix}-view-unlock-button`}
                variant="outline-info"
                value="unlock"
              >
                Unlock
              </ToggleButton>
            </StyledToggleButtonGroup>
          </ButtonToolbar>
        </FormGroup>
        <FormGroup>
          <FormLabel>Solved puzzles</FormLabel>
          <ButtonToolbar>
            <StyledToggleButtonGroup
              type="radio"
              name="show-solved"
              defaultValue="show"
              value={showSolved ? "show" : "hide"}
              onChange={setShowSolvedString}
            >
              <ToggleButton
                id={`${idPrefix}-solved-hide-button`}
                variant="outline-info"
                value="hide"
              >
                Hidden
              </ToggleButton>
              <ToggleButton
                id={`${idPrefix}-solved-show-button`}
                variant="outline-info"
                value="show"
              >
                Shown
              </ToggleButton>
            </StyledToggleButtonGroup>
          </ButtonToolbar>
        </FormGroup>
        <FormGroup>
          <FormLabel>Filter by viewer</FormLabel>
          <FormSelect
            value={viewerFilter}
            onChange={(e) => setViewerFilter(e.target.value)}
          >
            <option value="">All puzzles</option>
            {allViewers.map((viewer) => (
              <option key={viewer.userId} value={viewer.userId}>
                {viewer.displayName}
              </option>
            ))}
          </FormSelect>
          {allViewers.length > 0 && (
            <ViewerFilterChips>
              {allViewers.slice(0, 8).map((viewer) => (
                <ViewerChip
                  key={viewer.userId}
                  $active={viewerFilter === viewer.userId}
                  $status={viewer.status}
                  onClick={() => toggleViewerFilter(viewer.userId)}
                  title={
                    viewerFilter === viewer.userId
                      ? `Clear filter: ${viewer.displayName} (${viewer.status})`
                      : `Filter to: ${viewer.displayName} (${viewer.status})`
                  }
                >
                  <StatusDot $status={viewer.status} />
                  <ViewerFilterName>{viewer.displayName}</ViewerFilterName>
                </ViewerChip>
              ))}
              {allViewers.length > 8 && (
                <ViewerChip
                  $active={false}
                  $status="away"
                  style={{ cursor: "default", opacity: 0.7 }}
                  title={`+${allViewers.length - 8} more viewers (use dropdown)`}
                >
                  +{allViewers.length - 8} more
                </ViewerChip>
              )}
            </ViewerFilterChips>
          )}
        </FormGroup>
        {addPuzzleContent}
        <SearchFormGroup
          $canAdd={canAdd}
          controlId={`${idPrefix}-puzzle-search`}
        >
          <SearchFormLabel $canAdd={canAdd}>Search</SearchFormLabel>
          <InputGroup>
            <FormControl
              as="input"
              type="text"
              ref={searchBarRef}
              placeholder="Filter by title, answer, or tag"
              value={searchString}
              onChange={onSearchStringChange}
            />
            <Button variant="secondary" onClick={clearSearch}>
              <FontAwesomeIcon icon={faEraser} />
            </Button>
          </InputGroup>
        </SearchFormGroup>
      </ViewControls>
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
