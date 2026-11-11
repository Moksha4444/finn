// Colours signed percentages (the only colour on a row): muted green/red on the number itself, never a background.
const NUM = /([+−-]\d+(?:\.\d+)?%)/;

export function Signed({ text }: { text: string }) {
  return (
    <>
      {text.split(NUM).map((part, i) =>
        i % 2 ? (
          <span key={i} className={part.startsWith("+") ? "text-gain" : "text-loss"}>{part}</span>
        ) : (
          part
        ),
      )}
    </>
  );
}
