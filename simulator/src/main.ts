import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('[Simulator] Match Simulator Service Started');
  console.log('[Simulator] Listening for simulation jobs on queue: match-simulation');
}
bootstrap();
