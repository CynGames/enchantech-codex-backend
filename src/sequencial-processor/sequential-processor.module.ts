import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article } from '../articles/entities/article.entity';
import { SequentialProcessorService } from './sequential-processor.service';

@Module({
  imports: [TypeOrmModule.forFeature([Article])],
  providers: [SequentialProcessorService],
  exports: [SequentialProcessorService],
})
export class SequentialProcessorModule {}
