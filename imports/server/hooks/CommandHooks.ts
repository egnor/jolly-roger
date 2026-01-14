import OpenAI from "openai";
import Logger from "../../Logger";
import type { ChatMessageType } from "../../lib/models/ChatMessages";
import ChatMessages, {
  contentFromMessage,
} from "../../lib/models/ChatMessages";
import DocumentActivities from "../../lib/models/DocumentActivities";
import Documents from "../../lib/models/Documents";
import Guesses from "../../lib/models/Guesses";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import CallActivities from "../models/CallActivities";
import sendChatMessageInternal from "../sendChatMessageInternal";
import type Hookset from "./Hookset";

// Initialize OpenAI client with API key from environment
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface CommandHandler {
  // Returns true if the command was handled, false otherwise
  handle: (chatMessage: ChatMessageType, args: string) => Promise<boolean>;
  // Description shown in /help command
  description: string;
  // Whether the command is private (only requester sees response)
  private?: boolean;
}

// Extract plain text from a chat message
function extractTextFromMessage(chatMessage: ChatMessageType): string {
  return chatMessage.content.children
    .map((child) => {
      if ("text" in child) {
        return child.text;
      }
      return "";
    })
    .join("");
}

// Parse a message to check if it's a command and extract command name and args
function parseCommand(text: string): { command: string; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  // Extract command name and arguments
  const match = trimmed.match(/^\/(\w+)\s*(.*)/);
  if (!match || !match[1]) {
    return null;
  }

  return {
    command: match[1].toLowerCase(),
    args: (match[2] || "").trim(),
  };
}

// Command: /help - List available commands
const helpCommand: CommandHandler = {
  description: "Show available commands and their descriptions",
  private: true,
  async handle(chatMessage: ChatMessageType, _args: string): Promise<boolean> {
    const commandList = Object.entries(commands)
      .map(([name, handler]) => {
        return `**/${name}** - ${handler.description}`;
      })
      .join("\n");

    await sendChatMessageInternal({
      puzzleId: chatMessage.puzzle,
      content: contentFromMessage(
        `📋 **Available Commands**\n\n${commandList}\n\nAll commands are private (only visible to you).`,
      ),
      sender: undefined,
      recipient: chatMessage.sender,
    });

    return true;
  },
};

