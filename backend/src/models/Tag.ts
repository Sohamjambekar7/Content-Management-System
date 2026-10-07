import { BelongsToMany } from "sequelize-typescript";
import { Column, Model, Table, DataType } from "sequelize-typescript";
import { Post } from './Post.js';
import { PostTag } from './PostTag.js';

@Table
export class Tag extends Model<Tag>{


    @Column({
    type: DataType.STRING,
    allowNull: true,
    })
    name?: string;


    @BelongsToMany(()=>Post, ()=>PostTag)
    posts: Post[]=[]
}