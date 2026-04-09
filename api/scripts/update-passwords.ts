import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';
import * as argon2 from 'argon2';

async function main() {
  await AppDataSource.initialize();
  console.log('Connected to DB');

  const hash1 = await argon2.hash('123123');
  await AppDataSource.query(
    'UPDATE "user" SET password = $1, updated_at = NOW() WHERE email = $2',
    [hash1, 'testuser1@goalxi.com']
  );
  console.log('Updated testuser1');

  const hash2 = await argon2.hash('123123');
  await AppDataSource.query(
    'UPDATE "user" SET password = $1, updated_at = NOW() WHERE email = $2',
    [hash2, 'testuser2@goalxi.com']
  );
  console.log('Updated testuser2');

  await AppDataSource.destroy();
  console.log('Done');
}

main().catch(console.error);
