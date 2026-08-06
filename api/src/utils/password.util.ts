import argon2 from 'argon2';

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
 * by `libs/logger` and `auth.service` at boot, and the pino
 * logger isn't guaranteed to be wired when this fires. We
 * re-throw a stable error message and let the caller's
 * exception filter log it.
 */
export const hashPassword = async (password: string): Promise<string> => {
  try {
    return await argon2.hash(password);
  } catch (err) {
    // Re-throw with a stable shape; the original `err` is on
    // `cause` so the global exception filter surfaces the
    // argon2 detail in the 500 response without us needing a
    // logger here.
    throw new Error('Can not hash password.', { cause: err });
  }
};

export const verifyPassword = async (
  password: string,
  hashedPassword: string,
): Promise<boolean> => {
  try {
    return await argon2.verify(hashedPassword, password);
  } catch {
    // Verification failures are part of normal flow (wrong
    // password during login) — never log the hash or the
    // plaintext, and never expose the underlying error to the
    // caller. The boolean return is the entire contract.
    return false;
  }
};
