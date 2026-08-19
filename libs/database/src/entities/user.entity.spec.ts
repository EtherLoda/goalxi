import { hashPassword } from '../utils/password.util';
import { UserEntity } from './user.entity';

jest.mock('../utils/password.util', () => ({
    hashPassword: jest.fn(async (s: string) => `hashed:${s}`),
}));

/**
 * Tripwire for the password-double-hash regression that locked
 * out every user the moment they touched PATCH /users/me
 * (e.g. switching the UI language, changing the timezone, or
 * an admin `updateUser` call). The fix is structural:
 * `@BeforeUpdate` was removed from `UserEntity.hashPassword`
 * because a loaded argon2 hash sitting in `this.password` would
 * be re-hashed on every UPDATE, producing
 * `argon2(argon2(plain))` and silently breaking the next login.
 *
 * Pinned behavior (see `user.entity.ts`):
 *   1. `@BeforeInsert` hashes a freshly-constructed entity's
 *      plaintext password — covers the register / create
 *      call sites.
 *   2. There is NO `@BeforeUpdate` hook. The entity passes
 *      `this.password` through as-is on UPDATE, so callers that
 *      need to rotate the password (changePassword,
 *      resetPassword) MUST pre-hash via
 *      `@/utils/password.util` before assigning.
 *   3. Empty / falsy password is a no-op (the hook never hashes
 *      `''` into a valid argon2 blob).
 */
describe('UserEntity.hashPassword', () => {
    const hashPasswordMock = hashPassword as jest.Mock;

    beforeEach(() => {
        hashPasswordMock.mockClear();
    });

    it('hashes the plaintext password on insert (register / create paths)', async () => {
        const user = new UserEntity();
        user.password = 'plain-from-caller';

        await user.hashPassword();

        expect(hashPasswordMock).toHaveBeenCalledWith('plain-from-caller');
        expect(user.password).toBe('hashed:plain-from-caller');
    });

    it('is a no-op when password is empty (defence against empty-string inserts)', async () => {
        const user = new UserEntity();
        user.password = '';

        await user.hashPassword();

        expect(hashPasswordMock).not.toHaveBeenCalled();
        expect(user.password).toBe('');
    });
});

/**
 * Source-level tripwire: the file MUST NOT carry a
 * `@BeforeUpdate` decorator on `hashPassword`. Re-adding it is
 * what reintroduced the regression; this test fails fast at CI
 * if someone re-introduces the duplicate hook.
 *
 * Reads the source file rather than the runtime decorators so
 * the tripwire also fires on a renamed/hoisted hook method.
 */
describe('UserEntity source — @BeforeUpdate on hashPassword (regression tripwire)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
        path.join(__dirname, 'user.entity.ts'),
        'utf8',
    );

    it('does not decorate hashPassword with @BeforeUpdate', () => {
        // Strip line breaks so `@BeforeUpdate` and `async hashPassword`
        // don't have to be on consecutive lines.
        const flattened = source.replace(/\s+/g, ' ');
        const updateHookPattern = /@BeforeUpdate\(\)[\s\S]{0,80}hashPassword/;
        expect(flattened).not.toMatch(updateHookPattern);
    });

    it('keeps @BeforeInsert on hashPassword (so register still hashes)', () => {
        const flattened = source.replace(/\s+/g, ' ');
        const insertHookPattern = /@BeforeInsert\(\)[\s\S]{0,80}hashPassword/;
        expect(flattened).toMatch(insertHookPattern);
    });
});
