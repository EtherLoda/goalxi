import { ConfigModule } from '@nestjs/config';
import { ApiModule } from '../api/api.module';
import { MailModule } from '../mail/mail.module';
import generateModulesSet from './modules-set';

describe('generateModulesSet', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return correct modules for monolith set', async () => {
    process.env.MODULES_SET = 'monolith';
    const modules = await generateModulesSet();
    expect(modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: ConfigModule,
        }), // ConfigModule
        ApiModule,
        expect.any(Object), // BullModule
        expect.any(Object), // BackgroundModule
        expect.any(Object), // TypeOrmModule
        expect.any(Object), // I18nModule
        expect.any(Object), // LoggerModule
        MailModule,
      ]),
    );
  });

  it('should return correct modules for default set', async () => {
    process.env.MODULES_SET = undefined;
    const modules = await generateModulesSet();
    expect(modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: ConfigModule,
        }), // ConfigModule
      ]),
    );
  });

  it('should return correct modules for api set', async () => {
    process.env.MODULES_SET = 'api';
    const modules = await generateModulesSet();
    expect(modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: ConfigModule,
        }), // ConfigModule
        ApiModule,
        expect.any(Object), // BullModule
        expect.any(Object), // BackgroundModule
        expect.any(Object), // TypeOrmModule
        expect.any(Object), // I18nModule
        expect.any(Object), // LoggerModule
        MailModule,
      ]),
    );
  });

  it('should return correct modules for background set', async () => {
    process.env.MODULES_SET = 'background';
    const modules = await generateModulesSet();
    expect(modules).toEqual(
      expect.arrayContaining([
        expect.any(Object), // BullModule
        expect.any(Object), // BackgroundModule
        expect.any(Object), // TypeOrmModule
        expect.any(Object), // I18nModule
        expect.any(Object), // LoggerModule
      ]),
    );
  });

  it('should handle unsupported modules set', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    process.env.MODULES_SET = 'unsupported';
    const modules = await generateModulesSet();
    expect(modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: ConfigModule,
        }), // ConfigModule
      ]),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Unsupported modules set: unsupported',
    );
    consoleErrorSpy.mockRestore();
  });
});