// Command: /debug - Show debug info about chat messages
const debugCommand: CommandHandler = {
  description: "Show debugging information about recent chat messages",
  private: true,
  async handle(chatMessage: ChatMessageType, _args: string): Promise<boolean> {
    try {
      const puzzle = await Puzzles.findOneAsync(chatMessage.puzzle);
      if (!puzzle) {
        throw new Error("Puzzle not found");
      }

      // Fetch recent chat messages (last 10) - include ALL non-deleted messages
      // Note: SoftDeletedModel automatically filters out deleted: true
      const allMessages = await ChatMessages.find(
        {
          puzzle: chatMessage.puzzle,
          hunt: puzzle.hunt,
        },
        {
          sort: { timestamp: -1 },
          limit: 10,
        },
      ).fetchAsync();

      // Count all non-deleted messages
      // Note: SoftDeletedModel automatically adds { deleted: false } to all queries
      const totalCount = await ChatMessages.find({
        puzzle: chatMessage.puzzle,
        hunt: puzzle.hunt,
      }).countAsync();

      // Count public messages (no recipient)
      const publicCount = await ChatMessages.find({
        puzzle: chatMessage.puzzle,
        hunt: puzzle.hunt,
        recipient: { $exists: false },
      }).countAsync();

      const debugInfo = allMessages
        .reverse()
        .map((msg, idx) => {
          const text = extractTextFromMessage(msg);
          const sender = msg.sender
            ? `User ${msg.sender.substring(0, 8)}`
            : "System";
          const recipient = msg.recipient
            ? ` [to: ${msg.recipient.substring(0, 8)}]`
            : "";
          const deleted = msg.deleted ? " [DELETED]" : "";
          return `${idx + 1}. [${sender}]${recipient}${deleted}: ${text.substring(0, 100)}${text.length > 100 ? "..." : ""}`;
        })
        .join("\n");

      await sendChatMessageInternal({
        puzzleId: chatMessage.puzzle,
        content: contentFromMessage(
          `🔍 **Chat Debug Info**\n\nPuzzle: ${puzzle.title}\nHunt: ${puzzle.hunt.substring(0, 8)}...\n\nTotal (non-deleted): ${totalCount} | Public: ${publicCount}\n\nLast 10 messages:\n${debugInfo || "No messages found"}`,
        ),
        sender: undefined,
        recipient: chatMessage.sender,
      });

      return true;
    } catch (error) {
      Logger.error("Error running debug command", { error });
      await sendChatMessageInternal({
        puzzleId: chatMessage.puzzle,
        content: contentFromMessage(
          `❌ Error running debug: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
        sender: undefined,
        recipient: chatMessage.sender,
      });
      return true;
    }
  },
};

// Command: /users - Show all-time user activity summary
const usersCommand: CommandHandler = {
  description: "Show all-time user activity on this puzzle",
  private: true,
  async handle(chatMessage: ChatMessageType, _args: string): Promise<boolean> {
    Logger.info("/users command invoked", {
      puzzleId: chatMessage.puzzle,
      userId: chatMessage.sender,
    });

    try {
      const puzzle = await Puzzles.findOneAsync(chatMessage.puzzle);
      if (!puzzle) {
        throw new Error("Puzzle not found");
      }

      // Get all users who have sent chat messages
      const chatMessages = await ChatMessages.find({
        puzzle: chatMessage.puzzle,
        hunt: puzzle.hunt,
        sender: { $exists: true }, // Only messages with a sender (not system messages)
        recipient: { $exists: false }, // Only public messages
      }).fetchAsync();

      // Count messages per user
      const chatActivity = new Map<string, number>();
      for (const msg of chatMessages) {
        if (msg.sender) {
          chatActivity.set(msg.sender, (chatActivity.get(msg.sender) || 0) + 1);
        }
      }

      // Get all documents for this puzzle
      const documents = await Documents.find({
        puzzle: chatMessage.puzzle,
        hunt: puzzle.hunt,
      }).fetchAsync();

      // Get document activity for all documents
      // Note: DocumentActivities records are time-bucketed (5 min in prod, 5 sec in dev)
      // representing periods of active editing, not discrete edit events
      const docActivity = new Map<string, number>();
      for (const doc of documents) {
        const activities = await DocumentActivities.find({
          document: doc._id,
          user: { $exists: true },
        }).fetchAsync();

        for (const activity of activities) {
          if (activity.user) {
            docActivity.set(
              activity.user,
              (docActivity.get(activity.user) || 0) + 1,
            );
          }
        }
      }

      // Get call activity (speaking time) for this puzzle
      // Note: CallActivities records are created when users actively speak,
      // not just when they're connected. Each record represents ~1 second of speaking.
      const callActivities = await CallActivities.find({
        call: chatMessage.puzzle, // puzzle ID is used as call ID
        user: { $exists: true },
      }).fetchAsync();

      // Count speaking time per user (each activity record ~ 1 second of speaking)
      const callActivity = new Map<string, number>();
      for (const activity of callActivities) {
        if (activity.user) {
          callActivity.set(
            activity.user,
            (callActivity.get(activity.user) || 0) + 1,
          );
        }
      }

      // Combine all users
      const allUserIds = new Set([
        ...chatActivity.keys(),
        ...docActivity.keys(),
        ...callActivity.keys(),
      ]);

      Logger.info("/users command found activity", {
        chatUsers: chatActivity.size,
        docUsers: docActivity.size,
        callUsers: callActivity.size,
        totalUsers: allUserIds.size,
      });

      if (allUserIds.size === 0) {
        await sendChatMessageInternal({
          puzzleId: chatMessage.puzzle,
          content: contentFromMessage(
            "👥 **User Activity**\n\nNo user activity found on this puzzle yet.",
          ),
          sender: undefined,
          recipient: chatMessage.sender,
        });
        return true;
      }

      // Fetch user details and build summary with activity counts
      const userDataList: Array<{
        userId: string;
        displayName: string;
        chatCount: number;
        docBuckets: number;
        callSeconds: number;
        total: number;
      }> = [];

      for (const userId of allUserIds) {
        const user = await MeteorUsers.findOneAsync(userId);
        const displayName = user?.displayName || "Unknown User";
        const chatCount = chatActivity.get(userId) || 0;
        const docBuckets = docActivity.get(userId) || 0;
        const callSeconds = callActivity.get(userId) || 0;

        userDataList.push({
          userId,
          displayName,
          chatCount,
          docBuckets,
          callSeconds,
          total: chatCount + docBuckets + callSeconds,
        });
      }

      // Sort by total activity (descending)
      userDataList.sort((a, b) => b.total - a.total);

      // Format time nicely (for both speaking and document editing)
      const formatTime = (seconds: number): string => {
        if (seconds < 60) {
          return `${seconds}s`;
        }
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (remainingSeconds === 0) {
          return `${minutes}m`;
        }
        return `${minutes}m ${remainingSeconds}s`;
      };

      // Build summary strings with icons (matching PuzzleActivity.tsx icons)
      const userSummaries = userDataList.map((userData) => {
        const activities: string[] = [];

        // All-time activity
        if (userData.chatCount > 0) {
          activities.push(`💬 ${userData.chatCount}`);
        }
        if (userData.callSeconds > 0) {
          activities.push(`📞 ${formatTime(userData.callSeconds)}`);
        }
        if (userData.docBuckets > 0) {
          // Note: docBuckets are time windows, not discrete edits
          // In production: ~5 min/bucket, in development: ~5 sec/bucket
          activities.push(`📝 ~${userData.docBuckets}`);
        }

        return `• **${userData.displayName}**: ${activities.join("  ")}`;
      });

      await sendChatMessageInternal({
        puzzleId: chatMessage.puzzle,
        content: contentFromMessage(
          `👥 **User Activity** (${allUserIds.size} user${allUserIds.size !== 1 ? "s" : ""}) - All Time\n\n💬 Chat  📞 Call  📝 Doc\n\n${userSummaries.join("\n")}`,
        ),
        sender: undefined,
        recipient: chatMessage.sender,
      });

      return true;
    } catch (error) {
      Logger.error("Error running users command", { error });
      await sendChatMessageInternal({
        puzzleId: chatMessage.puzzle,
        content: contentFromMessage(
          `❌ Error getting user activity: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
        sender: undefined,
        recipient: chatMessage.sender,
      });
      return true;
    }
  },
};

// Command: /recent - Show recent user activity summary (last 30 minutes)
const recentCommand: CommandHandler = {
  description: "Show recent user activity on this puzzle (last 30 minutes)",
  private: true,
  async handle(chatMessage: ChatMessageType, _args: string): Promise<boolean> {
    Logger.info("/recent command invoked", {
      puzzleId: chatMessage.puzzle,
      userId: chatMessage.sender,
    });

    try {
      const puzzle = await Puzzles.findOneAsync(chatMessage.puzzle);
      if (!puzzle) {
        throw new Error("Puzzle not found");
      }

      // Define time window for "recent" activity (30 minutes)
      const recentThreshold = new Date(Date.now() - 30 * 60 * 1000);

      // Get recent chat messages
      const chatMessages = await ChatMessages.find({
        puzzle: chatMessage.puzzle,
        hunt: puzzle.hunt,
        sender: { $exists: true },
        recipient: { $exists: false },
        timestamp: { $gte: recentThreshold },
      }).fetchAsync();

      // Count messages per user
      const chatActivityRecent = new Map<string, number>();
      for (const msg of chatMessages) {
        if (msg.sender) {
          chatActivityRecent.set(
            msg.sender,
            (chatActivityRecent.get(msg.sender) || 0) + 1,
          );
        }
      }

      // Get all documents for this puzzle
      const documents = await Documents.find({
        puzzle: chatMessage.puzzle,
        hunt: puzzle.hunt,
      }).fetchAsync();

      // Get recent document activity
      const docActivityRecent = new Map<string, number>();
      for (const doc of documents) {
        const activities = await DocumentActivities.find({
          document: doc._id,
          user: { $exists: true },
          ts: { $gte: recentThreshold },
        }).fetchAsync();

        for (const activity of activities) {
          if (activity.user) {
            docActivityRecent.set(
              activity.user,
              (docActivityRecent.get(activity.user) || 0) + 1,
            );
          }
        }
      }

      // Get recent call activity
      const callActivities = await CallActivities.find({
        call: chatMessage.puzzle,
        user: { $exists: true },
        ts: { $gte: recentThreshold },
      }).fetchAsync();

      // Count speaking time per user
      const callActivityRecent = new Map<string, number>();
      for (const activity of callActivities) {
        if (activity.user) {
          callActivityRecent.set(
            activity.user,
            (callActivityRecent.get(activity.user) || 0) + 1,
          );
        }
      }

      // Combine all users with recent activity
      const allUserIds = new Set([
        ...chatActivityRecent.keys(),
        ...docActivityRecent.keys(),
        ...callActivityRecent.keys(),
      ]);

      Logger.info("/recent command found activity", {
        chatUsers: chatActivityRecent.size,
        docUsers: docActivityRecent.size,
        callUsers: callActivityRecent.size,
        totalUsers: allUserIds.size,
      });

      if (allUserIds.size === 0) {
        await sendChatMessageInternal({
          puzzleId: chatMessage.puzzle,
          content: contentFromMessage(
            "👥 **Recent User Activity**\n\nNo user activity in the last 30 minutes.",
          ),
          sender: undefined,
          recipient: chatMessage.sender,
        });
        return true;
      }

      // Fetch user details and build summary
      const userDataList: Array<{
        userId: string;
        displayName: string;
        chatCountRecent: number;
        docBucketsRecent: number;
        callSecondsRecent: number;
        totalRecent: number;
      }> = [];

      for (const userId of allUserIds) {
        const user = await MeteorUsers.findOneAsync(userId);
        const displayName = user?.displayName || "Unknown User";
        const chatCountRecent = chatActivityRecent.get(userId) || 0;
        const docBucketsRecent = docActivityRecent.get(userId) || 0;
        const callSecondsRecent = callActivityRecent.get(userId) || 0;

        userDataList.push({
          userId,
          displayName,
          chatCountRecent,
          docBucketsRecent,
          callSecondsRecent,
          totalRecent: chatCountRecent + docBucketsRecent + callSecondsRecent,
        });
      }

      // Sort by recent activity (descending)
      userDataList.sort((a, b) => b.totalRecent - a.totalRecent);

      // Format time nicely
      const formatTime = (seconds: number): string => {
        if (seconds < 60) {
          return `${seconds}s`;
        }
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (remainingSeconds === 0) {
          return `${minutes}m`;
        }
        return `${minutes}m ${remainingSeconds}s`;
      };

      // Build summary strings with icons
      const userSummaries = userDataList.map((userData) => {
        const activities: string[] = [];

        if (userData.chatCountRecent > 0) {
          activities.push(`💬 ${userData.chatCountRecent}`);
        }
        if (userData.callSecondsRecent > 0) {
          activities.push(`📞 ${formatTime(userData.callSecondsRecent)}`);
        }
        if (userData.docBucketsRecent > 0) {
          activities.push(`📝 ~${userData.docBucketsRecent}`);
        }

        return `• **${userData.displayName}**: ${activities.join("  ")}`;
      });

      await sendChatMessageInternal({
        puzzleId: chatMessage.puzzle,
        content: contentFromMessage(
          `👥 **Recent Activity** (${allUserIds.size} user${allUserIds.size !== 1 ? "s" : ""}) - Last 30min\n\n💬 Chat  📞 Call  📝 Doc\n\n${userSummaries.join("\n")}`,
        ),
        sender: undefined,
        recipient: chatMessage.sender,
      });

      return true;
    } catch (error) {
      Logger.error("Error running recent command", { error });
      await sendChatMessageInternal({
        puzzleId: chatMessage.puzzle,
        content: contentFromMessage(
          `❌ Error getting recent activity: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
        sender: undefined,
        recipient: chatMessage.sender,
      });
      return true;
    }
  },
};

// Command: /summary - Generate an LLM summary of the puzzle state
const summaryCommand: CommandHandler = {
  description:
    "Generate an AI summary of the puzzle's current state and progress",
  private: true,
  async handle(chatMessage: ChatMessageType, _args: string): Promise<boolean> {
    if (!openai) {
      Logger.error("OpenAI API key not configured");
      await sendChatMessageInternal({
        puzzleId: chatMessage.puzzle,
        content: contentFromMessage(
          "⚠️ OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.",
        ),
        sender: undefined,
        recipient: chatMessage.sender,
      });
      return true;
    }

    try {
      // Send "working on it" message (private to requester)
      await sendChatMessageInternal({
        puzzleId: chatMessage.puzzle,
        content: contentFromMessage("🤔 Generating puzzle summary..."),
        sender: undefined,
        recipient: chatMessage.sender,
      });

      // Fetch puzzle details
      const puzzle = await Puzzles.findOneAsync(chatMessage.puzzle);
      if (!puzzle) {
        throw new Error("Puzzle not found");
      }

      // Fetch recent chat messages (last 50), excluding private command responses
      // Note: SoftDeletedModel automatically excludes deleted messages
      const recentMessages = await ChatMessages.find(
        {
          puzzle: chatMessage.puzzle,
          hunt: puzzle.hunt,
          // Exclude private messages (command responses)
          recipient: { $exists: false },
        },
        {
          sort: { timestamp: -1 },
          limit: 50,
        },
      ).fetchAsync();

      // Fetch recent guesses
      // Note: SoftDeletedModel automatically excludes deleted guesses
      const guesses = await Guesses.find(
        {
          puzzle: chatMessage.puzzle,
        },
        {
          sort: { createdAt: -1 },
        },
      ).fetchAsync();

      // Build context for LLM
      const chatHistory = recentMessages
        .reverse()
        .map((msg) => {
          const text = extractTextFromMessage(msg);
          const sender = msg.sender
            ? `User ${msg.sender.substring(0, 8)}`
            : "System";
          return `[${sender}]: ${text}`;
        })
        .join("\n");

      const guessHistory = guesses
        .map((guess) => {
          return `- "${guess.guess}" [${guess.state}]${guess.additionalNotes ? `: ${guess.additionalNotes}` : ""}`;
        })
        .join("\n");

      const prompt = `You are analyzing the current state of a puzzle hunt puzzle. Please provide a concise summary of:
1. What has been tried or discussed
2. Current theories or approaches
3. Any patterns or insights that have emerged
4. Suggested next steps

Puzzle Information:
Title: ${puzzle.title}
${puzzle.url ? `URL: ${puzzle.url}` : ""}
Expected Answer Count: ${puzzle.expectedAnswerCount}
${puzzle.answers?.length > 0 ? `Solved with: ${puzzle.answers.join(", ")}` : "Status: Unsolved"}

Recent Guesses:
${guessHistory || "No guesses yet"}

Recent Chat History (last 50 messages):
${chatHistory || "No chat messages yet"}

Please provide a helpful summary that will help the team understand the current state and move forward.`;

      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant analyzing puzzle hunt puzzles. Provide concise, actionable summaries.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const summary =
        completion.choices[0]?.message?.content || "Unable to generate summary";

      // Send the summary as a private message to the requester
      await sendChatMessageInternal({
        puzzleId: chatMessage.puzzle,
        content: contentFromMessage(`📊 **Puzzle Summary**\n\n${summary}`),
        sender: undefined,
        recipient: chatMessage.sender,
      });

      Logger.info("Generated puzzle summary", {
        puzzleId: chatMessage.puzzle,
        requestedBy: chatMessage.sender,
      });

      return true;
    } catch (error) {
      Logger.error("Error generating puzzle summary", { error });
      await sendChatMessageInternal({
        puzzleId: chatMessage.puzzle,
        content: contentFromMessage(
          `❌ Error generating summary: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
        sender: undefined,
        recipient: chatMessage.sender,
      });
      return true;
    }
  },
};

// Registry of available commands
const commands: Record<string, CommandHandler> = {
  help: helpCommand,
  debug: debugCommand,
  users: usersCommand,
  recent: recentCommand,
  summary: summaryCommand,
};

const CommandHooks: Hookset = {
  name: "CommandHooks",

  async onChatMessageCreated(chatMessageId: string) {
    const chatMessage = await ChatMessages.findOneAsync(chatMessageId);
    if (!chatMessage) {
      return;
    }

    // Don't process system messages
    if (!chatMessage.sender) {
      return;
    }

    // Extract text and check if it's a command
    const text = extractTextFromMessage(chatMessage);
    const parsed = parseCommand(text);

    if (!parsed) {
      return;
    }

    // Look up the command handler
    const handler = commands[parsed.command];
    if (!handler) {
      // Unknown command - ignore silently (could be meant for another system)
      return;
    }

    // Make the command message itself private (only visible to sender)
    // This prevents everyone from seeing "/help", "/summary", etc.
    await ChatMessages.updateAsync(chatMessageId, {
      $set: { recipient: chatMessage.sender },
    });

    // Execute the command handler
    try {
      await handler.handle(chatMessage, parsed.args);
    } catch (error) {
      Logger.error("Error executing command", {
        command: parsed.command,
        error,
        chatMessageId,
      });
      // Send error message privately to the requester
      await sendChatMessageInternal({
        puzzleId: chatMessage.puzzle,
        content: contentFromMessage(
          `❌ Error executing command /${parsed.command}: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
        sender: undefined,
        recipient: chatMessage.sender,
      });
    }
  },
};

export default CommandHooks;
