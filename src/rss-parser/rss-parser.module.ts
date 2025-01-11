import { Module } from '@nestjs/common';
import { RssParserService } from './rss-parser.service';
import { RssParserController } from './rss-parser.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Publisher } from './entities/publisher.entity';
import { Article } from '../articles/entities/article.entity';
import { QueueProcessorModule } from '../queue-processor/queue-processor.module';
import { SequentialProcessorModule } from '../sequencial-processor/sequential-processor.module';

@Module({
  imports: [
    SequentialProcessorModule,
    QueueProcessorModule,
    TypeOrmModule.forFeature([Article, Publisher]),
  ],
  controllers: [RssParserController],
  providers: [RssParserService],
})
export class RssParserModule {}
