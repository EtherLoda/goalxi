// Namespace import, not a default import: this package compiles without
// `esModuleInterop` and argon2 is CommonJS with no `.default`, so `import
// argon2 from 'argon2'` resolves to `undefined` at runtime.
import * as argon2 from "argon2";

/**
 * Hash a plaintext password with argon2id.
 *
 * The underlying argon2 native binding can throw on:
 *   - OOM during hashing (the engine tries to allocate the
 *     configured memory cost)
 *   - malformed `password` argument (caller bug)
 *   - corrupted native binding (very rare; usually a system-level
 *     library issue)
 *
 * We do not use a logger here on purpose: this util is imported
 * at boot by `PlayerEntity`/`UserEntity` hooks, and by the api's auth
 * service, where the pino logger is not guaranteed to be wired. We
 * re-throw a stable message and let the caller's exception filter log it.
 *
 * ## Why this file used to be duplicated
 *
 * There were two copies. The `libs/database` one did
 * `console.error(err)` before both throwing and returning, and it is the
 * one wired into `UserEntity`'s `@BeforeUpdate` hook. On a failed login
 * that meant every wrong password wrote the full argon2 error object to
 * stdout — unbounded log volume on exactly the path an attacker drives,
 * plus system paths and allocation detail in the output.
 *
 * `auth.service` and `user.service` imported the *other* copy, so the
 * same row mutated over HTTP behaved differently from the same row
 * mutated through a TypeORM hook. There is now one implementation.
 */
export const hashPassword = async (password: string): Promise<string> => {
  try {
    return await argon2.hash(password);
  } catch (err) {
    // Re-throw with a stable message so callers cannot branch on
    // argon2's own wording, and attach the original error as `cause`.
    //
    // Assigned rather than passed as `new Error(msg, { cause })`: this
    // package compiles to ES2021, where that option bag is not in the
    // type definitions. Bumping the target to ES2022 would also flip
    // `useDefineForClassFields` for every consumer of this library,
    // which is not a behaviour-neutral change to make for a type
    // convenience.
    //
    // Note: nothing currently reads `.cause` — the api's global
    // exception filter does not — so the argon2 detail is preserved
    // for a future logger, not surfaced today.
    const error = new Error("Can not hash password.") as Error & {
      cause?: unknown;
    };
    error.cause = err;
    throw error;
  }
};

/**
 * Verify a plaintext password against an argon2 hash.
 *
 * Returns `false` for a wrong password AND for any error — including a
 * corrupted hash column. The boolean is the entire contract: the caller
 * must not be able to distinguish "no such user" from "wrong password",
 * and nothing here logs the hash or the plaintext.
 */
export const verifyPassword = async (
  password: string,
  hashedPassword: string,
): Promise<boolean> => {
  try {
    return await argon2.verify(hashedPassword, password);
  } catch {
    return false;
  }
};
