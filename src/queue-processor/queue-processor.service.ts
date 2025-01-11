import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue, Job } from 'bull';
import { Article } from '../articles/entities/article.entity';
import * as cheerio from 'cheerio';

interface ArticleBatchJob {
  articles: Array<{
    id: number;
    title: string;
    articleLink: string;
  }>;
  batchNumber: number;
  totalBatches: number;
}

@Injectable()
@Processor('article-processing')
export class QueueProcessorService {
  private readonly logger = new Logger(QueueProcessorService.name);
  private readonly BATCH_SIZE = 3;
  private readonly BATCH_DELAY = 5000; // 5 seconds delay between batches
  private isProcessing = false;

  constructor(
    @InjectQueue('article-processing') private readonly articleQueue: Queue,
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
  ) {}

  async addArticlesToQueue(articles: Article[]) {
    if (this.isProcessing) {
      this.logger.warn(
        'Queue processing already in progress. Skipping new batch.',
      );
      return;
    }

    try {
      this.isProcessing = true;
      this.logger.log(
        `Starting to queue ${articles.length} articles for processing`,
      );

      // Clear existing jobs to prevent memory buildup
      await this.articleQueue.empty();

      // Create batches of 3 articles
      const batches = this.createBatches(articles, this.BATCH_SIZE);
      const totalBatches = batches.length;

      this.logger.log(
        `Created ${totalBatches} batches. Beginning sequential queueing...`,
      );

      // Queue batches sequentially with delay
      for (let i = 0; i < batches.length; i++) {
        const batchJob: ArticleBatchJob = {
          articles: batches[i].map((article) => ({
            id: article.id,
            title: article.title,
            articleLink: article.articleLink,
          })),
          batchNumber: i + 1,
          totalBatches,
        };

        // Add batch to queue
        await this.articleQueue.add('process-batch', batchJob, {
          delay: i * this.BATCH_DELAY,
          removeOnComplete: true,
          attempts: 3,
        });

        this.logger.log(`Queued batch ${i + 1}/${totalBatches} for processing`);

        // Add delay between queueing batches
        if (i < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      this.logger.log(
        `Successfully queued ${totalBatches} batches for processing`,
      );
    } catch (error) {
      this.logger.error(`Failed to queue articles: ${error.message}`);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    return items.reduce((batches, item, index) => {
      const batchIndex = Math.floor(index / batchSize);
      if (!batches[batchIndex]) {
        batches[batchIndex] = [];
      }
      batches[batchIndex].push(item);
      return batches;
    }, [] as T[][]);
  }

  @Process({
    name: 'process-batch',
    concurrency: 1, // Process one batch at a time
  })
  async processBatch(job: Job<ArticleBatchJob>) {
    const { articles, batchNumber, totalBatches } = job.data;

    this.logger.log(
      `Processing batch ${batchNumber}/${totalBatches} with ${articles.length} articles`,
    );

    try {
      for (const article of articles) {
        await this.processArticle(article, batchNumber, totalBatches);
        // Add small delay between articles within batch
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      this.logger.log(`Completed batch ${batchNumber}/${totalBatches}`);

      // Wait for 5 seconds before next batch
      await new Promise((resolve) => setTimeout(resolve, this.BATCH_DELAY));

      return {
        batchNumber,
        processed: articles.length,
        success: true,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process batch ${batchNumber}: ${error.message}`,
      );
      throw error;
    }
  }

  private async processArticle(
    article: { id: number; title: string; articleLink: string },
    batchNumber: number,
    totalBatches: number,
  ) {
    this.logger.log(
      `[Batch ${batchNumber}/${totalBatches}] Processing article: ${article.title}`,
    );

    try {
      const response = await fetch(article.articleLink, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BlogBot/1.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch article: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Clean up memory by removing unnecessary elements
      $('script, style, iframe, img').remove();

      const content = $('article, .article, .post, .content, main')
        .first()
        .text()
        .trim();

      await this.articleRepository.update(article.id, {
        description: content.substring(0, 5000),
        parseAttempted: true,
      });

      // Clean up memory
      $.root().empty();

      this.logger.log(
        `[Batch ${batchNumber}/${totalBatches}] ✅ Successfully processed: ${article.title}`,
      );

      return { success: true, articleId: article.id };
    } catch (error) {
      this.logger.error(
        `[Batch ${batchNumber}/${totalBatches}] ❌ Failed to process ${article.title}: ${error.message}`,
      );

      await this.articleRepository.update(article.id, {
        parseAttempted: true,
        description: `Failed to process: ${error.message}`.substring(0, 5000),
      });

      throw error;
    }
  }
}
