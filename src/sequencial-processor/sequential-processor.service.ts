import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from '../articles/entities/article.entity';
import * as cheerio from 'cheerio';

@Injectable()
export class SequentialProcessorService {
  private readonly logger = new Logger(SequentialProcessorService.name);
  private readonly BATCH_SIZE = 50;
  private readonly BATCH_DELAY = 5000; // 5 seconds delay between batches
  private readonly TIMEOUT = 3000; // 3 seconds timeout
  private currentProcessing: Promise<any> | null = null;

  constructor(
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
  ) {}

  // async processNewArticles(articlesToProcess: Partial<Article>[]) {
  //   if (this.currentProcessing) {
  //     this.logger.log('Waiting for current processing to complete...');
  //     await this.currentProcessing;
  //   }
  //
  //   this.currentProcessing = this.executeProcessing(articlesToProcess);
  //
  //   try {
  //     return await this.currentProcessing;
  //   } finally {
  //     this.currentProcessing = null;
  //   }
  // }

  async processNewArticles(articlesToProcess: Partial<Article>[]) {
    // If already processing, queue up and wait for completion
    while (this.currentProcessing) {
      await this.currentProcessing;
    }

    // Lock current processing
    this.currentProcessing = this.executeProcessing(articlesToProcess);

    try {
      return await this.currentProcessing;
    } finally {
      // Clear the lock
      this.currentProcessing = null;
    }
  }

  private createBatches(items: Partial<Article>[]): Partial<Article>[][] {
    const batches: Partial<Article>[][] = [];
    for (let i = 0; i < items.length; i += this.BATCH_SIZE) {
      batches.push(items.slice(i, i + this.BATCH_SIZE));
    }
    return batches;
  }

  // private async executeProcessing(articlesToProcess: Partial<Article>[]) {
  //   this.logger.log(
  //     `Starting sequential processing of ${articlesToProcess.length} articles`,
  //   );
  //
  //   const batches = this.createBatches(articlesToProcess);
  //   const totalBatches = batches.length;
  //
  //   let processedCount = 0;
  //   let failedCount = 0;
  //   let skippedCount = 0;
  //
  //   for (let i = 0; i < batches.length; i++) {
  //     const batchNumber = i + 1;
  //     const batch = batches[i];
  //
  //     this.logger.log(
  //       `Starting batch ${batchNumber}/${totalBatches} with ${batch.length} articles`,
  //     );
  //
  //     // Save this batch to the database
  //     const savedArticles = await this.articleRepository.save(batch);
  //
  //     // Process the saved articles
  //     const results = await this.processBatch(
  //       savedArticles,
  //       batchNumber,
  //       totalBatches,
  //     );
  //     processedCount += results.processed;
  //     failedCount += results.failed;
  //     skippedCount += results.skipped;
  //
  //     // Only delay if there's another batch coming
  //     if (i < batches.length - 1) {
  //       await this.delay(this.BATCH_DELAY);
  //     }
  //   }
  //
  //   return {
  //     totalProcessed: processedCount,
  //     totalFailed: failedCount,
  //     totalSkipped: skippedCount,
  //     totalBatches,
  //   };
  // }

  private async executeProcessing(articlesToProcess: Partial<Article>[]) {
    this.logger.log(
      `Starting sequential processing of ${articlesToProcess.length} articles`,
    );

    const batches = this.createBatches(articlesToProcess);
    const totalBatches = batches.length;

    let processedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // Process each batch sequentially
    for (let i = 0; i < totalBatches; i++) {
      const batchNumber = i + 1;
      const batch = batches[i];

      this.logger.log(
        `Processing batch ${batchNumber}/${totalBatches} with ${batch.length} articles`,
      );

      try {
        // Save and process batch
        const savedArticles = await this.articleRepository.save(batch);
        const results = await this.processBatch(
          savedArticles,
          batchNumber,
          totalBatches,
        );
        processedCount += results.processed;
        failedCount += results.failed;
        skippedCount += results.skipped;
      } catch (error) {
        this.logger.error(
          `Error processing batch ${batchNumber}: ${error.message}`,
        );
      }

      // Add delay if more batches are pending
      // if (i < totalBatches - 1) {
      //   await this.delay(this.BATCH_DELAY);
      // }
    }

    return {
      totalProcessed: processedCount,
      totalFailed: failedCount,
      totalSkipped: skippedCount,
    };
  }

  private async processBatch(
    articles: Article[],
    batchNumber: number,
    totalBatches: number,
  ): Promise<{ processed: number; failed: number; skipped: number }> {
    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const article of articles) {
      try {
        const success = await this.processArticleWithTimeout(
          article,
          batchNumber,
          totalBatches,
        );
        if (success) {
          processed++;
        } else {
          skipped++;
        }
      } catch (error) {
        failed++;
        this.logger.error(
          `[Batch ${batchNumber}/${totalBatches}] ❌ Failed to process ${article.title}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Completed batch ${batchNumber}/${totalBatches}: ` +
        `✅ ${processed} processed, ❌ ${failed} failed, ⏭️ ${skipped} skipped`,
    );

    return { processed, failed, skipped };
  }

  private async processArticleWithTimeout(
    article: Article,
    batchNumber: number,
    totalBatches: number,
  ): Promise<boolean> {
    this.logger.log(
      `[Batch ${batchNumber}/${totalBatches}] Processing article: ${article.title}`,
    );

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), this.TIMEOUT);
      });

      await Promise.race([
        this.processArticle(article, batchNumber, totalBatches),
        timeoutPromise,
      ]);

      return true;
    } catch (error) {
      if (error.message === 'Timeout') {
        this.logger.warn(
          `[Batch ${batchNumber}/${totalBatches}] ⏭️ Skipped ${article.title}: Timeout after ${this.TIMEOUT}ms`,
        );

        await this.articleRepository.update(article.id, {
          parseAttempted: true,
          description: `Skipped: Processing timeout after ${this.TIMEOUT}ms`,
        });

        return false;
      }
      throw error;
    }
  }

  private async processArticle(
    article: Article,
    batchNumber: number,
    totalBatches: number,
  ) {
    try {
      const controller = new AbortController();
      const signal = controller.signal;

      const response = await fetch(article.articleLink, {
        signal,
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
    } catch (error) {
      await this.articleRepository.update(article.id, {
        parseAttempted: true,
        description: `Failed to process: ${error.message}`.substring(0, 5000),
      });

      throw error;
    }
  }

  // private delay(ms: number): Promise<void> {
  // return new Promise((resolve) => setTimeout(resolve, ms));
  // }
}
