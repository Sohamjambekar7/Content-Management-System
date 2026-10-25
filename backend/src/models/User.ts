import { Column, DataType, Default, HasMany, Model, Table } from "sequelize-typescript";
import { Post } from "./Post";
import { Comment } from "./Comment";
import { Token } from "./Token";
import { Category } from "./Category";
import { Tag } from "./Tag";

@Table
export class User extends Model<User> {
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name?: string;

  @Column({
    type: DataType.STRING,
    unique: true,
    allowNull: false,
  })
  email?: string;

  @Default('active') // Changed to active by default so new/existing logins work immediately
  @Column({
    allowNull: false,
    type: DataType.ENUM('active', 'pending')
  })
  status?: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  password?: string;

  @HasMany(() => Post)
  posts: Post[] = [];

  @HasMany(() => Comment)
  comments: Comment[] = [];

  @HasMany(() => Token)
  tokens: Token[] = [];

  @HasMany(() => Category as any)
  categories: Category[] = [];

  @HasMany(() => Tag)
  tags: Tag[] = [];
}