import React from 'react';
import { PuzzleType } from '../../lib/schemas/Puzzle';
import { TagType } from '../../lib/schemas/Tag';
import Puzzle from './Puzzle';

const PuzzleList = React.memo(({
  puzzles, allTags, canUpdate, suppressTags, segmentAnswers,
}: {
  // The puzzles to show in this list
  puzzles: PuzzleType[];
  // All tags for this hunt, including those not used by any puzzles
  allTags: TagType[];
  canUpdate: boolean;
  suppressTags?: string[];
  segmentAnswers?: boolean;
}) => {
  // This component just renders the puzzles provided, in order.
  // Adjusting order based on tags, tag groups, etc. is to be done at
  // a higher layer.
  return (
    <div className="puzzle-list">
      {puzzles.map((puzzle) => {
        return (
          <Puzzle
            key={puzzle._id}
            puzzle={puzzle}
            allTags={allTags}
            canUpdate={canUpdate}
            suppressTags={suppressTags}
            segmentAnswers={segmentAnswers}
          />
        );
      })}
    </div>
  );
});

export default PuzzleList;
