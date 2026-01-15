import { setTimeout } from "node:timers/promises";
import { Meteor } from "meteor/meteor";
import Flags from "../Flags";
import Logger from "../Logger";
import {
  ACTIVITY_GRANULARITY,
  ACTIVITY_SEGMENTS,
} from "../lib/config/activityTracking";
import DocumentActivities from "../lib/models/DocumentActivities";
import Documents from "../lib/models/Documents";
import MeteorUsers from "../lib/models/MeteorUsers";
import Settings from "../lib/models/Settings";
import roundedTime from "../lib/roundedTime";
import GoogleClient from "./googleClientRefresher";
import ignoringDuplicateKeyErrors from "./ignoringDuplicateKeyErrors";
import DriveActivityLatests from "./models/DriveActivityLatests";
import withLock, { PREEMPT_TIMEOUT } from "./withLock";

async function recordDriveChanges(
  ts: Date,
  fileIds: string[],
  googleAccountIds: string[],
) {
  const time = roundedTime(ACTIVITY_GRANULARITY, ts);

  Logger.info("Recording Drive changes", {
    fileCount: fileIds.length,
    actorCount: googleAccountIds.length,
    timestamp: ts,
  });

  // In all likelihood, we will only have one of each of these, but for
  // completeness we'll record the full cartesian product
  for (const fileId of fileIds) {
    const document = await Documents.findOneAsync({ "value.id": fileId });
    if (!document) {
      Logger.warn("Document not found in Jolly Roger", { fileId });
      continue;
    }

    for (const googleAccountId of googleAccountIds) {
      // There's no guarantee that googleAccountId is unique (in fact, since
      // many people end up registered multiple times, it may frequently not
      // be). We can make it more likely to be unique by scoping the query to
      // the hunt, and we sort by createdAt to get a deterministic result (so we
      // don't mix-and-match which user we attribute to, as long as they don't
      // link/unlink their account).
      //
      // If we can't look up the account ID, we'll record as user=undefined
      // which we'll count as a seprate user
      const user = await MeteorUsers.findOneAsync(
        {
          googleAccountId,
          hunts: document.hunt,
        },
        { sort: { createdAt: 1 } },
      );

      Logger.info("Recording document activity", {
        documentId: document._id,
        puzzleId: document.puzzle,
        googleAccountId: `${googleAccountId.substring(0, 10)}...`,
        userId: user?._id || "UNLINKED",
      });

      await ignoringDuplicateKeyErrors(async () => {
        await DocumentActivities.insertAsync({
          ts: time,
          document: document._id,
          hunt: document.hunt,
          puzzle: document.puzzle,
          user: user?._id,
        });
      });
    }
  }
}

