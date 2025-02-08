import { Controller, Post } from '@nestjs/common';
import { ProcessorService } from './processor.service';
import { PublisherParserService } from './publisher-parser.service';

@Controller('process')
export class ProcessorController {
  constructor(
    private readonly processorService: ProcessorService,
    private readonly publisherParserService: PublisherParserService,
  ) {}

  // This will fetch the OPML and get all publishers from it.
  @Post('opml')
  async processOPMLData() {
    await this.publisherParserService.processOPMLData();
  }

  // This will delete all unavailable or unreachable publishers.
  @Post('publishers')
  async processPublishers() {
    await this.publisherParserService.cleanPublishers();
  }

  // This will process and load each rss article into the database.
  @Post('articles')
  async processArticleData() {
    await this.processorService.flushRedis();
    await this.processorService.processRssData();
  }

  @Post('flush')
  async flushRedis() {
    await this.processorService.flushRedis();
  }

  // For AWS
  @Post('update')
  async fetchAndProcess() {
    await this.publisherParserService.processOPMLData();
    await this.publisherParserService.cleanPublishers();
    await this.processorService.processRssData();
  }
}
