import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article } from '../articles/entities/article.entity';
import { QueueProcessorService } from './queue-processor.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'article-processing',
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 1,
        backoff: {
          type: 'exponential',
          delay: 1000, // Start with 1 second delay
        },
      },
      settings: {
        maxStalledCount: 0, // Disable stalled job checks
        lockDuration: 10000, // 30 seconds lock duration
        drainDelay: 300, // 300ms between processing jobs
      },
    }),
    TypeOrmModule.forFeature([Article]),
  ],
  providers: [QueueProcessorService],
  exports: [QueueProcessorService],
})
export class QueueProcessorModule {}
