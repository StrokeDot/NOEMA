import { useId } from "react";

export type ReplyVisualData = {
  kind: "flow" | "timeline" | "comparison";
  title: string;
  items: { label: string; detail: string }[];
};

export default function ReplyVisual({ visual }: { visual: ReplyVisualData }) {
  const captionId = useId();
  const List = visual.kind === "comparison" ? "ul" : "ol";

  return (
    <figure className={`dialogue-visual dialogue-visual--${visual.kind}`} aria-labelledby={captionId}>
      <figcaption id={captionId}>{visual.title}</figcaption>
      <List role="list">
        {visual.items.map((item, index) => (
          <li key={index}>
            <strong>{item.label}</strong>
            {item.detail && <span>{item.detail}</span>}
          </li>
        ))}
      </List>
    </figure>
  );
}
