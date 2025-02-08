import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from '../articles/entities/article.entity';
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

interface ArticleBatchJob {
  articles: Array<{
    title: string;
    articleLink: string;
    publisherId: number;
    publishedAt: Date;
    parseAttempted: boolean;
  }>;
  batchNumber: number;
  totalBatches: number;
  publisher: string;
}

@Processor('articles', {
  concurrency: 5,
})
export class ArticleWorker extends WorkerHost {
  private readonly logger = new Logger(ArticleWorker.name);

  constructor(
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
  ) {
    super();
  }

  // This is called as an event from the queue (process.service.ts)
  async process(job: Job<ArticleBatchJob>): Promise<any> {
    try {
      this.logger.log(`Starting job ${job.id} for ${job.data.publisher}`);
      const { articles } = job.data;

      let savedCount = 0;
      let failedCount = 0;

      for (const articleData of articles) {
        try {
          const exists = await this.articleRepository.findOne({
            where: { articleLink: articleData.articleLink },
          });

          if (exists) {
            this.logger.debug(
              `Skipping existing article: ${articleData.articleLink}`,
            );
            continue;
          }

          const newArticle = this.articleRepository.create({
            ...articleData, // Spread all fields from articleData
          });

          try {
            const savedArticle = await this.articleRepository.save(newArticle);
            this.logger.debug(`Saved article: ${savedArticle.articleLink}`);
            savedCount++;
          } catch (saveError) {
            this.logger.error(
              `Database save failed for article ${articleData.articleLink}: ${saveError.message}`,
            );
            failedCount++;
          }
        } catch (articleError) {
          this.logger.error(
            `Failed to process article ${articleData.articleLink}: ${articleError.message}`,
          );
          failedCount++;
        }
      }

      this.logger.log(
        `Job ${job.id} completed. Saved: ${savedCount}, Failed: ${failedCount}, Total: ${articles.length}`,
      );

      return { savedCount, failedCount, total: articles.length };
    } catch (error) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`);
      throw error;
    }
  }
}
