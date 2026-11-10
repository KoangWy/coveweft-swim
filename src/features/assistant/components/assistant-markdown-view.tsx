import { Fragment, type ReactNode } from "react";

import { parseMarkdown, type Inline } from "./assistant-markdown";

function renderInline(nodes: Inline[], keyPrefix = ""): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}${index}`;
    switch (node.type) {
      case "text":
        return node.text;
      case "strong":
        return (
          <strong key={key} className="font-semibold">
            {renderInline(node.children, `${key}-`)}
          </strong>
        );
      case "em":
        return <em key={key}>{renderInline(node.children, `${key}-`)}</em>;
      case "code":
        return (
          <code key={key} className="rounded-sm bg-white/70 px-1 py-px text-[0.92em]">
            {node.text}
          </code>
        );
      case "link": {
        const external = !node.href.startsWith("/");
        return (
          <a
            key={key}
            href={node.href}
            className="rounded-sm font-semibold underline underline-offset-2 hover:no-underline"
            {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
          >
            {renderInline(node.children, `${key}-`)}
          </a>
        );
      }
    }
  });
}

/** Assistant answer rendered from the Markdown subset, as React elements only. */
export function AssistantMarkdownView({ text }: { text: string }) {
  const blocks = parseMarkdown(text);

  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return (
              <p key={index} className="font-semibold">
                {renderInline(block.children)}
              </p>
            );
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List
                key={index}
                className={
                  block.ordered
                    ? "flex list-decimal flex-col gap-1 pl-5 marker:text-neutral-600"
                    : "flex list-disc flex-col gap-1 pl-5 marker:text-neutral-500"
                }
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item)}</li>
                ))}
              </List>
            );
          }
          case "table":
            return (
              <div key={index} className="-mx-1 overflow-x-auto">
                <table className="w-full border-collapse text-left text-caption">
                  <thead>
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th
                          key={cellIndex}
                          scope="col"
                          className="border-b border-neutral-300 px-1.5 py-1 font-semibold"
                        >
                          {renderInline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="border-b border-neutral-200 px-1.5 py-1">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "paragraph":
            return (
              <p key={index}>
                {block.lines.map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 ? <br /> : null}
                    {renderInline(line)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
