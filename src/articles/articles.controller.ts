import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { PaginationDto } from './dto/pagination.dto';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  findAll(@Query(ValidationPipe) paginationDto: PaginationDto) {
    return this.articlesService.findAll(paginationDto);
  }
}
