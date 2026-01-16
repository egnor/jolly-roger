import type { Meteor } from "meteor/meteor";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { createPortal } from "react-dom";
import styled from "styled-components";
import generateHuntSummary from "../../methods/generateHuntSummary";
import Markdown from "./Markdown";

const SummaryContent = styled.div`
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  padding: 1rem;
  background-color: #f8f9fa;
  border-radius: 4px;
  max-height: 400px;
  overflow-y: auto;

  /* Markdown styling */
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin-top: 1rem;
    margin-bottom: 0.5rem;
    font-weight: 600;
  }

  h1 {
    font-size: 1.5rem;
  }

  h2 {
    font-size: 1.3rem;
  }

  h3 {
    font-size: 1.1rem;
  }

  p {
    margin-bottom: 0.75rem;
  }

  ul,
  ol {
    margin-bottom: 0.75rem;
    padding-left: 1.5rem;
  }

  li {
    margin-bottom: 0.25rem;
  }

  strong {
    font-weight: 600;
  }

  em {
    font-style: italic;
  }

  code {
    background-color: #e9ecef;
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier,
      monospace;
    font-size: 0.875em;
  }

  pre {
    background-color: #e9ecef;
    padding: 0.5rem;
    border-radius: 4px;
    overflow-x: auto;
    margin-bottom: 0.75rem;
  }

  pre code {
    background-color: transparent;
    padding: 0;
  }

  blockquote {
    border-left: 4px solid #dee2e6;
    padding-left: 1rem;
    margin-left: 0;
    margin-bottom: 0.75rem;
    color: #6c757d;
  }

  a {
    color: #0d6efd;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 1rem;
`;

const CacheInfo = styled.div`
  font-size: 0.875rem;
  color: #6c757d;
  margin-top: 0.5rem;
  font-style: italic;
`;

const CountdownTimer = styled.span`
  font-weight: 600;
  color: #dc3545;
`;

export interface HuntSummaryModalHandle {
  show: () => void;
  hide: () => void;
}

enum LoadingState {
  IDLE = "idle",
  LOADING = "loading",
  SUCCESS = "success",
  ERROR = "error",
  RATE_LIMITED = "rate_limited",
}

const TIME_WINDOW_OPTIONS = [
  { value: 30, label: "Last 30 minutes" },
  { value: 60, label: "Last hour" },
  { value: 240, label: "Last 4 hours" },
  { value: -1, label: "Full hunt" },
];

