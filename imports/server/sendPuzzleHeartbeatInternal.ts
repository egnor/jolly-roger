import { Meteor } from "meteor/meteor";
import HeartbeatActivities from "../lib/models/HeartbeatActivities";
import Puzzles from "../lib/models/Puzzles";


export default async function sendPuzzleHeartbeatInternal({
  puzzleId,
  userId,
}: {
  puzzleId: string;
  userId: string;
}) {
  const puzzle = await Puzzles.findOneAsync(puzzleId);
  if (!puzzle) {
    throw new Meteor.Error(404, "Unknown puzzle");
  }

  await HeartbeatActivities.insertAsync({
    puzzle: puzzleId,
    hunt: puzzle.hunt,
    user: userId,
    ts: new Date()
  });
}