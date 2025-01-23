import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article } from '../articles/entities/article.entity';
import { ArticleWorker } from './article.worker';
import { ArticleProcessorController } from './article.processor.controller';
import { Publisher } from '../rss-parser/entities/publisher.entity';
import { SequentialProcessorModule } from '../sequencial-processor/sequential-processor.module';
import { BullModule } from '@nestjs/bullmq';
import { RssParserService } from '../rss-parser/rss-parser.service';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
      },
    }),
    BullModule.registerQueue({
      name: 'articles',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 1000,
        },
      },
    }),
    TypeOrmModule.forFeature([Article, Publisher]),
    SequentialProcessorModule,
  ],
  controllers: [ArticleProcessorController],
  providers: [ArticleWorker, RssParserService],
  exports: [ArticleWorker],
})
export class ArticleProcessorModule {}
