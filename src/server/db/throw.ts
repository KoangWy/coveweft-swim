import { ServiceError } from "@/server/result";

import { mapDatabaseError } from "./errors";

type DatabaseErrorLike = { code: string; message: string; details: string } | null;

/** Maps a PostgREST error to the shared code and raises it as a service error. */
export function throwDatabaseError(error: DatabaseErrorLike): never {
  const mapped = mapDatabaseError(error);
  throw new ServiceError(mapped.code, mapped.details);
}