function formatTimeAgo(date: Date, now: number = Date.now()): string {
  const seconds = Math.floor((now - date.getTime()) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const HuntSummaryModal = React.forwardRef(
  (
    { huntId }: { huntId: string },
    forwardedRef: React.Ref<HuntSummaryModalHandle>
  ) => {
    const [isShown, setIsShown] = useState(false);
    const [loadingState, setLoadingState] = useState<LoadingState>(
      LoadingState.IDLE
    );
    const [summary, setSummary] = useState<string>("");
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [timeWindowMinutes, setTimeWindowMinutes] = useState<number>(60);
    const [rateLimitSeconds, setRateLimitSeconds] = useState<number>(0);
    const [lastGeneratedAt, setLastGeneratedAt] = useState<Date | null>(null);
    const [currentTime, setCurrentTime] = useState<number>(Date.now());

    // Countdown timer for rate limiting
    useEffect(() => {
      if (rateLimitSeconds <= 0) return;

      const timer = setInterval(() => {
        setRateLimitSeconds((prev) => {
          if (prev <= 1) {
            // When countdown expires, transition to SUCCESS if we have a summary, otherwise IDLE
            setLoadingState(summary ? LoadingState.SUCCESS : LoadingState.IDLE);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }, [rateLimitSeconds, summary]);

    // Update current time every 10 seconds to keep "X minutes ago" fresh
    useEffect(() => {
      const timer = setInterval(() => {
        setCurrentTime(Date.now());
      }, 10000); // Update every 10 seconds

      return () => clearInterval(timer);
    }, []);

    const show = useCallback(() => {
      setIsShown(true);
    }, []);

    const hide = useCallback(() => {
      setIsShown(false);
    }, []);

    useImperativeHandle(forwardedRef, () => ({
      show,
      hide,
    }));

    const generateSummaryInternal = useCallback(
      (timeWindow: number, force = false, forceRegenerate = false) => {
        // If already rate limited and not forcing, don't make another request
        if (
          !force &&
          loadingState === LoadingState.RATE_LIMITED &&
          timeWindow === timeWindowMinutes &&
          rateLimitSeconds > 0
        ) {
          return;
        }

        // Store the current summary so we can restore it if rate limited
        const previousSummary = summary;
        const previousGeneratedAt = lastGeneratedAt;

        setLoadingState(LoadingState.LOADING);
        setErrorMessage("");
        setRateLimitSeconds(0);

        generateHuntSummary
          .callPromise({ huntId, timeWindowMinutes: timeWindow, forceRegenerate })
          .then((result) => {
            setSummary(result.summary);
            setLastGeneratedAt(result.generatedAt);

            // Check if this cached summary is within the rate limit window (30 seconds)
            const RATE_LIMIT_MS = 30 * 1000; // 30 seconds (for testing)
            const ageMs = Date.now() - result.generatedAt.getTime();

            if (ageMs < RATE_LIMIT_MS) {
              // Summary is fresh enough that regeneration would be rate limited
              const secondsRemaining = Math.ceil((RATE_LIMIT_MS - ageMs) / 1000);
              setRateLimitSeconds(secondsRemaining);
              setLoadingState(LoadingState.RATE_LIMITED);
            } else {
              // Summary is old enough that regeneration is allowed
              setLoadingState(LoadingState.SUCCESS);
            }
          })
          .catch((error: Meteor.Error) => {
            if (error.error === "rate-limit-exceeded") {
              // Extract retry seconds from error message
              const match = error.reason?.match(/(\d+) seconds/);
              const seconds = match?.[1] ? Number.parseInt(match[1], 10) : 0;
              setRateLimitSeconds(seconds);
              setLoadingState(LoadingState.RATE_LIMITED);
              setErrorMessage(error.reason || error.message);
              // Restore the previous summary when rate limited
              setSummary(previousSummary);
              setLastGeneratedAt(previousGeneratedAt);
            } else {
              setErrorMessage(error.reason || error.message || "Unknown error");
              setLoadingState(LoadingState.ERROR);
              // Clear summary on other errors
              setSummary("");
              setLastGeneratedAt(null);
            }
          });
      },
      [huntId, loadingState, timeWindowMinutes, rateLimitSeconds, summary, lastGeneratedAt]
    );

    // Auto-fetch cached summary when modal opens
    useEffect(() => {
      if (isShown && loadingState === LoadingState.IDLE && !summary) {
        generateSummaryInternal(timeWindowMinutes);
      }
    }, [isShown, loadingState, summary, timeWindowMinutes, generateSummaryInternal]);

    const handleTimeWindowChange = useCallback(
      (
        e: React.ChangeEvent<
          HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement
        >
      ) => {
        const value = Number.parseInt(e.target.value, 10);
        setTimeWindowMinutes(value);
        // Clear current summary and state, then try to load cached for new window
        setSummary("");
        setLastGeneratedAt(null);
        setLoadingState(LoadingState.IDLE);
        setErrorMessage("");
        setRateLimitSeconds(0);
        // Auto-fetch cached summary for the new time window
        generateSummaryInternal(value, true);
      },
      [generateSummaryInternal]
    );

    const handleGenerateClick = useCallback(() => {
      // When user clicks the button, force regeneration (bypass cache)
      generateSummaryInternal(timeWindowMinutes, false, true);
    }, [generateSummaryInternal, timeWindowMinutes]);

    const isGenerateDisabled = loadingState === LoadingState.LOADING;

    const modal = (
      <Modal show={isShown} onHide={hide} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Hunt Summary</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <FormGroup className="mb-3">
            <FormLabel>Time Window</FormLabel>
            <FormControl
              as="select"
              value={timeWindowMinutes}
              onChange={handleTimeWindowChange}
              disabled={loadingState === LoadingState.LOADING}
            >
              {TIME_WINDOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FormControl>
          </FormGroup>

          {loadingState === LoadingState.IDLE && !summary && (
            <Alert variant="info">
              Click "Generate Summary" to create an AI-powered summary of hunt
              activity for the selected time window.
            </Alert>
          )}

          {loadingState === LoadingState.LOADING && !summary && (
            <LoadingContainer>
              <Spinner animation="border" role="status" />
              <span>Generating summary...</span>
            </LoadingContainer>
          )}

          {loadingState === LoadingState.RATE_LIMITED && !summary && (
            <Alert variant="warning">
              <strong>Rate limit reached.</strong> You can generate a summary
              in{" "}
              <CountdownTimer>{formatCountdown(rateLimitSeconds)}</CountdownTimer>
              .
            </Alert>
          )}

          {loadingState === LoadingState.ERROR && (
            <Alert variant="danger">
              <strong>Error:</strong> {errorMessage}
            </Alert>
          )}

          {summary && (
            <>
              <SummaryContent>
                <Markdown text={summary} />
              </SummaryContent>
              {lastGeneratedAt && (
                <CacheInfo>
                  Generated {formatTimeAgo(lastGeneratedAt, currentTime)}
                  {loadingState === LoadingState.LOADING && (
                    <>
                      {" "}
                      <Spinner
                        animation="border"
                        size="sm"
                        role="status"
                        style={{ marginLeft: "0.5rem" }}
                      />
                    </>
                  )}
                </CacheInfo>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          {/* Show regenerate button or rate limit message */}
          {loadingState === LoadingState.RATE_LIMITED && summary ? (
            <span style={{ marginRight: "auto", color: "#6c757d" }}>
              Regeneration available in{" "}
              <CountdownTimer>{formatCountdown(rateLimitSeconds)}</CountdownTimer>
            </span>
          ) : (
            <Button
              variant="primary"
              onClick={handleGenerateClick}
              disabled={isGenerateDisabled}
            >
              {loadingState === LoadingState.LOADING
                ? "Generating..."
                : loadingState === LoadingState.RATE_LIMITED
                  ? `Wait ${formatCountdown(rateLimitSeconds)}`
                  : summary
                    ? "Regenerate"
                    : "Generate Summary"}
            </Button>
          )}
          <Button variant="secondary" onClick={hide}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    );

    return createPortal(modal, document.body);
  }
);

HuntSummaryModal.displayName = "HuntSummaryModal";

export default HuntSummaryModal;
