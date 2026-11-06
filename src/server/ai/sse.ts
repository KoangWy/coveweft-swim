/**
 * Reads a server-sent event stream and yields the `data:` payload of each
 * event. Multi-line data is joined with newlines, comments and other fields
 * are ignored, and the stream ends at `data: [DONE]`.
 */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  onChunk?: () => void,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      onChunk?.();
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.search(/\r\n|\r|\n/);

      // A trailing "\r" may be the first half of a "\r\n" split across reads.
      while (newline !== -1 && !(newline === buffer.length - 1 && buffer.endsWith("\r"))) {
        const line = buffer.slice(0, newline);
        const separatorLength = buffer.startsWith("\r\n", newline) ? 2 : 1;
        buffer = buffer.slice(newline + separatorLength);

        if (line === "") {
          if (data.length > 0) {
            const payload = data.join("\n");
            data = [];

            if (payload === "[DONE]") {
              return;
            }

            yield payload;
          }
        } else if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        }

        newline = buffer.search(/\r\n|\r|\n/);
      }
    }

    if (buffer.startsWith("data:")) {
      data.push(buffer.slice(5).replace(/^ /, ""));
    }

    const payload = data.join("\n");

    if (payload !== "" && payload !== "[DONE]") {
      yield payload;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
