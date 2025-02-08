import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Publisher } from '../articles/entities/publisher.entity';
import { Article } from '../articles/entities/article.entity';

import * as RSS from 'rss-parser';
import * as xml2js from 'xml2js';

const opmlFileURL =
  'https://raw.githubusercontent.com/kilimchoi/engineering-blogs/master/engineering_blogs.opml';

@Injectable()
export class PublisherParserService {
  private readonly logger = new Logger(PublisherParserService.name);
  private readonly parser: RSS;
  private readonly BATCH_SIZE = 2;

  constructor(
    @InjectRepository(Publisher)
    private readonly publisherRepository: Repository<Publisher>,
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
  ) {
    this.parser = new RSS({
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
      timeout: 10000,
    });
  }

  async getPublishers(): Promise<Publisher[]> {
    return this.publisherRepository.find();
  }

  async parseFeed(rssLink: string): Promise<RSS.Output<any>> {
    try {
      const response = await fetch(rssLink);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const rawXML = await response.text();
      const cleanedXML = rawXML
        .toString()
        .replace(/^\uFEFF/, '')
        .replace(/^[\s]+/, '')
        .replace(/^[^<]*/, '');

      return this.parser.parseString(cleanedXML);
    } catch (error) {
      this.logger.error(`Failed to parse feed ${rssLink}: ${error.message}`);
      throw error;
    }
  }

  private extractOutlines(outlines: any[]): any[] {
    return outlines.filter(
      (outline) =>
        outline.type === 'rss' ||
        (outline.xmlUrl && (outline.title || outline.text)),
    );
  }

  async processOPMLContent(opmlContent: string): Promise<any> {
    try {
      const parser = new xml2js.Parser({
        explicitArray: false,
        mergeAttrs: true,
      });
      const result = await parser.parseStringPromise(opmlContent);
      const outlines = this.extractOutlines(result.opml.body.outline.outline);

      const publishers = outlines.map((outline) => {
        this.logger.debug(`Processing outline: ${JSON.stringify(outline)}`);

        const publisher = {
          title: outline.title,
          rssLink: outline.xmlUrl,
        };

        this.logger.debug(`Created publisher: ${JSON.stringify(publisher)}`);
        return publisher;
      });

      const validPublishers = publishers.filter(
        (p) =>
          p.title &&
          p.rssLink &&
          p.title.length <= 255 &&
          p.rssLink.length <= 255,
      );

      for (let i = 0; i < validPublishers.length; i += this.BATCH_SIZE) {
        const batch = validPublishers.slice(i, i + this.BATCH_SIZE);
        await this.publisherRepository.upsert(batch, ['title']);
      }

      return {
        processed: validPublishers.length,
      };
    } catch (e) {
      return {
        processed: 0,
        errors: [e.message],
      };
    }
  }

  async downloadOPMLFile() {
    try {
      return await (await fetch(opmlFileURL)).text();
    } catch (error) {
      this.logger.error(`Failed to download OPML file: ${error.message}`);
      return { error: error.message };
    }
  }

  async processOPMLData() {
    const result = await this.downloadOPMLFile();

    if (typeof result === 'object' && 'error' in result) {
      return { error: result.error };
    }

    return await this.processOPMLContent(result as string);
  }

  async cleanPublishers(): Promise<{ total: number; deleted: number }> {
    const publishers = await this.getPublishers();
    let deletedCount = 0;

    for (let i = 0; i < publishers.length; i += this.BATCH_SIZE) {
      const batch = publishers.slice(i, i + this.BATCH_SIZE);
      await Promise.all(
        batch.map(async (publisher) => {
          try {
            await this.parseFeed(publisher.rssLink);
            this.logger.debug(
              `Successfully reached publisher: ${publisher.title}`,
            );
          } catch (error) {
            await this.publisherRepository.delete(publisher.id);
            deletedCount++;
            this.logger.warn(
              `Deleted publisher ${publisher.title} (${publisher.rssLink}): ${error.message}`,
            );
          }
        }),
      );
    }

    this.logger.log(
      `Cleaned publishers. Total checked: ${publishers.length}, deleted: ${deletedCount}`,
    );
    return { total: publishers.length, deleted: deletedCount };
  }
}
