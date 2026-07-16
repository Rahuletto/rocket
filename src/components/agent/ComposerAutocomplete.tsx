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
  if (items.length === 0) return null;

  return (
    <div
      className="agent-autocomplete"
      id="agent-composer-completions"
      role="listbox"
      aria-label="Completions"
    >
      {items.map((item, index) => (
        <button
          key={`${item.kind}-${item.label}-${index}`}
          aria-selected={index === selectedIndex}
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
