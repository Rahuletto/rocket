import { lazy, Suspense, useState } from "react";
import { X } from "lucide-react";
import { useReview } from "../../provider/ReviewContext";
import { useSource } from "../../provider/SourceContext";

const PatchDiff = lazy(() =>
  import("@pierre/diffs/react").then((module) => ({
    default: module.PatchDiff,
  })),
);

export default function ReviewSurface() {
  const { closeReview, review, updateFiles } = useReview();
  const { openFileByPath } = useSource();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!review) return null;
  const run = async (action: () => Promise<void>, close = false) => {
    const identity = review;
    setPending(true);
    setError("");
    try {
      await action();
      if (close) closeReview(identity);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="review-surface">
      <header className="review-header">
        <div>
          <span>{review.source === "agent" ? "Agent Review" : "Git Review"}</span>
          <strong>{review.title}</strong>
        </div>
        <button
          aria-label="Close review"
          onClick={() => closeReview(review)}
          title="Close review"
          type="button"
        >
          <X size={15} />
        </button>
      </header>
      <div className="review-content">
        {review.source === "agent" && review.onKeep && review.onRevert && (
          <div className="review-actions">
            <button disabled={pending} onClick={() => void run(() => review.onKeep!(), true)} type="button">Keep All</button>
            <button onClick={() => {
              const hasConflict = review.files.some((file) => file.conflict);
              const force = hasConflict && window.confirm("Some files changed outside the agent. Revert them anyway?");
              if (hasConflict && !force) return;
              void run(() => review.onRevert!(undefined, force), true);
            }} disabled={pending} type="button">Revert All</button>
            {error && <span role="alert">{error}</span>}
          </div>
        )}
        <Suspense fallback={<div className="review-loading">Rendering diff</div>}>
          {review.files.map((file) => (
            <article className="review-file" key={file.path}>
              <div className="review-file-header">
                <button onClick={() => openFileByPath(file.path)} type="button">{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</button>
                <span>{file.kind} +{file.additions ?? 0} −{file.deletions ?? 0}{file.conflict ? " · changed externally" : ""}</span>
                {review.source === "agent" && review.onKeep && <button disabled={pending} onClick={() => void run(async () => { await review.onKeep!(file.path); updateFiles(await review.onRefresh?.() ?? [], review); })} type="button">Keep File</button>}
                {review.source === "agent" && review.onRevert && <button onClick={() => {
                  const force = file.conflict && window.confirm("This file changed outside the agent. Revert it anyway?");
                  if (file.conflict && !force) return;
                  void run(async () => { await review.onRevert!(file.path, force); updateFiles(await review.onRefresh?.() ?? [], review); });
                }} disabled={pending} type="button">Revert File</button>}
              </div>
              <PatchDiff
              className="review-diff"
              disableWorkerPool
              options={{
                diffIndicators: "bars",
                diffStyle: "unified",
                hunkSeparators: "line-info",
                lineDiffType: "word-alt",
                overflow: "scroll",
                theme: {
                  dark: "github-dark-default",
                  light: "github-light-default",
                },
                themeType: "system",
              }}
              patch={file.patch}
              />
            </article>
          ))}
        </Suspense>
      </div>
    </section>
  );
}
