import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

interface ComposerInputProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}

const MAX_LINES = 7;

const ComposerInput = forwardRef<HTMLTextAreaElement, ComposerInputProps>(
  ({ value, className, ...rest }, ref) => {
    const innerRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement, []);

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      const style = window.getComputedStyle(el);
      const lineHeight = parseFloat(style.lineHeight) || 18;
      const paddingY =
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const borderY =
        parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const maxHeight = lineHeight * MAX_LINES + paddingY + borderY;
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [value]);

    return (
      <textarea
        ref={innerRef}
        value={value}
        className={["composer-input", className].filter(Boolean).join(" ")}
        rows={1}
        {...rest}
      />
    );
  },
);

ComposerInput.displayName = "ComposerInput";

export default ComposerInput;
