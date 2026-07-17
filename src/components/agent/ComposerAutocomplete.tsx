import { useEffect, useRef } from "react";
import type { CompletionItem } from "../../agent/composer/completion";

export default function ComposerAutocomplete({
  items,
  selectedIndex,
  onSelect,
  onHover,
}: {
  items: CompletionItem[];
  selectedIndex: number;
  onSelect: (item: CompletionItem) => void;
  onHover: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = listRef.current;
    if (!root || items.length === 0) return;
    const active = root.querySelector<HTMLElement>(
      `[data-completion-index="${selectedIndex}"]`,
    );
    if (!active) return;
    // Scroll only within the listbox — avoid scrollIntoView scrolling ancestors.
    const itemTop = active.offsetTop;
    const itemBottom = itemTop + active.offsetHeight;
    const viewTop = root.scrollTop;
    const viewBottom = viewTop + root.clientHeight;
    if (itemTop < viewTop) {
      root.scrollTop = itemTop;
    } else if (itemBottom > viewBottom) {
      root.scrollTop = itemBottom - root.clientHeight;
    }
  }, [items.length, selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="agent-autocomplete"
      id="agent-composer-completions"
      role="listbox"
      aria-label="Completions"
    >
      {items.map((item, index) => (
        <button
          key={`${item.kind}-${item.label}-${index}`}
          aria-selected={index === selectedIndex}
          data-completion-index={index}
          id={`agent-completion-${index}`}
          className={`agent-autocomplete-item ${
            index === selectedIndex ? "active" : ""
          }`}
          onClick={() => onSelect(item)}
          onMouseEnter={() => onHover(index)}
          role="option"
          type="button"
        >
          <span className="agent-autocomplete-label">{item.label}</span>
          {item.description && (
            <span className="agent-autocomplete-desc">{item.description}</span>
          )}
        </button>
      ))}
    </div>
  );
}
