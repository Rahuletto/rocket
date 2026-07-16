import { lazy, Suspense } from "react";
import { X } from "lucide-react";
import { useReview } from "../../provider/ReviewContext";

const PatchDiff = lazy(() =>
  import("@pierre/diffs/react").then((module) => ({
    default: module.PatchDiff,
  })),
);

export default function ReviewSurface() {
  const { closeReview, review } = useReview();
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
        <Suspense fallback={<div className="review-loading">Rendering diff</div>}>
          {review.files.map((file) => (
            <PatchDiff
              className="review-diff"
              disableWorkerPool
              key={file.path}
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
          ))}
        </Suspense>
      </div>
    </section>
  );
}
