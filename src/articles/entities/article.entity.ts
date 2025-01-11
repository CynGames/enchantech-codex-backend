import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Publisher } from '../../rss-parser/entities/publisher.entity';

@Entity({ name: 'articles' })
export class Article {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  publisherId: number;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  imageLink: string;

  @Column()
  articleLink: string;

  @Column()
  parseAttempted: boolean;

  @Column()
  publishedAt: Date;

  @ManyToOne(() => Publisher)
  @JoinColumn({ name: 'publisherId' })
  publisher: Publisher;
}
