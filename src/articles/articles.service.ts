import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Article } from './entities/article.entity';
import { Repository } from 'typeorm';
import { PaginationDto } from './dto/pagination.dto';
import { PaginatedResponse } from './interface/pagination-response.interface';

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
  ) {}

  async findAll(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponse<Article>> {
    const {
      page = 1,
      limit = 21,
      title,
      description,
      publisherId,
    } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.articleRepository
      .createQueryBuilder('article')
      .leftJoinAndSelect('article.publisher', 'publisher')
      .select([
        'article',
        'publisher.title',
        'publisher.title as publisherTitle',
      ])
      .orderBy('article.publishedAt', 'DESC');

    if (title) {
      queryBuilder.andWhere('article.title ILIKE :title', {
        title: `%${title}%`,
      });
    }

    if (description) {
      queryBuilder.andWhere('article.description ILIKE :description', {
        description: `%${description}%`,
      });
    }

    if (publisherId) {
      queryBuilder.andWhere('article.publisherId = :publisherId', {
        publisherId,
      });
    }

    const [rawData, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const data = rawData.map((article) => ({
      ...article,
      publisherTitle: article.publisher.title,
      publisher: undefined,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
