import { check } from "meteor/check";
import sendPuzzleHeartbeat from "../../methods/sendPuzzleHeartbeat";
import sendPuzzleHeartbeatInternal from "../sendPuzzleHeartbeatInternal";
import defineMethod from "./defineMethod";

defineMethod(sendPuzzleHeartbeat, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
    });
    return arg;
  },

  async run({ puzzleId }: { puzzleId: string }) {
    check(this.userId, String);
    await sendPuzzleHeartbeatInternal({
      puzzleId,
      userId: this.userId,
    });
  },
});