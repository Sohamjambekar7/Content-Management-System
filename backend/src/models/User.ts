import { Table, Column, Model, DataType, HasMany } from 'sequelize-typescript';
import { Post } from './Post.js';
import { Comment } from './Comment.js';
import { Token } from './Token.js';

@Table({
  tableName: 'Users',
  timestamps: true
})
export class User extends Model {

  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true
  })
  declare id: number;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  declare name: string;

  @Column({
    type: DataType.STRING,
    unique: true,
    allowNull: false
  })
  declare email: string;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  declare password: string;

  @HasMany(() => Post)
  posts!: Post[];

  @HasMany(()=>Comment)
  comments: Comment[]=[]

  @HasMany(()=>Token)
  tokens: Token[]=[]

}