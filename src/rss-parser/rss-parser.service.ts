import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Publisher } from './entities/publisher.entity';
import { Article } from '../articles/entities/article.entity';
import { QueueProcessorService } from '../queue-processor/queue-processor.service';
import { SequentialProcessorService } from '../sequencial-processor/sequential-processor.service';

import * as RSS from 'rss-parser';
import * as xml2js from 'xml2js';

const opmlFileURL =
  'https://raw.githubusercontent.com/kilimchoi/engineering-blogs/master/engineering_blogs.opml';

@Injectable()
export class RssParserService {
  private readonly logger = new Logger(RssParserService.name);
  private readonly parser: RSS;
  private readonly BATCH_SIZE = 2;

  constructor(
    @InjectRepository(Publisher)
    private readonly publisherRepository: Repository<Publisher>,
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
    private readonly queueProcessorService: QueueProcessorService,
    private readonly sequentialProcessorService: SequentialProcessorService,
  ) {
    this.parser = new RSS({
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
      timeout: 10000,
    });
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

  async fetchOPMLData() {
    const result = await this.downloadOPMLFile();

    if (typeof result === 'object' && 'error' in result) {
      return { error: result.error };
    }

    return await this.processOPMLContent(result as string);
  }

  // async parseRssData() {
  //   try {
  //     const publishers = await this.publisherRepository.find();
  //     this.logger.log(`Processing ${publishers.length} publishers`);
  //
  //     const limit = pLimit(5); // Process up to 5 publishers concurrently
  //     const results = await Promise.all(
  //       publishers.map((publisher) =>
  //         limit(() => this.processPublisher(publisher)),
  //       ),
  //     );
  //
  //     return results.filter((result) => result !== null);
  //   } catch (error) {
  //     this.logger.error(`Failed to process publishers: ${error.message}`);
  //     return { error: error.message };
  //   }
  // }

  // async parseRssData() {
  //   try {
  //     const publishers = await this.publisherRepository.find();
  //     this.logger.log(`Processing ${publishers.length} publishers`);
  //
  //     const publisherPromises = publishers.map((publisher) =>
  //       this.processPublisher(publisher).catch((error) => ({
  //         publisher: publisher.title,
  //         error: error.message,
  //       })),
  //     );
  //
  //     const results = await Promise.all(publisherPromises);
  //     return results.filter((result) => result !== null);
  //   } catch (error) {
  //     this.logger.error(`Failed to process publishers: ${error.message}`);
  //     return { error: error.message };
  //   }
  // }

  async parseRssData() {
    try {
      const publishers = await this.publisherRepository.find();
      this.logger.log(`Processing ${publishers.length} publishers`);

      const results: any[] = [];

      // Sequentially process publishers
      for (const publisher of publishers) {
        try {
          const result = await this.processPublisher(publisher);
          results.push(result);
        } catch (error) {
          this.logger.error(
            `Failed to process publisher ${publisher.title}: ${error.message}`,
          );
          results.push({
            publisher: publisher.title,
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      this.logger.error(`Failed to process publishers: ${error.message}`);
      return { error: error.message };
    }
  }

  private async processPublisher(publisher: Publisher) {
    try {
      const feed = await this.parser.parseURL(publisher.rssLink);
      const articles = await this.processArticles(feed, publisher);

      return {
        publisher: publisher.title,
        articlesProcessed: articles,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process publisher ${publisher.title}: ${error.message}`,
      );
      throw error;
    }
  }

  // private async processArticles(feed: RSS.Output<any>, publisher: Publisher) {
  //   try {
  //     const articleLinks = feed.items.map((item) => item.link);
  //     const existingArticles = await this.articleRepository.find({
  //       where: { articleLink: In(articleLinks) },
  //       select: ['articleLink'],
  //     });
  //
  //     const existingLinks = new Set(existingArticles.map((a) => a.articleLink));
  //
  //     const newArticles = feed.items
  //       .filter((item) => !existingLinks.has(item.link))
  //       .map((item) => ({
  //         title: this.cleanHtmlContent(item.title),
  //         description: this.cleanHtmlContent(
  //           item.contentSnippet || item.content || '',
  //         ),
  //         articleLink: item.link,
  //         imageLink: this.extractImageLink(item),
  //         parseAttempted: false,
  //         publisherId: Number(publisher.id.toString()),
  //         publishedAt: new Date(item.pubDate),
  //       }));
  //
  //     if (newArticles.length > 0) {
  //       const chunks = this.chunkArray(newArticles, this.BATCH_SIZE);
  //       for (const chunk of chunks) {
  //         const savedArticles = await this.articleRepository.save(chunk);
  //         await this.queueProcessorService.addArticlesToQueue(savedArticles);
  //       }
  //     }
  //
  //     return newArticles.length;
  //   } catch (error) {
  //     this.logger.error(
  //       `Error processing articles for ${publisher.title}: ${error.message}`,
  //     );
  //     throw error;
  //   }
  // }

  // private async processArticles(feed: RSS.Output<any>, publisher: Publisher) {
  //   try {
  //     const articleLinks = feed.items.map((item) => item.link);
  //     const existingArticles = await this.articleRepository.find({
  //       where: { articleLink: In(articleLinks) },
  //       select: ['articleLink'],
  //     });
  //
  //     const existingLinks = new Set(existingArticles.map((a) => a.articleLink));
  //
  //     const newArticles = feed.items
  //       .filter((item) => !existingLinks.has(item.link))
  //       .map((item) => ({
  //         title: this.cleanHtmlContent(item.title),
  //         description: this.cleanHtmlContent(
  //           item.contentSnippet || item.content || '',
  //         ),
  //         articleLink: item.link,
  //         imageLink: this.extractImageLink(item),
  //         parseAttempted: false,
  //         publisherId: Number(publisher.id.toString()),
  //         publishedAt: new Date(item.pubDate),
  //       }));
  //
  //     if (newArticles.length > 0) {
  //       const savedArticles = await this.articleRepository.save(newArticles);
  //       const results =
  //         await this.sequentialProcessorService.processArticles(savedArticles);
  //       return results.totalProcessed;
  //     }
  //
  //     return 0;
  //   } catch (error) {
  //     this.logger.error(
  //       `Error processing articles for ${publisher.title}: ${error.message}`,
  //     );
  //     throw error;
  //   }
  // }

  private async processArticles(feed: RSS.Output<any>, publisher: Publisher) {
    try {
      const articleLinks = feed.items.map((item) => item.link);
      const existingArticles = await this.articleRepository.find({
        where: { articleLink: In(articleLinks) },
        select: ['articleLink'],
      });

      const existingLinks = new Set(existingArticles.map((a) => a.articleLink));

      const newArticles = feed.items
        .filter((item) => !existingLinks.has(item.link))
        .map((item) => ({
          title: this.cleanHtmlContent(item.title),
          description: this.cleanHtmlContent(
            item.contentSnippet || item.content || '',
          ),
          articleLink: item.link,
          imageLink: this.extractImageLink(item),
          parseAttempted: false,
          publisherId: Number(publisher.id.toString()),
          publishedAt: new Date(item.pubDate),
        }));

      if (newArticles.length > 0) {
        // Instead of saving all articles at once, pass them to the processor
        // which will save and process them in batches
        const results =
          await this.sequentialProcessorService.processNewArticles(newArticles);
        return results.totalProcessed;
      }

      return 0;
    } catch (error) {
      this.logger.error(
        `Error processing articles for ${publisher.title}: ${error.message}`,
      );
      throw error;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private extractImageLink(item: RSS.Item): string {
    if (item['media:content']) {
      return item['media:content'].url;
    }

    if (item.enclosure?.url) {
      return item.enclosure.url;
    }

    const imageMatch = item.content?.match(/<img[^>]+src="([^">]+)"/);
    return imageMatch ? imageMatch[1] : '';
  }

  private cleanHtmlContent(html: string): string {
    if (!html) return '';

    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }
}
