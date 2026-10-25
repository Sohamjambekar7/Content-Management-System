import { BelongsTo, BelongsToMany, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { Post } from "./Post";
import { PostTag } from "./PostTag";
import { User } from "./User";


@Table
export class Tag extends Model<Tag>{


    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    name?: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
        unique: true
    })
    slug?: string
     

    @ForeignKey(()=>User)
    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    userId?: number;


    @BelongsToMany(()=>Post, ()=>PostTag)
    posts: Post[] = [] 

    @BelongsTo(()=>User)
    user?: User;


}