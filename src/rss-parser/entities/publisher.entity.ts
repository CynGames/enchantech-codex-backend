import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Article } from '../../articles/entities/article.entity';

@Entity({ name: 'publishers' })
export class Publisher {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  rssLink: string;

  @OneToMany(() => Article, (article) => article.publisher)
  articles: Article[];
}
