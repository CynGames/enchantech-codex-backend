// import { Module, ValidationPipe } from '@nestjs/common';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';
// import { ArticlesModule } from './articles/articles.module';
// import { RssParserModule } from './rss-parser/rss-parser.module';
// import { TypeOrmModule } from '@nestjs/typeorm';
// import { configService } from './config/config.service';
// import { APP_PIPE } from '@nestjs/core';
// import { SequentialProcessorModule } from './sequencial-processor/sequential-processor.module';
// import { ArticleProcessorModule } from './article-processor/article.processor.module';

// src/app.module.ts
import { Module, ValidationPipe } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ArticlesModule } from './articles/articles.module';
import { RssParserModule } from './rss-parser/rss-parser.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { configService } from './config/config.service';
import { APP_PIPE } from '@nestjs/core';
import { SequentialProcessorModule } from './sequencial-processor/sequential-processor.module';
import { ArticleProcessorModule } from './article-processor/article.processor.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(configService.getTypeOrmConfig()),
    ArticleProcessorModule,
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
