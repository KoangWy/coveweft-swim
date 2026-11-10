import { Waves } from "@phosphor-icons/react/ssr";

/**
 * Lime band of short brand lines that slides sideways. The lines repeat
 * content found elsewhere on the page, so the band is hidden from assistive
 * technology. Hovering pauses it; reduced motion stops it.
 */
export function MarqueeBand({ items }: { items: string[] }) {
  return (
    <div
      aria-hidden
      className="overflow-hidden border-y border-lime-500 bg-lime-400 py-4 select-none"
    >
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0 items-center">
            {items.map((item) => (
              <li
                key={item}
                className="flex items-center gap-8 pr-8 text-heading font-display whitespace-nowrap text-navy-950 uppercase"
              >
                {item}
                <Waves size={28} weight="bold" />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