async function fetchDriveActivity() {
  const { driveactivity } = GoogleClient;
  if (!driveactivity) {
    if (!loggedMissingApiWarning) {
      Logger.warn(
        "Google Drive Activity API not configured - document activity tracking is disabled. " +
          "Configure Google Drive credentials via the Setup page to enable document activity tracking.",
      );
      loggedMissingApiWarning = true;
    }
    return;
  }

  const root = await Settings.findOneAsync({ name: "gdrive.root" });
  const credential = await Settings.findOneAsync({ name: "gdrive.credential" });

  if (!credential) {
    if (!loggedMissingCredentialsWarning) {
      Logger.warn(
        "Google Drive credentials (gdrive.credential) not configured - document activity tracking is disabled. " +
          "Use the Setup page to configure Google Drive integration.",
      );
      loggedMissingCredentialsWarning = true;
    }
    return;
  }

  // Reset warning flags if we successfully have credentials
  loggedMissingApiWarning = false;
  loggedMissingCredentialsWarning = false;

  // Don't fetch history that's older than what we'd display
  const previousTimestamp = Math.max(
    (await DriveActivityLatests.findOneAsync("default"))?.ts.getTime() ?? 0,
    Date.now() - ACTIVITY_GRANULARITY * ACTIVITY_SEGMENTS,
  );

  // Build in some buffer by starting 5 minutes before the latest timestamp
  // we've previously seen (our unique constraints will dedup any overlap)
  const filter = `time > ${previousTimestamp - 5 * 60 * 1000}`;

  const now = Date.now();
  const timeSinceLastFetch = now - previousTimestamp;
  Logger.info("Fetching Drive activity", {
    previousTimestamp: new Date(previousTimestamp),
    timeSinceLastFetch: `${Math.round(timeSinceLastFetch / 1000)}s ago`,
    filter,
    rootFolder: root?.value.id,
    currentTime: new Date(now),
  });

  let pageToken: string | undefined;
  let latestTimestamp = previousTimestamp;
  let activityCount = 0;
  do {
    const resp = await driveactivity.activity.query({
      requestBody: {
        pageToken,
        filter,
        ancestorName: root?.value.id ? `items/${root.value.id}` : undefined,
      },
    });
    pageToken = resp.data.nextPageToken ?? undefined;

    Logger.info("Drive API query response", {
      hasActivities: !!resp.data.activities,
      activityCount: resp.data.activities?.length || 0,
      hasNextPage: !!pageToken,
    });

    if (resp.data.activities) {
      activityCount += resp.data.activities.length;
      Logger.info("Found Drive activities", {
        count: resp.data.activities.length,
        totalSoFar: activityCount,
      });
      // Accumulate a promise that resolves to the latest timestamp we've seen
      for (const activity of resp.data.activities) {
        // See if this is a document edit action
        if (!activity.actions?.some((action) => action.detail?.edit)) {
          Logger.verbose("Skipping non-edit activity", {
            actions: activity.actions?.map((a) => Object.keys(a.detail || {})),
          });
          continue;
        }

        if (!activity.timestamp || !activity.targets || !activity.actors) {
          Logger.warn("Activity missing required fields", {
            hasTimestamp: !!activity.timestamp,
            hasTargets: !!activity.targets,
            hasActors: !!activity.actors,
          });
          continue;
        }

        const ts = new Date(activity.timestamp);

        // Debug: Log raw actor information
        for (const actor of activity.actors) {
          Logger.info("Actor details", {
            hasUser: !!actor.user,
            hasAdministrator: !!actor.administrator,
            hasAnonymous: !!actor.anonymous,
            hasKnownUser: !!actor.user?.knownUser,
            personName: actor.user?.knownUser?.personName || "NONE",
            isCurrentUser: actor.user?.knownUser?.isCurrentUser,
          });
        }

        // In testing, it seems like an activity generally only has one target
        // and one actor, but we handle receiving more than one of both just in
        // case.
        const documentIds = [
          ...activity.targets.reduce<Set<string>>((acc, target) => {
            if (target.driveItem?.name?.startsWith("items/")) {
              acc.add(target.driveItem.name.substring("items/".length));
            }

            return acc;
          }, new Set()),
        ];

        const actorIds = [
          ...activity.actors.reduce<Set<string>>((acc, actor) => {
            if (actor.user?.knownUser?.personName?.startsWith("people/")) {
              const actorId = actor.user.knownUser.personName.substring(
                "people/".length,
              );
              // Exclude edits made by the server drive user, since these aren't actual user edits.
              if (!credential?.value?.id || credential?.value?.id !== actorId) {
                acc.add(actorId);
                Logger.info("Found valid actor", {
                  actorId: actorId.substring(0, 10) + "...",
                });
              } else {
                Logger.info("Skipping service account actor", {
                  actorId: actorId.substring(0, 10) + "...",
                });
              }
            } else {
              Logger.warn("Actor without personName", {
                hasUser: !!actor.user,
                hasKnownUser: !!actor.user?.knownUser,
                hasPersonName: !!actor.user?.knownUser?.personName,
              });
            }

            return acc;
          }, new Set()),
        ];

        await recordDriveChanges(ts, documentIds, actorIds);

        latestTimestamp = Math.max(latestTimestamp, ts.getTime());
      }
    }

    pageToken = resp.data.nextPageToken ?? undefined;
  } while (pageToken);

  await DriveActivityLatests.upsertAsync("default", {
    $set: {
      ts: new Date(latestTimestamp),
    },
  });
}

