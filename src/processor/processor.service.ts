import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PublisherParserService } from './publisher-parser.service';
import { createClient } from 'redis';

@Injectable()
export class ProcessorService {
  private readonly logger = new Logger(ProcessorService.name);
  private readonly CHUNK_SIZE = 1000;

  constructor(
    @InjectQueue('articles') private readonly articleQueue: Queue,
    private readonly rssParserService: PublisherParserService,
  ) {}

  async flushRedis() {
    const redisUrl = `redis://localhost:6379/0`;
    const redisClient = createClient({ url: redisUrl });

    try {
      await redisClient.connect();
      await redisClient.flushDb();

      this.logger.log('Redis flushed successfully');
    } catch (error) {
      this.logger.error(`Failed to flush Redis: ${error.message}`);
      throw new Error('Failed to flush Redis');
    } finally {
      await redisClient.disconnect();
    }
  }

  async processRssData() {
    try {
      this.logger.log('Starting RSS processing');
      const publishers = await this.rssParserService.getPublishers();

      if (!publishers || publishers.length === 0) {
        this.logger.warn('No publishers found');
        return { message: 'No publishers available for processing' };
      }

      this.logger.log(`Found ${publishers.length} publishers`);
      let totalJobsCreated = 0;

      for (const [index, publisher] of publishers.entries()) {
        try {
          this.logger.debug(
            `Processing publisher ${index + 1}/${publishers.length}: ${publisher.title}`,
          );

          const feed = await this.rssParserService.parseFeed(publisher.rssLink);
          if (!feed?.items) {
            this.logger.warn(`No items found in feed for ${publisher.title}`);
            continue;
          }

          const articles = feed.items.map((item) => ({
            title: item.title,
            articleLink: item.link,
            publisherId: publisher.id,
            publishedAt: this.cleanDate(item.pubDate),
            parseAttempted: false,
            description: this.cleanHtmlContent(
              item.contentSnippet ||
                item.content ||
                item.description ||
                item['content:encoded'] ||
                'No description data is available, please click the link to read more.',
            ),
            imageLink: this.extractImageLink(item),
          }));

          if (articles.length === 0) {
            this.logger.warn(`No articles found for ${publisher.title}`);
            continue;
          }

          const chunks = this.chunkArray(articles, this.CHUNK_SIZE);

          for (let i = 0; i < chunks.length; i++) {
            await this.articleQueue.add(
              'process',
              {
                articles: chunks[i],
                chunkNumber: i + 1,
                totalChunks: chunks.length,
                publisher: publisher.title,
              },
              {
                attempts: 3,
                backoff: {
                  type: 'fixed',
                  delay: 1000,
                },
                jobId: `${publisher.id}-chunk-${i + 1}`,
              },
            );
            totalJobsCreated++;
          }

          this.logger.log(
            `Created ${chunks.length} jobs for ${articles.length} articles from ${publisher.title}`,
          );
        } catch (publisherError) {
          this.logger.error(
            `Failed to process publisher ${publisher.title}: ${publisherError.message}`,
          );
        }
      }

      return {
        message: 'RSS data processing initiated',
        totalJobsCreated,
        queueStatus: await this.getQueueStatus(),
      };
    } catch (error) {
      this.logger.error(`Critical error in RSS processing: ${error.message}`);
      throw new Error('Failed to process RSS feeds');
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
      array.slice(i * size, i * size + size),
    );
  }

  private extractImageLink(item: any): string {
    if (item['media:content'] && item['media:content'].url) {
      return item['media:content'].url;
    }

    if (item.enclosure?.url) {
      return item.enclosure.url;
    }

    if (item.content) {
      const imageMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
      if (imageMatch) return imageMatch[1];
    }

    if (item['media:thumbnail'] && item['media:thumbnail'].url) {
      return item['media:thumbnail'].url;
    }

    return '';
  }

  private async getQueueStatus() {
    const jobs = await this.articleQueue.getJobs([
      'waiting',
      'active',
      'completed',
      'failed',
    ]);
    return {
      waiting: jobs.filter((job) => job.isWaiting()).length,
      active: jobs.filter((job) => job.isActive()).length,
      completed: jobs.filter((job) => job.isCompleted()).length,
      failed: jobs.filter((job) => job.isFailed()).length,
    };
  }

  private cleanHtmlContent(html: string): string {
    if (!html) return '';

    const sanitized = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

    const result = sanitized
      .replace(/<[^>]*>/g, ' ')
      .replace(/&#160;/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();

    return result
      ? result
      : 'No description data is available, please click the link to read more.';
  }

  // 2010-01-01 will be my default date for invalid dates. Any modern date will clog up the UI.
  private cleanDate(dateInput: any) {
    try {
      if (!dateInput) return new Date('2010-01-01');

      return new Date(dateInput);
    } catch {
      return new Date();
    }
  }
}
