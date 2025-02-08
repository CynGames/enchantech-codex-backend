import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article } from '../articles/entities/article.entity';
import { ArticleWorker } from './article.worker';
import { Publisher } from '../articles/entities/publisher.entity';
import { BullModule } from '@nestjs/bullmq';
import { PublisherParserService } from './publisher-parser.service';
import { ProcessorController } from './processor.controller';
import { ProcessorService } from './processor.service';

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
  ],
  controllers: [ProcessorController],
  providers: [ArticleWorker, PublisherParserService, ProcessorService],
})
export class ProcessorModule {}