const FEATURE_FLAG_NAME = "disable.gdrive_document_activity";

// Track whether we've already logged configuration warnings to avoid spam
let loggedMissingApiWarning = false;
let loggedMissingCredentialsWarning = false;

async function featureFlagChanged() {
  return new Promise<void>((resolve, reject) => {
    let handleThunk: Meteor.LiveQueryHandle | undefined;
    const callback = () => {
      if (handleThunk) {
        handleThunk?.stop();
        handleThunk = undefined;
        resolve();
      }
    };
    Flags.observeChangesAsync(FEATURE_FLAG_NAME, callback)
      .then((handle) => {
        handleThunk = handle;
      })
      .catch(reject);
  });
}

async function fetchActivityLoop() {
  let consecutiveErrors = 0;
  const MAX_BACKOFF_MS = 60 * 1000; // Max 1 minute backoff

  while (true) {
    try {
      // Loop until the feature flag is disabled (i.e. the disabler is not
      // disabled)
      while (true) {
        if (!(await Flags.activeAsync(FEATURE_FLAG_NAME))) {
          break;
        }
        await featureFlagChanged();
      }

      await withLock("drive-activity", async (renew) => {
        Logger.info("Acquired drive-activity lock, starting fetch loop");
        // Ensure that we continue to hold the lock as long as we're alive.
        using stack = new DisposableStack();
        const renewalFailure = new Promise<boolean>((r) => {
          stack.use(
            setInterval(() => {
              renew().catch((error) => {
                // We failed to renew the lock
                Logger.warn("Failed to renew drive-activity lock", { error });
                r(true);
              });
            }, PREEMPT_TIMEOUT / 2),
          );
        });

        // As long as we are alive and the feature flag is not active, hold the
        // lock and keep looping
        while (true) {
          if (await Flags.activeAsync(FEATURE_FLAG_NAME)) {
            Logger.info("Feature flag became active, exiting fetch loop");
            return; // from withLock
          }

          await fetchDriveActivity();

          // Reset error counter on successful fetch
          consecutiveErrors = 0;

          // PERFORMANCE: Increased from 5s to 15s polling interval to reduce API load
          // Wake up every 15 seconds (+/- 5 seconds of jitter)
          // This is still responsive enough for real-time activity tracking
          const sleep = await setTimeout(
            10 * 1000 + Math.random() * 10 * 1000,
          ).then(() => false);
          const renewalFailed = await Promise.race([sleep, renewalFailure]);
          if (renewalFailed) {
            Logger.warn("Lock renewal failed, exiting fetch loop");
            return; // from withLock
          }
        }
      });
      Logger.info("Exited withLock, will try to re-acquire");
    } catch (error) {
      consecutiveErrors++;
      // Exponential backoff: 5s, 10s, 20s, 40s, up to MAX_BACKOFF_MS
      const backoffMs = Math.min(
        5000 * 2 ** (consecutiveErrors - 1),
        MAX_BACKOFF_MS,
      );
      Logger.error("Error fetching drive activity", {
        error,
        consecutiveErrors,
        backoffMs,
      });
      await setTimeout(backoffMs);
    }
  }
}

Meteor.startup(() => {
  if (Meteor.isTest || Meteor.isAppTest) {
    // We'll need to reevaluate this if we want to write tests for this code,
    // but this will do for now
    return;
  }

  // The entire body of fetchActivityLoop is a while loop wrapping a try-catch,
  // so voiding this promise is safe.
  void fetchActivityLoop();
});
