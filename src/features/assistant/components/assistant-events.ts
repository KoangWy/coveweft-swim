/** Window event that asks the shopping assistant widget to open its panel. */
export const ASSISTANT_OPEN_EVENT = "coveweft:assistant-open";

export function requestAssistantOpen(): void {
  window.dispatchEvent(new Event(ASSISTANT_OPEN_EVENT));
}
