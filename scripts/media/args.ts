export interface ParsedCliArgs {
  options: Map<string, string | true>;
  positionals: string[];
}

/**
 * Parse `--name value`, `--name=value`, and boolean flags. A boolean flag never
 * consumes the next argument, so `--no-archive --limit 3` keeps the limit.
 */
export function parseCliArgs(argv: string[], booleanFlags: Iterable<string> = []): ParsedCliArgs {
  const booleans = new Set(booleanFlags);
  const options = new Map<string, string | true>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (!argument.startsWith("--") || argument === "--") {
      positionals.push(argument);
      continue;
    }

    const body = argument.slice(2);
    const equals = body.indexOf("=");
    if (equals !== -1) {
      const name = body.slice(0, equals);
      options.set(name, body.slice(equals + 1));
      continue;
    }

    if (booleans.has(body)) {
      options.set(body, true);
      continue;
    }

    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options.set(body, next);
      index += 1;
    } else {
      options.set(body, true);
    }
  }

  return { options, positionals };
}

export function requireStringOption(args: ParsedCliArgs, name: string): string {
  const value = args.options.get(name);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${name}`);
  }
  return value;
}

export function optionalStringOption(args: ParsedCliArgs, name: string): string | undefined {
  const value = args.options.get(name);
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Option --${name} needs a value`);
  }
  return value;
}

export function optionalIntegerOption(
  args: ParsedCliArgs,
  name: string,
  bounds: { min: number; max?: number } = { min: 1 },
): number | undefined {
  const value = optionalStringOption(args, name);
  if (value === undefined) {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`Option --${name} must be a whole number`);
  }
  const number = Number(value);
  if (number < bounds.min || (bounds.max !== undefined && number > bounds.max)) {
    const upper = bounds.max === undefined ? "" : ` and at most ${bounds.max}`;
    throw new Error(`Option --${name} must be at least ${bounds.min}${upper}`);
  }
  return number;
}

export function assertKnownOptions(args: ParsedCliArgs, allowed: Iterable<string>): void {
  const known = new Set(allowed);
  for (const name of args.options.keys()) {
    if (!known.has(name)) {
      throw new Error(`Unknown option --${name}`);
    }
  }
  if (args.positionals.length > 0) {
    throw new Error(`Unexpected argument: ${args.positionals[0]}`);
  }
}
