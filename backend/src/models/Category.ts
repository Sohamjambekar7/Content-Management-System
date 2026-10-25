import { BelongsTo, Column, DataType, ForeignKey, HasMany, Model, Table } from "sequelize-typescript";
import { User } from "./User";
import { Post } from "./Post";


@Table
export class Category extends Model<Category>{
    @Column({
        type: DataType.STRING,
        unique: true,
        allowNull: false
    })
    name?: string

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

    @BelongsTo(()=>User)
    user?: User;

    @HasMany(()=>Post)
    posts: Post[] = []
}