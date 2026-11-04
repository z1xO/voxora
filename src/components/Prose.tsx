import { Fragment } from "react";

/** Renders the small subset of markdown used in problem prompts: paragraphs, `code`, and **bold**. */
export function Prose({ text }: { text: string }) {
  return (
    <div className="prompt-md">
      {text.split(/\n\n+/).map((para, i) => (
        <p key={i}>
          {para.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("`") ? (
              <code key={j}>{part.slice(1, -1)}</code>
            ) : part.startsWith("**") ? (
              <strong key={j}>{part.slice(2, -2)}</strong>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
        </p>
      ))}
    </div>
  );
}
