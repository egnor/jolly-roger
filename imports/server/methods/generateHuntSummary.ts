import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import ChatMessages from "../../lib/models/ChatMessages";
import DocumentActivities from "../../lib/models/DocumentActivities";
import Documents from "../../lib/models/Documents";
import Guesses from "../../lib/models/Guesses";
import Hunts from "../../lib/models/Hunts";
import Puzzles from "../../lib/models/Puzzles";
import generateHuntSummary from "../../methods/generateHuntSummary";
import { getAIProvider } from "../AIProvider";
import { huntSummaryCache } from "../HuntSummaryCache";
import defineMethod from "./defineMethod";

defineMethod(generateHuntSummary, {
  validate(arg) {
    check(arg, {
      huntId: String,
      timeWindowMinutes: Number,
      forceRegenerate: Match.Optional(Boolean),
    });
    return arg;
  },

  async run({ huntId, timeWindowMinutes, forceRegenerate = false }) {
    // 1. Verify user is logged in
    check(this.userId, String);
    const userId = this.userId;

    // 2. Verify hunt exists and AI summaries are enabled
    const hunt = await Hunts.findOneAsync(huntId);
    if (!hunt) {
      throw new Meteor.Error("not-found", "Hunt not found");
    }

    if (!hunt.aiSummaryEnabled) {
      throw new Meteor.Error(
        "feature-disabled",
        "AI summaries are not enabled for this hunt"
      );
    }

    // 3. Check rate limiting first to see if we can regenerate
    // Rate limit is per (hunt, timeWindow), not per user
    const rateLimitCheck = huntSummaryCache.checkRateLimit(
      huntId,
      timeWindowMinutes
    );

    // 4. If rate limit allows, check cache and return if exists
    // If rate limit blocks, it means we're still within cooldown - return cached or error
    const cached = huntSummaryCache.getCached(huntId, timeWindowMinutes);

    if (!rateLimitCheck.allowed) {
      // Rate limit in effect - must return cached result
      if (cached) {
        Logger.info("Returning cached hunt summary (rate limited)", {
          huntId,
          timeWindowMinutes,
          userId,
          cacheAge: Date.now() - cached.timestamp.getTime(),
        });
        return {
          summary: cached.summary,
          generatedAt: cached.timestamp,
        };
      } else {
        // This shouldn't happen (rate limit without cache), but handle it
        throw new Meteor.Error(
          "rate-limit-exceeded",
          `This summary was recently generated. Please try again in ${rateLimitCheck.retryAfterSeconds} seconds.`
        );
      }
    }

    // 5. If cached summary exists and not forcing regeneration, return it
    // Only regenerate if there's no cache OR user explicitly clicked "Regenerate"
    if (cached && !forceRegenerate) {
      Logger.info("Returning cached hunt summary", {
        huntId,
        timeWindowMinutes,
        userId,
        cacheAge: Date.now() - cached.timestamp.getTime(),
      });
      return {
        summary: cached.summary,
        generatedAt: cached.timestamp,
      };
    }

    // 6. Calculate time threshold
    const now = new Date();
    const threshold =
      timeWindowMinutes === -1
        ? new Date(0) // Full hunt = beginning of time
        : new Date(now.getTime() - timeWindowMinutes * 60 * 1000);

    // 7. Fetch data in parallel
    const [puzzles, recentPuzzles, guesses, chatMessages, documents] =
      await Promise.all([
        // All puzzles for context
        Puzzles.find({ hunt: huntId }).fetchAsync(),

        // Puzzles created in time window
        Puzzles.find({
          hunt: huntId,
          createdAt: { $gte: threshold },
        }).fetchAsync(),

        // Guesses in time window
        Guesses.find(
          {
            hunt: huntId,
            createdAt: { $gte: threshold },
          },
          { sort: { createdAt: -1 }, limit: 100 }
        ).fetchAsync(),

        // Chat messages in time window (limited to prevent huge prompts)
        ChatMessages.find(
          {
            hunt: huntId,
            timestamp: { $gte: threshold },
            recipient: { $exists: false }, // Exclude private messages
            sender: { $exists: true }, // Exclude system messages
          },
          { sort: { timestamp: -1 }, limit: 200 }
        ).fetchAsync(),

        // Documents for this hunt (to count activity later)
        Documents.find({ hunt: huntId }).fetchAsync(),
      ]);

    // Get document activities for the time window
    const documentIds = documents.map((doc) => doc._id);
    const docActivities = await DocumentActivities.find({
      document: { $in: documentIds },
      ts: { $gte: threshold },
    }).fetchAsync();

    // 7. Build prompt
    const totalPuzzles = puzzles.length;
    const solvedPuzzles = puzzles.filter(
      (p) => p.answers && p.answers.length > 0
    );
    const unsolvedPuzzles = puzzles.filter(
      (p) => !p.answers || p.answers.length === 0
    );

    const newPuzzlesList =
      recentPuzzles.length > 0
        ? recentPuzzles
            .map((p) => `- "${p.title}" ${p.url ? `(${p.url})` : ""}`)
            .join("\n")
        : "No new puzzles";

    const solvesList =
      guesses.filter((g) => g.state === "correct").length > 0
        ? guesses
            .filter((g) => g.state === "correct")
            .map((g) => {
              const puzzle = puzzles.find((p) => p._id === g.puzzle);
              return `- "${g.guess}" for puzzle "${puzzle?.title || "Unknown"}"`;
            })
            .join("\n")
        : "No solves";

    const incorrectGuesses = guesses.filter((g) => g.state !== "correct");
    const guessAttemptsList =
      incorrectGuesses.length > 0
        ? incorrectGuesses
            .slice(0, 20) // Limit to prevent huge prompts
            .map((g) => {
              const puzzle = puzzles.find((p) => p._id === g.puzzle);
              return `- "${g.guess}" [${g.state}] for "${puzzle?.title || "Unknown"}"${g.additionalNotes ? `: ${g.additionalNotes}` : ""}`;
            })
            .join("\n")
        : "No guess attempts";

    // Get most active puzzles (by message count)
    const puzzleMessageCounts = new Map<string, number>();
    for (const msg of chatMessages) {
      puzzleMessageCounts.set(
        msg.puzzle,
        (puzzleMessageCounts.get(msg.puzzle) || 0) + 1
      );
    }
    const activePuzzlesList =
      puzzleMessageCounts.size > 0
        ? Array.from(puzzleMessageCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([puzzleId, count]) => {
              const puzzle = puzzles.find((p) => p._id === puzzleId);
              return `- "${puzzle?.title || "Unknown"}" (${count} messages)`;
            })
            .join("\n")
        : "No significant chat activity";

    const timeWindowDescription =
      timeWindowMinutes === -1
        ? "the entire hunt"
        : timeWindowMinutes === 60
          ? "the last hour"
          : timeWindowMinutes === 240
            ? "the last 4 hours"
            : `the last ${timeWindowMinutes} minutes`;

    const prompt = `You are analyzing activity for a puzzle hunt event called "${hunt.name}".

Please provide a concise, well-organized summary of the hunt's progress during ${timeWindowDescription}.

HUNT OVERVIEW:
- Total puzzles: ${totalPuzzles}
- Solved: ${solvedPuzzles.length}
- Unsolved: ${unsolvedPuzzles.length}

NEW PUZZLES (created in this time window):
${newPuzzlesList}

PUZZLE SOLVES (in this time window):
${solvesList}

GUESS ATTEMPTS (in this time window):
${guessAttemptsList}

MOST ACTIVE PUZZLES (by chat activity):
${activePuzzlesList}

CHAT ACTIVITY:
${chatMessages.length} messages sent

DOCUMENT ACTIVITY:
${docActivities.length} document edit events

Please provide a summary that includes:
1. Overall progress and momentum
2. Key achievements (solves, breakthroughs)
3. Areas of active focus
4. Suggested priorities or areas needing attention

Keep the summary concise (200-300 words) and actionable.`;

    // 8. Generate summary using AI provider
    try {
      const provider = getAIProvider();
      Logger.info("Generating hunt summary", {
        huntId,
        timeWindowMinutes,
        provider: provider.name,
        userId,
      });

      const summary = await provider.generateSummary(prompt);

      // 8. Cache the result
      const generatedAt = new Date();
      huntSummaryCache.setCached(huntId, timeWindowMinutes, summary);

      Logger.info("Generated hunt summary", {
        huntId,
        timeWindowMinutes,
        summaryLength: summary.length,
        userId,
      });

      return {
        summary,
        generatedAt,
      };
    } catch (error) {
      Logger.error("Error generating hunt summary", {
        error,
        huntId,
        userId,
      });
      throw new Meteor.Error(
        "ai-error",
        `Failed to generate summary: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
});
