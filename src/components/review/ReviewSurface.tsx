import { lazy, Suspense } from "react";
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
  if (!review) return null;

  return (
    <section className="review-surface">
      <header className="review-header">
        <div>
          <span>{review.source === "agent" ? "Agent Review" : "Git Review"}</span>
          <strong>{review.title}</strong>
        </div>
        <button
          aria-label="Close review"
          onClick={closeReview}
          title="Close review"
          type="button"
        >
          <X size={15} />
        </button>
      </header>
      <div className="review-content">
        {review.source === "agent" && review.onKeep && (
          <div className="review-actions">
            <button onClick={() => void review.onKeep?.().then(closeReview)} type="button">Mark Owned Changes Reviewed</button>
          </div>
        )}
        <Suspense fallback={<div className="review-loading">Rendering diff</div>}>
          {review.files.map((file) => (
            <article className="review-file" key={file.path}>
              <div className="review-file-header">
                <button onClick={() => openFileByPath(file.path)} type="button">{file.path}</button>
                <span>{file.kind} +{file.additions ?? 0} −{file.deletions ?? 0}{file.conflict ? " · changed externally" : ""}</span>
                {review.onKeep && <button onClick={() => void review.onKeep?.(file.path).then(async () => updateFiles(await review.onRefresh?.() ?? []))} type="button">Mark Reviewed</button>}
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
