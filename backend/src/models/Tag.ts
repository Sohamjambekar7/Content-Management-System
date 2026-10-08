import { BelongsTo, BelongsToMany, ForeignKey } from "sequelize-typescript";
import { Column, Model, Table, DataType } from "sequelize-typescript";
import { Post } from './Post.js';
import { PostTag } from './PostTag.js';
import { User } from "./User.js";

@Table
export class Tag extends Model<Tag>{


    @Column({
    type: DataType.STRING,
    allowNull: true,
    })
    name?: string;


    @ForeignKey(()=>User)
    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    userId?: number;

    @BelongsToMany(()=>Post, ()=>PostTag)
    posts: Post[]=[]

    @BelongsTo(()=>User)
    user?: User;
}