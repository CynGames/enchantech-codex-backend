import { Module } from '@nestjs/common';
import { RssParserService } from './rss-parser.service';
import { RssParserController } from './rss-parser.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Publisher } from './entities/publisher.entity';
import { Article } from '../articles/entities/article.entity';
import { SequentialProcessorModule } from '../sequencial-processor/sequential-processor.module';
import { ArticleProcessorModule } from '../article-processor/article.processor.module';

@Module({
  imports: [
    SequentialProcessorModule,
    ArticleProcessorModule,
    TypeOrmModule.forFeature([Article, Publisher]),
  ],
  controllers: [RssParserController],
  providers: [RssParserService],
  exports: [RssParserModule],
})
export class RssParserModule {}
