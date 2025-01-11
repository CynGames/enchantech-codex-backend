import { Controller, Post } from '@nestjs/common';
import { RssParserService } from './rss-parser.service';

@Controller('rss')
export class RssParserController {
  constructor(private readonly rssParserService: RssParserService) {}

  @Post('parse')
  parseRssData() {
    return this.rssParserService.parseRssData();
  }

  @Post('fetch')
  downloadOPMLFile() {
    return this.rssParserService.fetchOPMLData();
  }
}
