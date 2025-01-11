import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configService } from './config/config.service';

async function bootstrap() {
  const connectionStatus = await configService.checkDatabaseConnection();

  if (!connectionStatus) {
    throw new Error('Unable to connect to the database');
  }

  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(3000);
}
bootstrap();
