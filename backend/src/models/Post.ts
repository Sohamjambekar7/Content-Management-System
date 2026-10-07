import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany, BelongsToMany } from 'sequelize-typescript';
import { User } from './User.js';
import { Comment } from './Comment.js';
import { PostTag } from './PostTag.js';
import { Tag } from './Tag.js';

@Table({
  tableName: 'Posts',
  timestamps: true
})
export class Post extends Model {

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
  declare title: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true
  })
  declare content: string;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  declare customId: string;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  declare slug: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,     // ← This was missing
    allowNull: false
  })
  declare userId: number;

  @BelongsTo(() => User)
  declare user: User;

  @HasMany(()=>Comment)
  comments: Comment[]=[]

  @BelongsToMany(()=>Tag,()=>PostTag)
  tags: Tag[]=[]
}