import { Module, ValidationPipe } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ArticlesModule } from './articles/articles.module';
import { RssParserModule } from './rss-parser/rss-parser.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { QueueProcessorModule } from './queue-processor/queue-processor.module';
import { configService } from './config/config.service';
import { APP_PIPE } from '@nestjs/core';
import { SequentialProcessorModule } from './sequencial-processor/sequential-processor.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(configService.getTypeOrmConfig()),
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
      defaultJobOptions: { attempts: 3 },
    }),
    BullModule.registerQueue({ name: 'articles' }),
    QueueProcessorModule,
    SequentialProcessorModule,
    ArticlesModule,
    RssParserModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule {}
