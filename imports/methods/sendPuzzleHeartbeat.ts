import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    puzzleId: string;
  },
  void
>("PuzzleHeartbeat.methods.send");